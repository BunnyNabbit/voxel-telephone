import { BaseUniverse } from "classicborne/class/server/BaseUniverse.mjs"
import { Level } from "../level/Level.mjs"
import { HubLevel } from "../level/HubLevel.mjs"
import { GlobalCommandRegistry } from "../GlobalCommandRegistry.mjs"
import { Database } from "../Database.mjs"
import { templates } from "../level/templates.mjs"
import { Commands } from "../player/Commands.mjs"
import { CefSounds } from "../CefSounds.mjs"
import { Drone } from "classicborne/class/level/drone/Drone.mjs"
import { Ego } from "classicborne/class/level/drone/Ego.mjs"
import { PushIntegration } from "../integrations/PushIntegration.mjs"
import { invertPromptType, randomIntFromInterval } from "../../utils.mjs"
import { FormattedString, stringSkeleton } from "../strings/FormattedString.mjs"
import { Player } from "../player/Player.mjs"

/** @todo Yet to be documented. */
export class Universe extends BaseUniverse {
	static playerClass = Player
	/**/
	constructor(serverConfiguration) {
		super(serverConfiguration)
		this.db = new Database(this.serverConfiguration)
		this.sounds = new CefSounds().sounds

		if (this.serverConfiguration.sounds.enabled) {
			import(`./SoundServer.mjs`).then((SoundServer) => {
				SoundServer = SoundServer.default
				this.soundServer = new SoundServer(this)
			})
		}
		this.integrations = []
		this.messageQueue = []
		this.integrationsReady = false
		if (this.serverConfiguration.integrations) {
			const integrationPromises = this.serverConfiguration.integrations.map(async (integrationData) => {
				try {
					const integrationClass = (await import(`../integrations/${integrationData.class}.mjs`)).default
					const interests = integrationData.interests.map((interest) => PushIntegration.interestType[interest])
					const integration = new integrationClass(interests, integrationData.authData, this, integrationData.language)
					this.integrations.push(integration)
				} catch (error) {
					console.error(error)
				}
			})
			Promise.all(integrationPromises).then(() => {
				this.integrationsReady = true
				// Flush queued messages
				this.messageQueue.forEach(({ message, interest }) => {
					this.pushMessage(message, interest)
				})
				this.messageQueue = []
			})
		} else {
			this.integrationsReady = true
		}
		setInterval(() => {
			const weightedIndex = []
			for (const [key, value] of Object.entries(this.serverConfiguration.announcements.categoryWeight)) {
				for (let index = 0; index < value; index++) {
					weightedIndex.push(key)
				}
			}
			const category = this.serverConfiguration.announcements.messages[weightedIndex[randomIntFromInterval(0, weightedIndex.length - 1)]]
			const message = category[randomIntFromInterval(0, category.length - 1)]
			this.pushMessage(new FormattedString(message), PushIntegration.interestType.announcement)
		}, this.serverConfiguration.announcements.interval)

		this.levels = new Map()
		this.playerReserved = this.db.playerReserved
		HubLevel.teleportPlayer(this) // being used to preload zhe hub level

		this.canCreateCooldown = new Set()

		this.commandRegistry = new GlobalCommandRegistry()
		Commands.register(this)
		this.pushMessage(`Server started.`, PushIntegration.interestType.startServer)
	}

	async registerCommand(...args) {
		this.commandRegistry.registerCommand(...args)
	}

	getHatchday() {
		const hatchdays = this.serverConfiguration.hatchday ?? []
		for (let index = 0; index < hatchdays.length; index++) {
			const hatchday = hatchdays[index]
			const { month, day } = hatchday
			if (month === new Date().getMonth() + 1 && day === new Date().getDate()) return hatchday
		}
		return false
	}
	/**@todo Yet to be documented.
	 *
	 * @param {Player} player
	 */
	async startGame(player) {
		if (player.teleporting == true) return
		player.teleporting = true
		const games = await this.db.findActiveGames(player.authInfo.username, this.levels)
		player.space.removePlayer(player)
		if (games.length) {
			const game = games[randomIntFromInterval(0, games.length - 1)]
			const gameType = invertPromptType(game.promptType)
			player.message(new FormattedString(stringSkeleton.game.gameModes.casual), 2)
			if (gameType == "build") {
				this.commandRegistry.attemptCall(player, "/help game-build")
				player.message(new FormattedString(stringSkeleton.game.question.build.finishReminder), [0, 3])
				player.message(new FormattedString(stringSkeleton.game.question.build.buildTheFollowing, { prompt: game.prompt }))
				player.message(game.prompt, [1, 100])
				Level.loadIntoUniverse(this, `game-${game.next}`, Universe.builderDefaults).then((level) => {
					if (!level.eventsAttached) {
						level.eventsAttached = true
						const floorDrone = new Drone(
							new Ego({
								// represents zhe level's floor. drone is set below zhe level's transparent floor.
								scale: [128, 0.8, 128],
								skin: this.serverConfiguration.floorTextureUrl,
							})
						)
						level.addDrone(floorDrone)
						floorDrone.setPosition({ x: 32, y: 0, z: 32 }, { yaw: 0, pitch: 0 })
						level.on("playerRemoved", async (player) => {
							if (!level.changeRecord.dirty) {
								await level.dispose()
								this.levels.delete(level.name)
								return
							}
							this.db.addInteraction(player.authInfo.username, game.next, "built")
							if (level.doNotReserve) return
							// reserve game for player
							this.playerReserved.set(player.authInfo.username, level.game)
							console.log("reserved game")
							if (!level.changeRecord.draining) level.changeRecord.flushChanges()
							const timeout = setTimeout(async () => {
								await level.dispose()
								this.levels.delete(level.name)
								this.playerReserved.delete(player.authInfo.username)
								console.log("removed reserved game")
							}, 7200000) // two hours
							level.once("playerAdded", () => {
								player.message(new FormattedString(stringSkeleton.game.returnedReservedGame))
								this.playerReserved.delete(player.authInfo.username)
								clearTimeout(timeout)
							})
						})
					}
					level.game = game
					level.addPlayer(player, [40, 10, 31])
					player.emit("playSound", this.sounds.gameTrack)
				})
			} else {
				player.currentDescription = null
				player.message(new FormattedString(stringSkeleton.game.question.description.centerText), 100)
				player.message(new FormattedString(stringSkeleton.game.question.description.reminder), 1)
				this.commandRegistry.attemptCall(player, "/help game-describe")
				Level.loadIntoUniverse(this, `game-${game._id}`, Universe.describeDefaults).then((level) => {
					// TODO: position
					level.on("playerRemoved", async () => {
						level.dispose()
						this.levels.delete(level.name)
					})
					level.game = game
					level.addPlayer(player, [40, 65, 31])
					player.emit("playSound", this.sounds.gameTrack)
				})
			}
		} else {
			await HubLevel.teleportPlayer(player)
			if (this.canCreateCooldown.has(player.authInfo.username) == false) {
				player.canCreate = true
				await this.commandRegistry.attemptCall(player, "/help out-of-games")
				const inspirationFeeds = this.serverConfiguration.inspirationFeeds
				const pickedFeed = inspirationFeeds[randomIntFromInterval(0, inspirationFeeds.length - 1)]
				player.message(new FormattedString(stringSkeleton.game.outOfGames.inspirationFeedUrl, { pickedFeed }))
			} else {
				this.commandRegistry.attemptCall(player, "/help still-out-of-games")
			}
			setTimeout(() => {
				player.teleporting = false
			}, 5000)
		}
	}

	pushMessage(message, interest) {
		if (!this.integrationsReady) {
			// Queue the message until integrations are loaded
			this.messageQueue.push({ message, interest })
			return
		}
		this.integrations
			.filter((integration) => integration.interests.has(interest))
			.forEach((integration) => {
				integration.postMessage(message).catch((err) => {
					console.warn("Failed to post message", err)
				})
			})
	}
	static builderDefaults = {
		template: templates.builder,
	}
	static describeDefaults = {
		template: templates.empty,
		allowList: ["not a name"],
	}
	static heartbeatClass = import("./Heartbeat.mjs").then((module) => module.default)
}

export default Universe

if (import.meta.hot) {
	import("../HotModuleReplacementHelper.mjs").then((module) => {
		module.HotModuleReplacementHelper.handleClassModuleReplacement(import.meta, Universe)
	})
}
