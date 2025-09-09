import filter from "../../filter.mjs"
import crypto from "crypto"
import { Watchdog } from "./Watchdog.mjs"
import { DroneTransmitter } from "../level/drone/DroneTransmitter.mjs"
import { UserRecord } from "./UserRecord.mjs"
import { templates } from "../level/templates.mjs"
import { PushIntegration } from "../integrations/PushIntegration.mjs"
import { EventEmitter } from "events"
import { randomIntFromInterval } from "../../utils.mjs"
import { HubLevel } from "../level/HubLevel.mjs"
import { FormattedString, defaultLanguage, stringSkeleton } from "../strings/FormattedString.mjs"
import { TeleportBehavior } from "classicborne-server-protocol/class/TeleportBehavior.mjs"

export class Player extends EventEmitter {
	/** */
	constructor(client, universe, authInfo) {
		super()
		this.client = client
		this.universe = universe
		this.client.player = this
		this.authInfo = authInfo
		this.username = authInfo.username
		this.ready = this.initialize(client, universe, authInfo)
		this.space = null
	}

	async initialize(client, universe, authInfo) {
		const verifyUsernames = universe.serverConfiguration.verifyUsernames && universe.heartbeat
		if (universe.server.players.filter((otherClient) => otherClient.address == client.address).length >= universe.serverConfiguration.maxIpConnections) return this.client.disconnect("Too many connections!")
		if (universe.server.players.some((otherClient) => otherClient.authInfo.username == authInfo.username)) return this.client.disconnect("Another client already has that name")
		if (
			verifyUsernames &&
			crypto
				.createHash("md5")
				.update(universe.heartbeat.salt + authInfo.username)
				.digest("hex") !== authInfo.key
		) {
			console.log("Connection failed")
			this.message("It appears that authorization failed. Are you connecting via the ClassiCube server list? Try refreshing it.")
			this.message(`You will be disconnected in 10 seconds.`)
			setTimeout(() => {
				this.client.disconnect("Authorization failed. Please check chat logs.")
			}, 10000)
			return
		}
		if (!authInfo.extensions) return this.client.disconnect("Enable ClassiCube enhanced mode or use other supported client")
		if (UserRecord.orphans.has(authInfo.username)) return this.client.disconnect("Orphaned. Rejoin in a few minutes.")
		console.log(authInfo.username, "connected")
		this.client.on("close", () => {
			this.destroyed = true
			if (this.space) this.space.removePlayer(this)
			universe.pushMessage(`- ${this.authInfo.username} disconnected`, PushIntegration.interestType.playerConnection)
			universe.server.players.forEach((otherClient) => {
				otherClient.emit("playSound", universe.sounds.leave)
			})
			this.watchdog.destroy()
			universe.removePlayer(this)
			console.log("left")
		})
		this.universe = universe
		this.usingCEF = universe.soundServer && this.client.appName.includes(" cef")
		this.client.customBlockSupport(1)
		this.authInfo = authInfo
		if (universe.serverConfiguration.listOperators.includes(authInfo.username)) {
			this.message("* You are considered a list operator.")
			this.message("* To force the heartbeat to post zero players, use /forcezero")
		}
		this.userRecord = new UserRecord(this, universe.db.getUserRecordDocument(this.authInfo.username))
		universe.addPlayer(this)
		this.droneTransmitter = new DroneTransmitter(this.client)
		universe.pushMessage(`+ ${this.username} connected`, PushIntegration.interestType.playerConnection)
		universe.server.players.forEach((otherClient) => {
			otherClient.emit("playSound", universe.sounds.join)
		})
		let tagline = "how do i get cowboy paint off a dog ."
		if (universe.serverConfiguration.taglines) tagline = universe.serverConfiguration.taglines[randomIntFromInterval(0, universe.serverConfiguration.taglines.length - 1)]
		this.client.serverIdentification("Voxel Telephone", tagline, 100)
		this.watchdog = new Watchdog(this)
		Player.sendHotbar(this)
		if (this.usingCEF) {
			// zhis is a pretty weird trick. usually zhe CEF plugin unloads windows on level loads, but it can be prevented if its initialization command is issued right before level loading.
			// zhis trick doesn't work if its zhe first level to be loaded, so a dummy level is loaded to get zhings going
			// i don't even know. but its neat since zhe sound interface doesn't need to be recreated every time a level gets loaded, making for much seamless transitions.
			// it also seems to hide zhe "Now viewing" message, which might be problematic in some ozher context since zhe plugin prevents you from using its silence argument on non-allowlisted links. But whatever! Weh heh heh.
			const { processLevel } = await import("classicborne-server-protocol/utils.mjs")
			const emptyLevelBuffer = await processLevel(templates.empty.generate([64, 64, 64]), 64, 64, 64)
			this.client.loadLevel(await emptyLevelBuffer, 64, 64, 64, true)
			const waitPromise = new Promise((resolve) => setTimeout(resolve, 1000))
			// allows zhe client to receive and load zhe dummy level. might be neater to wait for a position update, but not really possible here as zhe client hasn't received its own proper spawn position yet.
			await waitPromise
			this.emit("soundLoadHack")
			if (this.destroyed) return
		}
		HubLevel.teleportPlayer(this)
		this.lastClick = new Date()
		this.lastClickPosition = [0, 0, 0]
		const doubleClickTime = 500
		this.client.on("setBlock", (operation) => {
			if (this.watchdog.rateOperation()) return
			if (!this.space) return
			const operationPosition = [operation.x, operation.y, operation.z]
			if (operationPosition.some((value, index) => value > this.space.bounds[index] - 1)) return console.log(`Player ${this.authInfo.username} attempted to place a block outside of bounds: ${operationPosition}`)
			let block = operation.type
			if (!this.space.userHasPermission(this.authInfo.username)) {
				this.client.setBlock(this.space.getBlock(operationPosition), ...operationPosition)
				if (new Date() - this.lastClick < doubleClickTime && this.lastClickPosition.every((value, index) => value === operationPosition[index])) {
					this.space.emit("click", this, { position: operationPosition, holdingBlock: block, type: "double" })
				} else {
					this.space.emit("click", this, { position: operationPosition, holdingBlock: block, type: "single" })
				}
				this.lastClick = new Date()
				this.lastClickPosition = operationPosition
				return
			}
			if (operation.mode == 0) block = 0
			if (this.space.inVcr) {
				this.client.setBlock(this.space.getBlock(operationPosition), ...operationPosition)
				this.message(new FormattedString(stringSkeleton.level.error.blockBlockingInVCR))
				return
			}
			if (this.space.blocking) {
				this.client.setBlock(this.space.getBlock(operationPosition), ...operationPosition)
				if (!this.space.inferCurrentCommand(this.getInferredData(operationPosition, block), this)) {
					this.message(new FormattedString.stringSkeleton.level.error.blockBlockingCommand())
				}
				return
			}
			if (this.paintMode) {
				this.space.setBlock(operationPosition, this.heldBlock, [])
			} else {
				this.space.setBlock(operationPosition, block, [client])
			}
		})
		this.client.on("message", async (message) => {
			if (this.watchdog.rateOperation(10)) return
			console.log(this.authInfo.username, message)
			if (await universe.commandRegistry.attemptCall(this, message)) return
			// a few hardcoded commands
			if (message == "/forcezero" && universe.serverConfiguration.listOperators.includes(this.authInfo.username) && universe.heartbeat) {
				universe.heartbeat.forceZero = true
				console.log(`! ${this.authInfo.username} forced heartbeat players to zero`)
				universe.server.players.forEach((otherClient) => otherClient.message(`! ${this.authInfo.username} forced heartbeat players to zero`))
				return
			}
			if (this.watchdog.rateOperation(20)) return
			// pass this to the level
			if (message.startsWith("/")) {
				if (!this.space) return
				if (!this.space.userHasPermission(this.authInfo.username)) return this.message(new FormattedString(stringSkeleton.command.error.missingBuildPermission))
				if (this.space.inVcr) return this.message(new FormattedString(stringSkeleton.level.error.buildCommandBlockingInVCR))
				this.space.interpretCommand(message.replace("/", ""), this)
			} else {
				if (filter(message)) {
					const filterMessages = universe.serverConfiguration.replacementMessages
					universe.server.players.forEach((otherClient) => otherClient.message(`&7${this.authInfo.username}: &f${filterMessages[randomIntFromInterval(0, filterMessages.length - 1)]}`))
					return
				}
				if (this.space?.game?.promptType == "build") {
					this.currentDescription = message
					this.message(new FormattedString(stringSkeleton.game.question.description))
					this.message(message, [0, 1])
					this.message(new FormattedString(stringSkeleton.game.question.description.confirmReminder), [0, 3])
				} else if (this.creating) {
					this.creating = false
					this.canCreate = false
					universe.canCreateCooldown.add(this.authInfo.username)
					this.message(new FormattedString(stringSkeleton.game.question.description.submitted))
					const game = await universe.db.createNewGame(message, this.authInfo.username)
					// addInteraction(this.authInfo.username, game._id, "complete")
					universe.db.addInteraction(this.authInfo.username, game._id, "skip")
					setTimeout(() => {
						universe.canCreateCooldown.delete(this.authInfo.username)
					}, 3600000) // one hour
				} else {
					const userRecord = await this.userRecord.get()
					const sound = universe.sounds[userRecord.chatSound] || universe.sounds.chat
					message = message.replaceAll("%", "&")
					universe.pushMessage(`&7${this.authInfo.username}: &f${message}`, PushIntegration.interestType.chatMessage)
					universe.server.players.forEach((otherClient) => {
						otherClient.emit("playSound", sound)
					})
				}
			}
		})
		this.position = [0, 0, 0]
		this.orientation = [0, 0]
		this.paintMode = false
		this.client.on("position", (position, orientation, heldBlock) => {
			this.position = [position.x, position.y, position.z]
			this.heldBlock = heldBlock
			this.orientation = [orientation.yaw, orientation.pitch]
			if (this.space) {
				const controlledDrone = this.space.clientDrones.get(this.client)
				if (controlledDrone) controlledDrone.setPosition(position, orientation)
				// portal detection
				this.space.portals.forEach((portal) => {
					if (!portal.spawnZone && portal.intersects(this.position)) {
						if (portal.globalCommand) this.universe.commandRegistry.attemptCall(this, portal.globalCommand)
					}
				})
			}
		})
		this.userRecord.get().then((record) => {
			const { configuration } = record
			this.applyConfiguration(configuration)
			if (!configuration.language) {
				// HACK: delay because lazy to figure out a more elegant way of doing zhings. actually. it might be perfect to move anyzhing else here.
				setTimeout(() => {
					this.universe.commandRegistry.attemptCall(this, "/tutorial LanguageSelection")
				}, 1000)
			} else {
				this.message(new FormattedString(stringSkeleton.game.welcome))
				universe.commandRegistry.attemptCall(this, "/rules")
			}
		})
		const hatchday = universe.getHatchday()
		if (hatchday) this.message(hatchday.joinMessage)
	}

	message(message, types = [0], continueAdornment = "> ", options = {}) {
		if (message instanceof FormattedString) message = message.format(options.languageOverrides ?? this.languages ?? [defaultLanguage])
		if (this.languages) message = FormattedString.replaceUnsupportedCharacters(message, this.languages[0].locale)
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
			} else if (originalMessage != " " && Player.rightAlignedMessageTypes.includes(type) && this.isClassiCubeMobile() && originalMessage.length < 64) {
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
		if (this.client.appName.startsWith("ClassiCube") && Player.classiCubeMobileSuffixes.some((suffix) => this.client.appName.endsWith(suffix))) return true
	}
	static classiCubeMobileSuffixes = ["android alpha", "iOS alpha", "web mobile"]

	/**Clears zhe displayed screen prints.
	 * @param {string} [type="top"] Zhe print type to clear out.
	 */
	clearPrints(printTypes = Player.printAreaTypes.bottom) {
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
		bottom: [Player.messageTypes.bottomLowestRow, Player.messageTypes.bottomMiddleRow, Player.messageTypes.bottomHighestRow],
		top: [Player.messageTypes.topLowestRow, Player.messageTypes.topMiddleRow, Player.messageTypes.topHighestRow],
		center: [Player.messageTypes.center],
	}
	static rightAlignedMessageTypes = [
		Player.messageTypes.bottomLowestRow,
		Player.messageTypes.bottomMiddleRow,
		Player.messageTypes.bottomHighestRow,
		Player.messageTypes.topLowestRow,
		Player.messageTypes.topMiddleRow,
		Player.messageTypes.topHighestRow,
	]
	

	getInferredData(position, block) {
		return {
			position: position ?? this.getBlockPosition(),
			orientation: this.orientation,
			block: block ?? this.heldBlock,
		}
	}

	getBlockPosition() {
		return [0, -1, 0].map((offset, index) => this.position[index] + offset).map((value, index) => Math.min(Math.max(Math.floor(value), 0), this.space.bounds[index] - 1))
	}

	async applyConfiguration(configuration) {
		if (configuration.language) {
			await FormattedString.getLanguage(configuration.language)
				.then((language) => {
					this.languages = [language, defaultLanguage]
				})
				.catch((err) => {
					console.error(err)
				})
		}
	}
	/**Teleport player using a relative position.
	 * @param {number[]} deltaPosition - Zhe relative position.
	 */
	relativeTeleport(deltaPosition) {
		this.client.extendedPositionUpdate(-1, ...deltaPosition, 0, 0, Player.relativeTeleportBehavior)
	}
	static relativeTeleportBehavior = new TeleportBehavior().setMoveMode(TeleportBehavior.moveMode.relativeInstant).setAffectsPosition(true)

	static sendHotbar(player) {
		this.defaultHotbar.forEach((blockId, index) => {
			player.client.setHotbar(blockId, index)
		})
	}
	static defaultHotbar = [9, 29, 44, 164, 244, 248, 228, 213, 209]
}
