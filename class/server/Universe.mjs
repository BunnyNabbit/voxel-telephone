import Server from "classicborne-server-protocol"
import { Level } from "../level/Level.mjs"
import { HubLevel } from "../level/HubLevel.mjs"
import { GlobalCommandRegistry } from "../GlobalCommandRegistry.mjs"
import { Database } from "../Database.mjs"
import { Heartbeat } from "./Heartbeat.mjs"
import { templates } from "../level/templates.mjs"
import { Commands } from "../player/Commands.mjs"
import { CefSounds } from "../CefSounds.mjs"
import { Player } from "../player/Player.mjs"
import { Drone } from "../level/drone/Drone.mjs"
import { Ego } from "../level/drone/Ego.mjs"
import { PushIntegration } from "../integrations/PushIntegration.mjs"
import { EventEmitter } from "events"
import { invertPromptType, randomIntFromInterval } from "../../utils.mjs"

export class Universe extends EventEmitter {
	/** */
	constructor(serverConfiguration) {
		super()
		console.log({ serverConfiguration })
		this.serverConfiguration = serverConfiguration
		this.server = new Server(serverConfiguration.port)
		this.server.setupWebSocketServer()
		this.server.universe = this
		this.server.players = []
		this.server.extensions.push({
			name: "MessageTypes",
			version: 1,
		})
		this.db = new Database(this.serverConfiguration)
		this.sounds = new CefSounds().sounds

		if (this.serverConfiguration.postToMainServer) this.heartbeat = new Heartbeat(`https://www.classicube.net/server/heartbeat/`, this)
		if (this.serverConfiguration.sounds.enabled) {
			import(`./SoundServer.mjs`).then((SoundServer) => {
				SoundServer = SoundServer.default
				this.soundServer = new SoundServer(this)
			})
		}
		this.integrations = []
		if (this.serverConfiguration.integrations) {
			this.serverConfiguration.integrations.forEach(async (integrationData) => {
				try {
					const integrationClass = (await import(`../integrations/${integrationData.class}.mjs`)).default
					const interests = integrationData.interests.map((interest) => PushIntegration.interestType[interest])
					const integration = new integrationClass(interests, integrationData.authData, this)
					this.integrations.push(integration)
				} catch (error) {
					console.error(error)
				}
			})
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
			this.server.players.forEach((player) => {
				player.message(message, 0, "> ")
			})
		}, this.serverConfiguration.announcements.interval)

		this.levels = new Map()
		this.playerReserved = this.db.playerReserved
		HubLevel.teleportPlayer(this) // being used to preload zhe hub level

		this.canCreateCooldown = new Set()

		this.commandRegistry = new GlobalCommandRegistry()
		Commands.register(this)
		this.server.on("clientConnected", async (client, authInfo) => {
			new Player(client, this, authInfo)
		})
		this.pushMessage(`Server started.`, PushIntegration.interestType.startServer)
	}

	async registerCommand(...args) {
		this.commandRegistry.registerCommand(...args)
	}

	addPlayer(player) {
		for (let i = 0; i < 127; i++) {
			if (!this.server.players.some((player) => player.netId == i)) {
				player.netId = i
				this.server.players.forEach((otherPlayer) => {
					player.client.addPlayerName(otherPlayer.netId, otherPlayer.username, `&7${otherPlayer.username}`, "Voxel Telephone", 1)
				})
				this.server.players.push(player)
				player.client.addPlayerName(255, player.username, `&7${player.username}`, "Voxel Telephone", 1)
				this.server.players.forEach((anyPlayer) => {
					if (anyPlayer != player) anyPlayer.client.addPlayerName(i, player.username, `&7${player.username}`, "Voxel Telephone", 1)
				})
				this.emit("playerAdded", player)
				return
			}
		}
		throw "Unable to generate unique player ID"
	}

	removePlayer(player) {
		const clientIndex = this.server.players.indexOf(player)
		if (clientIndex !== -1) this.server.players.splice(clientIndex, 1)
		this.server.players.forEach((ozherPlayer) => {
			ozherPlayer.client.removePlayerName(player.netId)
		})
		this.emit("playerRemoved", player)
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

	async startGame(player) {
		if (player.teleporting == true) return
		player.teleporting = true
		const games = await this.db.findActiveGames(player.authInfo.username, this.levels)
		player.space.removePlayer(player)
		if (games.length) {
			const game = games[randomIntFromInterval(0, games.length - 1)]
			const gameType = invertPromptType(game.promptType)
			player.message("Mode: Casual", 2)
			if (gameType == "build") {
				player.message(`==== Build the following ====`)
				player.message(game.prompt, [0, 1, 100])
				player.message(`* Build as you interpret the prompt. Do not intentionally derail games!`)
				player.message(`To skip, use /skip`)
				player.message(`See building related commands by using /help`)
				player.message(`Use /report if the prompt is inappropriate`)
				player.message(`Once you are finished building, use /finish`, [0, 3])
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
						level.on("playerRemoved", async (client) => {
							if (!level.changeRecord.dirty) {
								await level.dispose()
								this.levels.delete(level.name)
								return
							}
							this.db.addInteraction(client.authInfo.username, game.next, "built")
							if (level.doNotReserve) return
							// reserve game for player
							this.playerReserved.set(client.authInfo.username, level.game)
							console.log("reserved game")
							if (!level.changeRecord.draining) {
								level.changeRecord.flushChanges()
							}
							const timeout = setTimeout(async () => {
								await level.dispose()
								this.levels.delete(level.name)
								this.playerReserved.delete(client.authInfo.username)
								console.log("removed reserved game")
							}, 7200000) // two hours
							level.once("playerAdded", () => {
								client.message(">> Returned to this game because it was reserved for you.")
								client.message(">> Games will only be reserved for two hours.")
								this.playerReserved.delete(client.authInfo.username)
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
				player.message("==== Describe what this build is ====")
				player.message("Describe the build - Enter your description in chat", 100)
				player.message("Enter your description in chat", 1)
				player.message('* Do not comment on the quality. i.e: "poorly built cat". Describe as you see it.')
				player.message(`* Describe as you interpret the build. Do not intentionally derail games!`)
				player.message("Enter your description in chat")
				player.message(`To skip, use /skip`)
				player.message("Use /report if the build is inappropriate")
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
				player.message("Whoops. Looks like we ran out of games! How about this, you can create a new prompt from nothing. Go ahead, use /create to start the process of making a prompt.")
				player.message("Think of something mundane or imaginative. It is entirely up to you.")
				const inspirationFeeds = this.serverConfiguration.inspirationFeeds
				const pickedFeed = inspirationFeeds[randomIntFromInterval(0, inspirationFeeds.length - 1)]
				player.message(`Not inspired? ${pickedFeed}`)
				player.canCreate = true
			} else {
				player.message("Voxel Telephone is out of games. Come back later!")
				player.message("If we are still out of games, you can submit another description a hour later.")
			}
			setTimeout(() => {
				player.teleporting = false
			}, 5000)
		}
	}

	pushMessage(message, interest) {
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
}
