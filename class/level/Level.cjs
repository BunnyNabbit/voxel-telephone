function componentToHex(component) {
	var hex = component.toString(16).toUpperCase()
	return hex.length == 1 ? "0" + hex : hex
}

const levelCommands = require("./levelCommands.cjs").commands
const { textSymbols } = require("../../constants.cjs")
const Drone = require("./drone/Drone.cjs")
const Ego = require("./drone/Ego.cjs")

class Level extends require("events") {
	static commands = levelCommands
	constructor(bounds, blocks) {
		super()
		this.players = []
		this.bounds = bounds
		this.blocks = blocks
		this.loading = false
		this.inVcr = false
		this.allowList = []
		this.portals = []
		this.drones = new Set()
		this.clientDrones = new Map()
		this.blocking = false
		this.addListener("click", (player, click) => {
			if (click.type == "double") {
				player.emit("playSound", player.universe.sounds.abort)
			} else {
				player.emit("playSound", player.universe.sounds.click)
			}
		})
	}
	messageAll(message, types = [0]) {
		this.players.forEach(player => {
			player.message(message, types)
		})
		this.playSound("toggle")
	}
	sendDrones(player) {
		this.drones.forEach(drone => {
			player.droneTransmitter.addDrone(drone)
		})
	}
	/**Removes a player from the level.
	 * @param {Player} player - The player to be removed.
	 */
	removePlayer(player) {
		player.space = null
		const index = this.players.indexOf(player)
		if (index !== -1) this.players.splice(index, 1)
		const drone = this.clientDrones.get(player.client)
		this.clientDrones.delete(player.client)
		this.removeDrone(drone)
		player.droneTransmitter.clearDrones()
		this.emit("playerRemoved", player)
	}
	/**Removes a drone from the level.
	 * @param {Drone} drone - The drone to be removed.
	 */
	removeDrone(drone) {
		drone.destroy()
		this.drones.delete(drone)
	}
	/**Adds a drone to the level.
	 * @param {Drone} drone - The drone to be added.
	 */
	addDrone(drone) {
		this.players.forEach(player => {
			player.droneTransmitter.addDrone(drone)
		})
		this.drones.add(drone)
	}
	addPlayer(player, position = [0, 0, 0], orientation = [0, 0]) {
		this.emit("playerAdded", player)
		player.space = this
		this.loadPlayer(player, position, orientation)
		this.sendDrones(player)
		const drone = new Drone(new Ego({ name: "&7" + player.authInfo.username }))
		this.clientDrones.set(player.client, drone)
		this.addDrone(drone)
		this.players.push(player)
	}
	loadPlayer(player, position = [0, 0, 0], orientation = [0, 0]) {
		player.client.loadLevel(this.blocks, this.bounds[0], this.bounds[1], this.bounds[2], false, () => {
			player.client.setClickDistance(10000)
			player.emit("levelLoaded")
		}, () => {
			if (this.blockset) Level.sendBlockset(player.client, this.blockset)
			if (this.environment) player.client.setEnvironmentProperties(this.environment)
			if (this.texturePackUrl) player.client.texturePackUrl(this.texturePackUrl)
			player.client.setBlockPermission(7, 1, 1)
			player.client.setBlockPermission(8, 1, 1)
			player.client.setBlockPermission(9, 1, 1)
			player.client.setBlockPermission(10, 1, 1)
			player.client.setBlockPermission(11, 1, 1)
			player.client.configureSpawnExt(-1, player.authInfo.username, position[0], position[1], position[2], orientation[0], orientation[1], player.authInfo.username)
		})
	}
	reload() {
		this.players.forEach(player => {
			const reloadedPosition = Array.from(player.position)
			const heightOffset = 22 / 32 // Player spawn height is different from reported height. Offset by # fixed-point units.
			reloadedPosition[1] -= heightOffset
			this.loadPlayer(player, reloadedPosition, player.orientation)
			player.droneTransmitter.resendDrones()
		})
	}
	setBlock(position, block, excludePlayers = [], saveToRecord = true) {
		this.blocks.writeUInt8(block, position[0] + this.bounds[0] * (position[2] + this.bounds[2] * position[1]))
		// callback(block, position[0], position[1], position[2])
		this.players.forEach(player => {
			if (!excludePlayers.includes(player)) {
				player.client.setBlock(block, position[0], position[1], position[2])
			}
		})
		if (saveToRecord) {
			this.changeRecord.addBlockChange(position, block)
			if (!this.changeRecord.draining && this.changeRecord.currentActionCount > 1024) {
				this.changeRecord.flushChanges().then((bytes) => {
					this.messageAll(`Changes drained. ${bytes} bytes saved to VHS record`)
				})
			}
		}
	}
	rawSetBlock(position, block) {
		this.blocks.writeUInt8(block, position[0] + this.bounds[0] * (position[2] + this.bounds[2] * position[1]))
	}
	getBlock(position) {
		return this.blocks.readUInt8(position[0] + this.bounds[0] * (position[2] + this.bounds[2] * position[1]))
	}
	interpretCommand(command = "cuboid 1", player = null, actionBytes = []) { // i.e: cuboid 1
		// consider: if the block set has names, user could refer to blocks by name and not just id.
		const commandClass = Level.getCommandClassFromName(command)
		if (commandClass) {
			this.blocking = true
			this.currentCommand = new commandClass(this)
			this.currentCommandLayoutIndex = 0
			this.currentCommandActionBytes = actionBytes
			// parse command for bytes
			const splitCommand = command.split(" ").slice(1)
			if (splitCommand.length) {
				this.processCommandArguments(splitCommand, player)
			} else {
				this.inferCurrentCommand(null, player)
			}
		} else if (command) {
			const commandName = command.toLowerCase()
			this.messageAll(`Unable to find command with name ${commandName} for level ${this.name}`)
		}
	}
	inferCurrentCommand(providedData = null, player = null) {
		const currentType = this.currentCommand.layout[this.currentCommandLayoutIndex]
		if (currentType == null) {
			return this.commitAction(player)
		}
		if (currentType.startsWith("&")) {
			// TODO: infer byte type size: i.e: the zero element is a position, and would need three action bytes.
			this.currentCommandLayoutIndex++
			this.currentCommandActionBytes.push(0)
			return this.inferCurrentCommand(null, player)
		}
		const type = currentType.split(":")[0]

		if (type == "block") {
			// if it is the first, infer by block being held by player. if the player somehow doesn't exist, assume air (0)
			// to consider: maybe instead of being the first, could be inferred by the layout type modifier instead.
			if (this.currentCommandLayoutIndex == 0) {
				let heldBlock = 0
				if (this.players[0]) {
					heldBlock = this.players[0].heldBlock
				}
				this.currentCommandLayoutIndex++
				this.currentCommandActionBytes.push(heldBlock)
				return this.inferCurrentCommand(null, player)
			}
		}
		if (type == "position") {
			if (Array.isArray(providedData) && providedData.length == 3) {
				this.currentCommandActionBytes.push(providedData[0])
				this.currentCommandActionBytes.push(providedData[1])
				this.currentCommandActionBytes.push(providedData[2])
				this.currentCommandLayoutIndex++
				this.inferCurrentCommand(null, player)
				return "inferred position"
			} else {
				if (!this.loading)
					this.messageAll(`Place or break a block to mark the position for ${currentType}`)
				return
			}
		}
		this.messageAll(`Command needs ${currentType}, and it doesn't seem implemented :(`)
	}
	static getCommandClassFromName(command) {
		command = command.split(" ")
		const commandName = command[0].toLowerCase()
		let commandClass = Level.commands.find(otherCommand => otherCommand.name.toLowerCase() == commandName)
		if (!commandClass) {
			commandClass = Level.commands.find(otherCommand => otherCommand.aliases.includes(commandName))
		}
		return commandClass
	}
	withinLevelBounds(position) {
		if (position[0] < 0 || position[1] < 0 || position[2] < 0) return false
		if (position[0] >= this.bounds[0] || position[1] >= this.bounds[1] || position[2] >= this.bounds[2]) return false
		return true
	}
	processCommandArguments(splitCommand, player) {
		let currentIndex = 0
		const incrementIndex = (commandIndex = 1) => {
			this.currentCommandLayoutIndex++
			currentIndex += commandIndex
		}
		const validateByte = (num) => {
			if (isNaN(num)) return false
			if (num < 0) return false
			if (num > 255) return false
			return true
		}
		while (true) {
			const layoutElement = this.currentCommand.layout[this.currentCommandLayoutIndex]
			if (!layoutElement) break
			if (splitCommand[currentIndex] == null) break
			const type = layoutElement.split(":")[0].replace("&", "")
			if (type == "block") {
				let block
				if (splitCommand[currentIndex] == "hand") {
					block = player.heldBlock
					this.currentCommandActionBytes.push(block)
					incrementIndex()
					continue
				}
				block = parseInt(splitCommand[currentIndex])
				if (!validateByte(block)) {
					player.message("Invalid block id")
					break
				}
				this.currentCommandActionBytes.push(block)
				incrementIndex()
				continue
			} else if (type == "position") {
				let position = [0, 1, 2].map(index => parseInt(splitCommand[currentIndex + index]))
				if (position.some(num => !validateByte(num))) {
					player.message("Invalid position")
					break
				}
				if (!this.withinLevelBounds(position)) {
					player.message("Position out of bounds")
					break
				}
				this.currentCommandActionBytes.push(...position)
				incrementIndex(3)
				continue
			} else if (type == "enum") {
				const enumName = layoutElement.split(":")[1]
				const enumValue = splitCommand[currentIndex]
				const attemptByte = parseInt(enumValue)
				if (validateByte(attemptByte) && this.currentCommand.enums[enumName][attemptByte]) { // input is an index
					this.currentCommandActionBytes.push(attemptByte)
					incrementIndex()
					continue
				}
				const index = this.currentCommand.enums[enumName].findIndex((value) => { // find index by enum name
					return value == enumValue
				})
				if (index == -1) {
					break
				}
				this.currentCommandActionBytes.push(index)
				incrementIndex()
				continue
			}
			player.message("" + splitCommand[currentIndex] + " is not a valid argument for " + layoutElement)
			player.message("Entering interactive mode")
			break
		}
		this.inferCurrentCommand(null, player)
	}
	commitAction(player = null) {
		const command = this.currentCommand
		const { requiresRefreshing } = command.action(this.currentCommandActionBytes)
		if (this.loading == false) {
			this.changeRecord.appendAction(true, this.currentCommandActionBytes, command.name)
			this.playSound("poof")
			if (requiresRefreshing) {
				this.reload()
			}
		}
		if (!this.changeRecord.draining && this.changeRecord.currentActionCount > 1024) {
			this.changeRecord.flushChanges().then((bytes) => {
				this.messageAll(`Changes drained. ${bytes} bytes saved to VHS record`)
			})
		}
		if (player && player.repeatMode) {
			this.currentCommandLayoutIndex = 0
			this.currentCommandActionBytes = []
			this.inferCurrentCommand(null, player) // FIXME: possible infinite loop if no command layout exists. check for &
		} else {
			this.currentCommand = null
			this.blocking = false
		}
	}
	toggleVcr() {
		this.inVcr = true
		this.playSound("gameTrackDrone")
		this.setBlinkText(textSymbols.pause)
	}
	userHasPermission(username) {
		if (this.allowList.length == 0) return true
		if (this.allowList.includes(username)) return true
		return false
	}
	playSound(soundName) {
		this.players.forEach(player => {
			player.emit("playSound", player.universe.sounds[soundName])
		})
	}
	/**Sets the text that will blink in the level, or stops blinking if `blinkText` is false.
	 * @param {string|boolean} blinkText - The text to blink, or `false` to stop blinking.
	 * @param {string} [subliminalText] - Optional subliminal text to display when blinking.
	 */
	setBlinkText(blinkText = false, subliminalText) {
		clearInterval(this.blinkInterval)
		if (blinkText === false) {
			this.players.forEach(player => {
				player.message(" ", 100)
			})
			return this.blinkText = null
		}
		let toggle = false
		this.blinkText = subliminalText || blinkText
		const blink = () => {
			toggle = !toggle
			let text = " "
			if (toggle) text = this.blinkText
			this.players.forEach(player => {
				player.message(text, 100)
			})
			this.blinkText = blinkText
		}
		this.blinkInterval = setInterval(blink, 500)
		blink()
	}
	/** Destroys the level, releasing any resources used for it. */
	async dispose(saveChanges = true) {
		if (!this.changeRecord.draining && this.changeRecord.dirty && saveChanges) {
			await this.changeRecord.flushChanges()
		}
		await this.changeRecord.dispose()
		this.emit("unloaded")
		this.removeAllListeners()
	}
	static sendBlockset(client, blockset) {
		for (let i = 0; i < 255; i++) {
			let walkSound = 5
			let texture = 79
			if (blockset[i][3] == 3) {
				walkSound = 6
				texture = 51
			}
			const block = {
				id: i + 1,
				name: `${blockset[i].slice(0, 3).map(component => componentToHex(component)).join("")}#`,
				fogDensity: 127,
				fogR: blockset[i][0],
				fogG: blockset[i][1],
				fogB: blockset[i][2],
				draw: blockset[i][3],
				walkSound,
				topTexture: texture,
				leftTexture: texture,
				rightTexture: texture,
				frontTexture: texture,
				backTexture: texture,
				bottomTexture: texture,
				transmitLight: 1
			}
			client.defineBlock(block)
			client.defineBlockExt(block)
		}
	}
	static standardBounds = [64, 64, 64]
}
module.exports = Level