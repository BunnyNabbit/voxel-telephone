const Server = require("classicborne-server-protocol")
const Level = require("./class/Level.js")
const ViewLevel = require("./class/ViewLevel.js")
const HubLevel = require("./class/HubLevel.js")
const GlobalCommandRegistry = require("./class/GlobalCommandRegistry.js")
const ChangeRecord = require("./class/ChangeRecord.js")
const NullChangeRecord = require("./class/NullChangeRecord.js")
const exportLevelAsVox = require("./exportVox.js")
const defaultBlockset = require("./6-8-5-rgb.json")
const Database = require("./class/Database.js")
const Heartbeat = require("./class/Heartbeat.js")
const templates = require("./templates.js")
const commands = require("./commands.js")
const cefSounds = require("./cefSounds.js")
const Player = require("./class/Player.js")

const builderDefaults = {
	template: templates.builder
}
const describeDefaults = {
	template: templates.empty,
	allowList: ["not a name"]
}

function randomIntFromInterval(min, max) {
	return Math.floor(Math.random() * (max - min + 1) + min)
}
function invertPromptType(promptType) {
	if (promptType == "description") return "build"
	return "description"
}
class Universe extends require("events") {
	constructor(serverConfiguration) {
		super()
		console.log({ serverConfiguration })
		this.serverConfiguration = serverConfiguration
		this.server = new Server(serverConfiguration.port)
		this.server.setupWebSocketServer()
		this.server.universe = this
		this.server.clients = []
		this.server.extensions.push({
			name: "MessageTypes",
			version: 1
		})
		this.db = new Database(this.serverConfiguration)
		this.sounds = cefSounds(this.serverConfiguration.sounds.audioStaticBaseURL)

		if (this.serverConfiguration.postToMainServer) {
			this.heartbeat = new Heartbeat(`https://www.classicube.net/server/heartbeat/`, this)
		}
		if (this.serverConfiguration.sounds.enabled) {
			const SoundServer = require("./class/SoundServer.js")
			this.soundServer = new SoundServer(this)
		}

		this.levels = new Map()
		this.playerReserved = this.db.playerReserved
		this.gotoHub() // being used to preload zhe hub level

		this.server.addClient = (client) => {
			for (let i = 0; i < 127; i++) {
				if (!this.server.clients.some(client => client.netId == i)) {
					client.netId = i
					this.server.clients.forEach(otherClient => {
						client.addPlayerName(otherClient.netId, otherClient.authInfo.username, `&7${otherClient.authInfo.username}`)
					})
					this.server.clients.push(client)
					client.addPlayerName(0xff, client.authInfo.username, `&7${client.authInfo.username}`)
					this.server.clients.forEach(anyClient => {
						if (anyClient != client) {
							anyClient.addPlayerName(i, client.authInfo.username, `&7${client.authInfo.username}`)
						}
					})
					this.emit("clientAdded", client)
					return
				}
			}

			throw "Unable to generate unique player ID"
		}
		this.server.removeClient = (client) => {
			const clientIndex = this.server.clients.indexOf(client)
			if (clientIndex !== -1) this.server.clients.splice(clientIndex, 1)
			this.server.clients.forEach(anyClient => {
				anyClient.removePlayerName(client.netId)
			})
			this.emit("clientRemoved", client)
		}

		this.canCreateCooldown = new Set()

		this.commandRegistry = new GlobalCommandRegistry()
		commands.register(this)
		this.server.on("clientConnected", async (client, authInfo) => {
			new Player(client, this, authInfo)
		})
	}
	async registerCommand(...args) {
		this.commandRegistry.registerCommand(...args)
	}

	async gotoHub(client, forcedHubName) {
		let hubName
		if (client) {
			hubName = forcedHubName || (await (client.userRecord.data)).defaultHub || this.serverConfiguration.hubName
		} else { // being used as a preloader
			hubName = forcedHubName || this.serverConfiguration.hubName
		}
		const promise = this.loadLevel(hubName, {
			template: templates.empty,
			allowList: this.serverConfiguration.hubEditors,
			levelClass: HubLevel,
			arguments: [hubName, this.db]
		})
		if (client) {
			client.message("Hub", 1)
			client.message(" ", 2)
			client.message(" ", 3)
			promise.then(level => {
				level.addClient(client, [60, 8, 4], [162, 254])
				client.emit("playSound", this.sounds.hubTrack)
			})
		}
		return promise
	}

	loadLevel(spaceName, defaults = {}) {
		const cached = this.levels.get(spaceName)
		if (cached) return cached
		const promise = new Promise(resolve => {
			const bounds = defaults.bounds ?? [64, 64, 64]
			const template = defaults.template ?? templates.empty
			const levelClass = defaults.levelClass ?? Level
			const level = new levelClass(bounds, template(bounds), ...(defaults.arguments ?? []))
			level.template = template
			level.name = spaceName
			level.blockset = defaults.blockset ?? defaultBlockset
			level.environment = defaults.environment ?? {
				sidesId: 250,
				edgeId: 250,
				edgeHeight: 0
			}
			level.texturePackUrl = defaults.texturePackUrl ?? this.serverConfiguration.texturePackUrl
			level.allowList = defaults.allowList ?? []
			level.universe = this
			let changeRecordClass = ChangeRecord
			if (defaults.useNullChangeRecord) {
				changeRecordClass = NullChangeRecord
			}
			level.changeRecord = new changeRecordClass(`./blockRecords/${spaceName}/`, null, async () => {
				await level.changeRecord.restoreBlockChangesToLevel(level)
				resolve(level)
			})
		})
		this.levels.set(spaceName, promise)
		return promise
	}
	async enterView(client, moderationView = false, cursor) {
		if (client.teleporting == true) return
		client.teleporting = true
		client.space.removeClient(client)
		let spaceName = "game-view"
		if (moderationView) spaceName += "-mod"
		if (cursor) spaceName += cursor
		const promise = this.loadLevel(spaceName, {
			useNullChangeRecord: true,
			levelClass: ViewLevel,
			arguments: [moderationView, cursor],
			bounds: [576, 64, 512],
			allowList: ["not a name"],
			template: templates.view.level
		})
		client.message("View", 1)
		client.message("Go back to hub with /main", 2)
		client.message(" ", 3)
		promise.then(async level => {
			await level.reloadView(templates.view.level)
			level.addClient(client, [60, 8, 4], [162, 254])
			client.teleporting = false
			client.emit("playSound", this.sounds.viewTrack)
		})
	}
	async startGame(client) {
		if (client.teleporting == true) return
		client.teleporting = true
		client.message("teleport", 0)
		const games = await this.db.findActiveGames(client.authInfo.username, this.levels)
		client.space.removeClient(client)
		if (games.length) {
			const game = games[randomIntFromInterval(0, games.length - 1)]
			const gameType = invertPromptType(game.promptType)
			client.message("Mode: Casual", 2)
			if (gameType == "build") {
				client.message(`==== Build the following ====`, 0)
				client.message(game.prompt, 0)
				client.message(game.prompt, 1)
				client.message(game.prompt, 100)
				client.message(`* Build as you interpret the prompt. Do not intentionally derail games!`, 0)
				client.message(`To skip, use /skip`, 0)
				client.message(`See building related commands by using /help`, 0)
				client.message(`Use /report if the prompt is inappropriate`, 0)
				client.message(`Once you are finished building, use /finish`, 0)
				client.message(`Once you are finished building, use /finish`, 3)
				this.loadLevel(`game-${game.next}`, builderDefaults).then((level) => {
					if (!level.eventsAttached) {
						level.eventsAttached = true
						level.on("clientRemoved", async (client) => {
							if (!level.changeRecord.dirty) {
								await level.dispose()
								this.levels.delete(level.name)
								return
							}
							this.db.addInteraction(client.authInfo.username, game.next, "built")
							exportLevelAsVox(level)
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
							level.once("clientAdded", () => {
								client.message(">> Returned to this game because it was reserved for you.")
								client.message(">> Games will only be reserved for two hours.")
								this.playerReserved.delete(client.authInfo.username)
								clearTimeout(timeout)
							})
						})
					}
					level.game = game
					level.addClient(client, [40, 10, 31])
					client.teleporting = false
					client.emit("playSound", this.sounds.gameTrack)
				})
			} else {
				client.currentDescription = null
				client.message("==== Describe what this build is ====", 0)
				client.message("Describe the build - Enter your description in chat", 100)
				client.message("Enter your description in chat", 1)
				client.message("* Do not comment on the quailty. i.e: \"poorly built cat\". Describe as you see it.", 0)
				client.message(`* Describe as you interpret the build. Do not intentionally derail games!`, 0)
				client.message("Enter your description in chat", 0)
				client.message(`To skip, use /skip`, 0)
				client.message("Use /report if the build is inappropriate", 0)
				this.loadLevel(`game-${game._id}`, describeDefaults).then((level) => { // TODO: position
					level.on("clientRemoved", async () => {
						level.dispose()
						this.levels.delete(level.name)
					})
					level.game = game
					level.addClient(client, [40, 65, 31])
					client.teleporting = false
					client.emit("playSound", this.sounds.gameTrack)
				})
			}

		} else {
			await this.gotoHub(client)
			if (this.canCreateCooldown.has(client.authInfo.username) == false) {
				client.message("Whoops. Looks like we ran out of games! How about this, you can create a new prompt from nothing. Go ahead, use /create to start the process of making a prompt.", 0)
				client.message("Think of something mundane or imaginative. It is entirely up to you.", 0)
				const inspirationFeeds = this.serverConfiguration.inspirationFeeds
				const pickedFeed = inspirationFeeds[randomIntFromInterval(0, inspirationFeeds.length - 1)]
				client.message(`Not inspired? ${pickedFeed}`, 0)
				client.canCreate = true
			} else {
				client.message("Voxel Telephone is out of games. Come back later!", 0)
				client.message("If we are still out of games, you can submit another description a hour later.", 0)
			}
			setTimeout(() => {
				client.teleporting = false
			}, 5000)
		}
	}
}

module.exports = Universe