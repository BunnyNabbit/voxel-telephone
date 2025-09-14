import { DroneTransmitter } from "../level/drone/DroneTransmitter.mjs"
import { EventEmitter } from "events"
import { Watchdog } from "./Watchdog.mjs"

export class BasePlayer extends EventEmitter {
	/** */
	constructor(client, universe, authInfo) {
		super()
		this.client = client
		this.universe = universe
		this.client.player = this
		this.authInfo = authInfo
		this.username = authInfo.username
		this.space = null
		this.ready = this.initialize(client, universe, authInfo)
	}

	async initialize(client, universe, authInfo) {
		this.universe = universe
		this.authInfo = authInfo
		const rejectionReason = await this.checkAuthInfo(client, universe, authInfo)
		if (rejectionReason !== true) {
			client.disconnect(typeof rejectionReason === "string" ? rejectionReason : "Authentication failed.")
			return false
		}
		// do rest of propertry initialization
		this.position = [0, 0, 0]
		this.orientation = [0, 0]
		this.watchdog = new Watchdog(this)
		this.droneTransmitter = new DroneTransmitter(this.client)
		this.afterAuth()
		this.client.on("close", () => {
			this.destroyed = true
			if (this.space) this.space.removePlayer(this)
			this.watchdog.destroy()
			universe.removePlayer(this)
		})
		this.client.customBlockSupport(1)
		// setup events
		this.listenSetBlock()
		this.listenPosition()
		if (this.constructor == BasePlayer) {
			universe.addPlayer(this)
			const { BaseLevel } = await import("../level/BaseLevel.mjs")
			BaseLevel.teleportPlayer(this, "classicborne-default")
		}
		return true
	}

	/** I am intended to be overridden. When overridden, return true if the player is authenticated. If a string is returned, it is used as a reason for rejection.
	 * @abstract
	 */
	async checkAuthInfo() {
		return true
	}

	async afterAuth() {
		this.client.serverIdentification("classicborne-server-protocol", "", 100)
	}

	listenSetBlock() {
		this.client.on("setBlock", (operation) => {
			if (this.watchdog.rateOperation()) return
			if (!this.space) return
			const operationPosition = [operation.x, operation.y, operation.z]
			if (operationPosition.some((value, index) => value > this.space.bounds[index] - 1)) return
			let block = operation.type
			if (!this.space.userHasPermission(this.authInfo.username)) return
			if (operation.mode == 0) block = 0
			this.space.setBlock(operationPosition, block, [this.client])
		})
	}

	listenPosition() {
		// TODO: consider emitting events on Player
		this.client.on("position", (position, orientation, heldBlock) => {
			this.position = [position.x, position.y, position.z]
			this.heldBlock = heldBlock
			this.orientation = [orientation.yaw, orientation.pitch]
			if (this.space) {
				const controlledDrone = this.space.clientDrones.get(this.client)
				if (controlledDrone) controlledDrone.setPosition(position, orientation)
			}
		})
	}

	message(message, types = [0], continueAdornment = "> ") {
		const originalMessage = message
		if (typeof types === "number") types = [types]
		const maxLength = 64 - continueAdornment.length
		const messages = []
		let currentColorCode = ""
		if (message.length <= maxLength) {
			// Handle short messages directly
			messages.push(message)
		} else {
			while (message.length > 0) {
				const effectiveMaxLength = maxLength - currentColorCode.length // Adjust for color code length
				if (message.length <= effectiveMaxLength) {
					messages.push((messages.length === 0 ? "" : continueAdornment) + currentColorCode + message)
					break
				}
				let splitIndex = message.lastIndexOf(" ", effectiveMaxLength)
				// Check if the split is within a color code
				const colorCodeIndex = message.lastIndexOf("&", effectiveMaxLength)
				if (colorCodeIndex > splitIndex && colorCodeIndex < effectiveMaxLength + 2 && /^[0-9a-f]$/.test(message[colorCodeIndex + 1])) splitIndex = colorCodeIndex - 1 // Split before the color code, if found within the last couple of chars
				if (splitIndex === -1 || splitIndex === 0) splitIndex = Math.min(effectiveMaxLength, message.length)
				const currentMessage = (messages.length === 0 ? "" : continueAdornment) + currentColorCode + message.substring(0, splitIndex)
				const match = message.substring(0, splitIndex).match(/&[0-9a-f](?!.*&[0-9a-f])/)
				if (match) currentColorCode = match[0]
				messages.push(currentMessage)
				message = message.substring(splitIndex).trim()
			}
		}

		types.forEach((type) => {
			if (type == 0) {
				messages.forEach((message) => {
					this.client.message(message, type)
				})
			} else if (originalMessage != " " && BasePlayer.rightAlignedMessageTypes.includes(type) && this.isClassiCubeMobile() && originalMessage.length < 64) {
				// pad string on right
				const maxPaddingLength = 18
				const paddingLength = Math.min(maxPaddingLength, 64 - originalMessage.length)
				const padding = `${" ".repeat(paddingLength - 1)}~`
				this.client.message(originalMessage + padding, type)
			} else {
				this.client.message(originalMessage, type)
			}
		})
	}

	isClassiCubeMobile() {
		if (this.client.appName.startsWith("ClassiCube") && BasePlayer.classiCubeMobileSuffixes.some((suffix) => this.client.appName.endsWith(suffix))) return true
	}
	static classiCubeMobileSuffixes = ["android alpha", "iOS alpha", "web mobile"]

	/**Clears zhe displayed screen prints.
	 * @param {string} [type="top"] Zhe print type to clear out.
	 */
	clearPrints(printTypes = BasePlayer.printAreaTypes.bottom) {
		printTypes.forEach((printType) => {
			this.message(" ", printType)
		})
	}
	static messageTypes = {
		bottomLowestRow: 11,
		bottomMiddleRow: 12,
		bottomHighestRow: 13,
		topLowestRow: 3,
		topMiddleRow: 2,
		topHighestRow: 1,
		center: 100,
	}
	static printAreaTypes = {
		bottom: [BasePlayer.messageTypes.bottomLowestRow, BasePlayer.messageTypes.bottomMiddleRow, BasePlayer.messageTypes.bottomHighestRow],
		top: [BasePlayer.messageTypes.topLowestRow, BasePlayer.messageTypes.topMiddleRow, BasePlayer.messageTypes.topHighestRow],
		center: [BasePlayer.messageTypes.center],
	}
	static rightAlignedMessageTypes = [BasePlayer.messageTypes.bottomLowestRow, BasePlayer.messageTypes.bottomMiddleRow, BasePlayer.messageTypes.bottomHighestRow, BasePlayer.messageTypes.topLowestRow, BasePlayer.messageTypes.topMiddleRow, BasePlayer.messageTypes.topHighestRow]

	static sendHotbar(player) {
		this.defaultHotbar.forEach((blockId, index) => {
			player.client.setHotbar(blockId, index)
		})
	}
	static defaultHotbar = [1, 2, 3, 4, 5, 6, 7, 8, 9]
}
