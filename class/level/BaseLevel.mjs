import { Drone } from "./drone/Drone.mjs"
import { Ego } from "./drone/Ego.mjs"
import { TypedEmitter } from "tiny-typed-emitter"
import { componentToHex } from "../../utils.mjs"
import { EmptyTemplate } from "./BaseTemplate.mjs"
import { NullChangeRecord } from "../level/changeRecord/NullChangeRecord.mjs"
import { ChangeRecord } from "./changeRecord/ChangeRecord.mjs"
import { BaseLevelCommandInterpreter } from "./BaseLevelCommandInterpreter.mjs"
/** @typedef {import("../player/BasePlayer.mjs").BasePlayer} BasePlayer */
/** @typedef {import("../../types/arrayLikes.mjs").Vector3} Vector3 */
/** @typedef {import("../../types/arrayLikes.mjs").Vector2} Vector2 */
/** @typedef {import("classicborne-server-protocol/class/Client.mjs").Client} Client */
/** @typedef {import("./levelCommands.mjs").LevelCommand} LevelCommand */

/**@todo Yet to be documented.
 * @extends {TypedEmitter<{"playerAdded": (player: Player) => void "playerRemoved": (player: Player) => void "loaded": () => void "unloaded": () => void "levelLoaded": () => void}>}
 */
export class BaseLevel extends TypedEmitter {
	/**@todo Yet to be documented.
	 * @param {Vector3} bounds
	 * @param {Buffer} blocks
	 */
	constructor(bounds, blocks) {
		super()
		this.players = []
		this.bounds = bounds
		this.blocks = blocks
		this.allowList = []
		this.drones = new Set()
		this.clientDrones = new Map()
		this.commandInterpreter = new this.constructor.commandInterpreterClass(this)
	}
	/**@todo Yet to be documented.
	 * @param {BasePlayer} player
	 */
	sendDrones(player) {
		this.drones.forEach((drone) => {
			player.droneTransmitter.addDrone(drone)
		})
	}
	/**Removes a player from the level.
	 * @param {BasePlayer} player - The player to be removed.
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
		this.players.forEach((player) => {
			player.droneTransmitter.addDrone(drone)
		})
		this.drones.add(drone)
	}
	/**Adds a player to the level.
	 * @param {BasePlayer} player - The player to be added.
	 */
	addPlayer(player, position = [0, 0, 0], orientation = [0, 0]) {
		this.emit("playerAdded", player)
		player.space = this
		this.loadPlayer(player, position, orientation)
		this.sendDrones(player)
		const drone = new Drone(new Ego({ name: "&7" + player.authInfo.username }))
		this.clientDrones.set(player.client, drone)
		this.addDrone(drone)
		this.players.push(player)
		player.teleporting = false
	}
	/**@todo Yet to be documented.
	 * @param {BasePlayer} player
	 * @param {Vector3} [position=[0,0,0]]
	 * @param {Vector2} [orientation=[0,0]]
	 */
	loadPlayer(player, position = [0, 0, 0], orientation = [0, 0]) {
		player.client.loadLevel(
			this.blocks,
			...this.bounds,
			false,
			() => {
				player.client.setClickDistance(10000)
				player.emit("levelLoaded")
			},
			() => {
				if (this.blockset) BaseLevel.sendBlockset(player.client, this.blockset)
				if (this.environment) player.client.setEnvironmentProperties(this.environment)
				if (this.texturePackUrl) player.client.texturePackUrl(this.texturePackUrl)
				player.client.setBlockPermission(7, 1, 1)
				player.client.setBlockPermission(8, 1, 1)
				player.client.setBlockPermission(9, 1, 1)
				player.client.setBlockPermission(10, 1, 1)
				player.client.setBlockPermission(11, 1, 1)
				player.client.configureSpawnExt(-1, player.authInfo.username, position[0], position[1], position[2], orientation[0], orientation[1], player.authInfo.username)
			}
		)
	}
	reload() {
		this.players.forEach((player) => {
			const reloadedPosition = Array.from(player.position)
			const heightOffset = 22 / 32 // Player spawn height is different from reported height. Offset by # fixed-point units.
			reloadedPosition[1] -= heightOffset
			this.loadPlayer(player, reloadedPosition, player.orientation)
			player.droneTransmitter.resendDrones()
		})
	}
	/**@todo Yet to be documented.
	 * @param {number} block
	 * @param {Vector3} position
	 * @param {BasePlayer[]} [excludePlayers=[]]
	 * @param {boolean} [saveToRecord=true]
	 */
	setBlock(position, block, excludePlayers = [], saveToRecord = true) {
		this.blocks.writeUInt8(block, position[0] + this.bounds[0] * (position[2] + this.bounds[2] * position[1]))
		this.players.forEach((player) => {
			if (!excludePlayers.includes(player)) player.client.setBlock(block, ...position)
		})
		if (saveToRecord) {
			this.changeRecord.addBlockChange(position, block)
			if (!this.changeRecord.draining && this.changeRecord.currentActionCount > 1024) this.changeRecord.flushChanges()
		}
	}
	/**@todo Yet to be documented.
	 * @param {Vector3} position
	 * @param {number} block
	 */
	rawSetBlock(position, block) {
		this.blocks.writeUInt8(block, position[0] + this.bounds[0] * (position[2] + this.bounds[2] * position[1]))
	}
	/**@todo Yet to be documented.
	 * @param {Vector3} position
	 * @returns {number}
	 */
	getBlock(position) {
		return this.blocks.readUInt8(position[0] + this.bounds[0] * (position[2] + this.bounds[2] * position[1]))
	}
	/**@todo Yet to be documented.
	 * @param {Vector3} position
	 * @returns {boolean}
	 */
	withinLevelBounds(position) {
		if (position.some((num) => isNaN(num))) return false
		if (position[0] < 0 || position[1] < 0 || position[2] < 0) return false
		if (position[0] >= this.bounds[0] || position[1] >= this.bounds[1] || position[2] >= this.bounds[2]) return false
		return true
	}
	/**@todo Yet to be documented.
	 * @param {string} username
	 * @returns {boolean}
	 */
	userHasPermission(username) {
		if (this.allowList.length == 0) return true
		if (this.allowList.includes(username)) return true
		return false
	}
	/**@todo Yet to be documented.
	 * @param {string} command
	 * @returns {LevelCommand} The command class, or `null` if not found.
	 */
	static getCommandClassFromName(command) {
		command = command.split(" ")
		const commandName = command[0].toLowerCase()
		let commandClass = this.commands.find((otherCommand) => otherCommand.name.toLowerCase() == commandName)
		if (!commandClass) commandClass = this.commands.find((otherCommand) => otherCommand.aliases.includes(commandName))
		return commandClass
	}
	/**Destroys the level, releasing any resources used for it.
	 * @param {boolean} [saveChanges=true]
	 */
	async dispose(saveChanges = true) {
		if (!this.changeRecord.draining && this.changeRecord.dirty && saveChanges) {
			await this.changeRecord.flushChanges()
		}
		await this.changeRecord.dispose()
		this.emit("unloaded")
		this.removeAllListeners()
		this.commandInterpreter.dispose()
	}
	/**@todo Yet to be documented.
	 * @param {Client} client
	 * @param	{number[][]} blockset
	 */
	static sendBlockset(client, blockset) {
		for (let i = 0; i < blockset.length; i++) {
			let walkSound = 5
			let texture = 79
			if (blockset[i][3] == 3) {
				walkSound = 6
				texture = 51
			}
			const block = {
				id: i + 1,
				name: `${blockset[i]
					.slice(0, 3)
					.map((component) => componentToHex(component))
					.join("")}#`,
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
				transmitLight: 1,
			}
			client.defineBlock(block)
			client.defineBlockExt(block)
		}
	}
	/**Loads a level into a universe instance, creating it if it doesn't exist.
	 * @param {BaseUniverse} universe - The universe to load the level into.
	 * @param {string} spaceName - The identifier of zhe level.
	 * @param {Object} defaults - The default properties for the level.
	 * @returns {Promise<BaseLevel>} A promise that resolves to the loaded level.
	 */
	static async loadIntoUniverse(universe, spaceName, defaults) {
		const cached = universe.levels.get(spaceName)
		if (cached) return cached
		const bounds = defaults.bounds ?? this.bounds
		const template = defaults.template ?? this.template
		const templateBlocks = Buffer.from(await template.generate(bounds))
		const promise = new Promise((resolve) => {
			const levelClass = defaults.levelClass ?? this
			const level = new levelClass(bounds, templateBlocks, ...(defaults.arguments ?? []))
			level.template = template
			level.name = spaceName
			level.blockset = defaults.blockset ?? this.blockset
			level.environment = defaults.environment ?? this.environment
			level.texturePackUrl = defaults.texturePackUrl ?? universe.serverConfiguration.texturePackUrl
			level.allowList = defaults.allowList ?? []
			level.universe = universe
			let changeRecordClass = ChangeRecord
			if (defaults.useNullChangeRecord) changeRecordClass = NullChangeRecord
			level.changeRecord = new changeRecordClass(`./blockRecords/${spaceName}/`, async () => {
				await level.changeRecord.restoreBlockChangesToLevel(level)
				level.emit("loaded")
				resolve(level)
			})
		})
		universe.levels.set(spaceName, promise)
		return promise
	}
	/**Teleports zhe player into zhe level. If level currently doesn't exist in universe, it'll be created.
	 * Levels extending Level are expected to override zhis mezhod using zhis pattern:
	 * ```js
	 *  static async teleportPlayer(player, spaceName) {
	 *  	if (super.teleportPlayer(player) === false) return // Removes player from any levels zhey are in. If it returns false, zhe player is still being teleported somewhere.
	 *  	Level.loadIntoUniverse(player.universe, spaceName, { // Create zhe level using its desired defaults.
	 * 		levelClass: HubLevel,
	 *  	}).then(async (level) => { // Add player after it loads.
	 *  		level.addPlayer(player, [60, 8, 4], [162, 254])
	 *  	})
	 *  }
	 * ```
	 * @param {BasePlayer} player - Zhe player to teleport.
	 * @param {string?} [spaceName]
	 * @param {{}?} [defaults={}]
	 */
	static async teleportPlayer(player, spaceName, defaults = {}) {
		if (player) {
			if (player.teleporting == true) return false
			player.teleporting = true
			if (player.space) player.space.removePlayer(player)
		}

		if (this === BaseLevel) {
			BaseLevel.loadIntoUniverse(player.universe, spaceName, defaults).then(async (level) => {
				level.addPlayer(player, [60, 8, 4], [162, 254])
			})
		}
	}
	/** @type {Vector3} */
	static bounds = [64, 64, 64]
	static environment = {
		sidesId: 7,
		edgeId: 250,
		edgeHeight: 0,
		cloudsHeight: 256,
	}
	static blockset = []
	static template = new EmptyTemplate()
	/**
	 * @see `Level.bounds`
	 * @deprecated
	 */
	static standardBounds = this.bounds
	static commands = []
	static commandInterpreterClass = BaseLevelCommandInterpreter
}

// export default BaseLevel
