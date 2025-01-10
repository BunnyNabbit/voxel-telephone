function componentToHex(component) {
	var hex = component.toString(16).toUpperCase()
	return hex.length == 1 ? "0" + hex : hex
}

function sendBlockset(client, blockset) {
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
		// client.setInventoryOrder(i + 1, 0)
	}
}

const levelCommands = require("./levelCommands.js").commands
const Drone = require("./Drone.js")

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
	removePlayer(player) {
		player.space = null
		const index = this.players.indexOf(player)
		if (index) this.players.splice(index, 1)
		if (index !== -1) this.players.splice(index, 1)
		const drone = this.clientDrones.get(player.client)
		this.clientDrones.delete(player)
		this.removeDrone(drone)
		player.droneTransmitter.clearDrones()
		this.emit("playerRemoved", player)
	}
	removeDrone(drone) {
		drone.destroy()
		this.drones.delete(drone)
	}
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
		const drone = new Drone({ name: "&7" + player.authInfo.username })
		this.clientDrones.set(player.client, drone)
		this.addDrone(drone)
		this.players.push(player)
	}
	loadPlayer(player, position = [0, 0, 0], orientation = [0, 0]) {
		player.client.loadLevel(this.blocks, this.bounds[0], this.bounds[1], this.bounds[2], false, () => {
			player.client.setClickDistance(10000)
			player.emit("levelLoaded")
		}, () => {
			if (this.blockset) sendBlockset(player.client, this.blockset)
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
			this.loadPlayer(player, player.position, player.orientation)
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
		// consider: if the blockset has names, user could refer to blocks by name and not just id.
		const commandClass = Level.getCommandClassFromName(command)
		if (commandClass) {
			this.blocking = true
			this.currentCommand = new commandClass(this)
			this.currentCommandLayoutIndex = 0
			this.currentCommandActionBytes = []
			// atm, we don't parse the command for bytes. start interactive now
			this.inferCurrentCommand()
		} else if (command) {
			const commandName = command.toLowerCase()
			this.messageAll(`Unable to find command with name ${commandName} for level ${this.name}`)
		}
	}
	inferCurrentCommand(providedData = 0) {
		const currentType = this.currentCommand.layout[this.currentCommandLayoutIndex]
		if (currentType == null) {
			return this.commitAction()
		}
		if (currentType.startsWith("&")) {
			// TODO: infer byte type size: i.e: the zero element is a position, and would need three action bytes.
			this.currentCommandLayoutIndex++
			this.currentCommandActionBytes.push(0)
			return this.inferCurrentCommand()
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
				return this.inferCurrentCommand()
			}
		}
		if (type == "position") {
			if (Array.isArray(providedData) && providedData.length == 3) {
				this.currentCommandActionBytes.push(providedData[0])
				this.currentCommandActionBytes.push(providedData[1])
				this.currentCommandActionBytes.push(providedData[2])
				this.currentCommandLayoutIndex++
				this.inferCurrentCommand()
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
	addActionBytes(splitCommand) {
		let currentIndex = 0
		while (true) {
			const layoutElement = this.currentCommand.layout[this.currentCommandLayoutIndex]
			if (!layoutElement) break
			if (splitCommand[currentIndex] == null) break
		}
	}
	commitAction() {
		this.blocking = false
		const command = this.currentCommand
		command.action(this.currentCommandActionBytes)
		if (this.loading == false) {
			this.changeRecord.appendAction(true, this.currentCommandActionBytes, command.name)
			this.playSound("poof")
		}
		if (!this.changeRecord.draining && this.changeRecord.currentActionCount > 1024) {
			this.changeRecord.flushChanges().then((bytes) => {
				this.messageAll(`Changes drained. ${bytes} bytes saved to VHS record`)
			})
		}
		this.currentCommand = null
	}
	toggleVcr() {
		this.inVcr = true
		this.playSound("gameTrackDrone")
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
	async dispose() {
		if (!this.changeRecord.draining && this.changeRecord.dirty) {
			await this.changeRecord.flushChanges()
		}
		await this.changeRecord.dispose()
		this.emit("unloaded")
		this.removeAllListeners()
	}
}
module.exports = Level