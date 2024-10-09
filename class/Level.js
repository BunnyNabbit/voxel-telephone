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

class Command {
	constructor(layout, level, enums = {}) {
		this.level = level
		this.layout = layout
		this.enums = enums
	}
	setBlock(position, block) {
		if (this.level.loading) {
			this.level.rawSetBlock(position, block)
		} else {
			this.level.setBlock(position, block, [], false)
		}
	}
	parseBytes(actionBytes) {
		const data = {}
		let indexOffset = 0
		this.layout.forEach((layout, index) => {
			layout = layout.split(":")
			const name = layout[1]
			const type = layout[0]
			if (type.includes("enum")) {
				data[name] = this.enums[name][actionBytes[index + indexOffset]]
			} else if (type.includes("position")) {
				data[name] = [
					actionBytes[index + indexOffset],
					actionBytes[index + indexOffset + 1],
					actionBytes[index + indexOffset + 2]
				]
				indexOffset += 2
			} else {
				data[name] = actionBytes[index + indexOffset]
			}
		})
		return data
	}
}

class Cuboid extends Command {
	name = "cuboid"
	static help = ["Cuboid, makes a cuboid on two positions.", "If no arguments are added, block is inferred from your current hand and the server will ask for the block positions interactively."]
	static aliases = ["z"]
	constructor(level) {
		super(["block:block", "&enum:mode", "position:position1", "position:position2"], level, {
			mode: ["soild", "hollow", "walls", "holes", "wire"]
		})
	}
	action(data) {
		data = this.parseBytes(data)
		const min = [0, 1, 2].map(index => Math.min(data.position1[index], data.position2[index]))
		const max = [0, 1, 2].map(index => Math.max(data.position1[index], data.position2[index]))
		const block = data.block
		const mode = data.mode
		for (let x = min[0]; x <= max[0]; x++) {
			for (let y = min[1]; y <= max[1]; y++) {
				for (let z = min[2]; z <= max[2]; z++) {
					this.setBlock([x, y, z], block)
				}
			}
		}
	}
}

const commands = [Cuboid]
const Drone = require("./Drone.js")

class Level extends require("events") {
	constructor(bounds, blocks) {
		super()
		this.clients = []
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
	messageAll(message) {
		this.clients.forEach(client => {
			client.message(message, 0)
		})
	}
	sendDrones(client) {
		this.drones.forEach(drone => {
			client.droneTransmitter.addDrone(drone)
		})
	}
	removeClient(client) {
		client.space = null
		const index = this.clients.indexOf(client)
		if (index) this.clients.splice(index, 1)
		if (index !== -1) this.clients.splice(index, 1)
		const drone = this.clientDrones.get(client)
		this.clientDrones.delete(client)
		this.removeDrone(drone)
		client.droneTransmitter.clearDrones()
		this.emit("clientRemoved", client)
	}
	removeDrone(drone) {
		drone.destroy()
		this.drones.delete(drone)
	}
	addDrone(drone) {
		this.clients.forEach(otherClient => {
			otherClient.droneTransmitter.addDrone(drone)
		})
		this.drones.add(drone)
	}
	addClient(client, position = [0, 0, 0], orientation = [0, 0]) {
		this.emit("clientAdded", client)
		client.space = this
		this.loadClient(client, position, orientation)
		this.sendDrones(client)
		const drone = new Drone({ name: "&7" + client.authInfo.username })
		this.clientDrones.set(client, drone)
		this.addDrone(drone)
		this.clients.push(client)
	}
	loadClient(client, position = [0, 0, 0], orientation = [0, 0]) {
		client.loadLevel(this.blocks, this.bounds[0], this.bounds[1], this.bounds[2], false, () => {
			client.setClickDistance(10000)
		}, () => {
			if (this.blockset) sendBlockset(client, this.blockset)
			if (this.environment) client.setEnvironmentProperties(this.environment)
			if (this.texturePackUrl) client.texturePackUrl(this.texturePackUrl)
			client.setBlockPermission(7, 1, 1)
			client.setBlockPermission(8, 1, 1)
			client.setBlockPermission(9, 1, 1)
			client.setBlockPermission(10, 1, 1)
			client.setBlockPermission(11, 1, 1)
			client.configureSpawnExt(-1, client.authInfo.username, position[0], position[1], position[2], orientation[0], orientation[1], client.authInfo.username)
		})
	}
	reload() {
		this.clients.forEach(client => {
			this.loadClient(client, client.position, client.orientation)
		})
	}
	setBlock(position, block, excludeClients = [], saveToRecord = true) {
		this.blocks.writeUInt8(block, position[0] + this.bounds[0] * (position[2] + this.bounds[2] * position[1]))
		// callback(block, position[0], position[1], position[2])
		this.clients.forEach(client => {
			if (!excludeClients.includes(client)) {
				client.setBlock(block, position[0], position[1], position[2])
			}
		})
		if (saveToRecord) {
			this.changeRecord.addBlockChange(position, block)
			if (!this.changeRecord.draining && this.changeRecord.currentActionCount > 1024) {
				this.changeRecord.flushChanges().then((bytes) => {
					this.messageAll(`Changes drained. ${bytes} bytes saved to VHS record`, 0)
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
	interpretCommand(command = "cuboid 1", client = null, actionBytes = []) { // i.e: cuboid 1
		// consider: if the blockset has names, user could refer to blocks by name and not just id.
		command = command.split(" ")
		const commandName = command[0].toLowerCase()
		let commandClass = commands.find(otherCommand => otherCommand.name.toLowerCase() == commandName)
		if (!commandClass) {
			commandClass = commands.find(otherCommand => otherCommand.aliases.includes(commandName))
		}
		if (commandClass) {
			this.blocking = true
			this.currentCommand = new commandClass(this)
			this.currentCommandLayoutIndex = 0
			this.currentCommandActionBytes = []
			// atm, we don't parse the command for bytes. start interactive now
			this.inferCurrentCommand()
		} else {
			this.messageAll(`Unable to find command with name ${commandName} for level ${this.name}`, 0)
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
				if (this.clients[0]) {
					heldBlock = this.clients[0].heldBlock
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
					this.messageAll(`Place or break a block to mark the position for ${currentType}`, 0)
				return
			}
		}
		this.messageAll(`Command needs ${currentType}, and it doesn't seem implemented :(`, 0)
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
		if (this.loading == false) this.changeRecord.appendAction(true, this.currentCommandActionBytes, command.name)
		if (!this.changeRecord.draining && this.changeRecord.currentActionCount > 1024) {
			this.changeRecord.flushChanges().then((bytes) => {
				this.messageAll(`Changes drained. ${bytes} bytes saved to VHS record`, 0)
			})
		}
		this.currentCommand = null
	}
	toggleVcr() {
		this.inVcr = true
	}
	userHasPermission(username) {
		if (this.allowList.length == 0) return true
		if (this.allowList.includes(username)) return true
		return false
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