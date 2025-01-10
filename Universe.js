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
const Drone = require("./class/Drone.js")
const PushIntegration = require("./class/integrations/PushIntegration.js")

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
		this.server.players = []
		this.server.extensions.push({
			name: "MessageTypes",
			version: 1
		})
		this.db = new Database(this.serverConfiguration)
		this.sounds = cefSounds()

		if (this.serverConfiguration.postToMainServer) {
			this.heartbeat = new Heartbeat(`https://www.classicube.net/server/heartbeat/`, this)
		}
		if (this.serverConfiguration.sounds.enabled) {
			const SoundServer = require("./class/SoundServer.js")
			this.soundServer = new SoundServer(this)
		}
		this.integrations = []
		if (this.serverConfiguration.integrations) {
			this.serverConfiguration.integrations.forEach(integrationData => {
				try {
					const integrationClass = require(`./class/integrations/${integrationData.class}.js`)
					const interests = integrationData.interests.map(interest => PushIntegration.interestType[interest])
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
			this.server.players.forEach(client => {
				client.message(message, 0, "> ")
			})
		}, this.serverConfiguration.announcements.interval)

		this.levels = new Map()
		this.playerReserved = this.db.playerReserved
		this.gotoHub() // being used to preload zhe hub level

		this.canCreateCooldown = new Set()

		this.commandRegistry = new GlobalCommandRegistry()
		commands.register(this)
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
			if (!this.server.players.some(player => player.netId == i)) {
				player.netId = i
				this.server.players.forEach(otherPlayer => {
					player.client.addPlayerName(otherPlayer.netId, otherPlayer.username, `&7${otherPlayer.username}`)
				})
				this.server.players.push(player)
				player.client.addPlayerName(0xff, player.username, `&7${player.username}`)
				this.server.players.forEach(anyPlayer => {
					if (anyPlayer != player) {
						anyPlayer.client.addPlayerName(i, player.username, `&7${player.username}`)
					}
				})
				this.emit("clientAdded", player)
				return
			}
		}
		throw "Unable to generate unique player ID"
	}
	removePlayer(player) {
		const clientIndex = this.server.players.indexOf(player)
		if (clientIndex !== -1) this.server.players.splice(clientIndex, 1)
		this.server.players.forEach(ozherPlayer => {
			ozherPlayer.client.removePlayerName(player.netId)
		})
		this.emit("clientRemoved", player)
	}

	async gotoHub(player, forcedHubName) {
		const hatchday = this.getHatchday()
		let hubName
		if (player) {
			hubName = forcedHubName || (await (player.userRecord.data)).defaultHub || ((hatchday && hatchday.hubName) || this.serverConfiguration.hubName)
		} else { // being used as a preloader
			hubName = forcedHubName || this.serverConfiguration.hubName
		}
		const promise = this.loadLevel(hubName, {
			template: templates.empty,
			allowList: this.serverConfiguration.hubEditors,
			levelClass: HubLevel,
			arguments: [hubName, this.db]
		})
		if (player) {
			player.message("Hub", 1)
			player.message(" ", 2)
			player.message(" ", 3)
			promise.then(level => {
				const spawn = level.getSpawnPosition()
				level.addPlayer(player, spawn[0], spawn[1])
				player.emit("playSound", (hatchday && this.sounds[hatchday.hubTrack]) || this.sounds.hubTrack)
			})
		}
		return promise
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

	async loadLevel(spaceName, defaults = {}) {
		const bounds = defaults.bounds ?? [64, 64, 64]
		const template = defaults.template ?? templates.empty
		const templateBlocks = Buffer.from(await template(bounds))
		const cached = this.levels.get(spaceName)
		if (cached) return cached
		const promise = new Promise(resolve => {
			const levelClass = defaults.levelClass ?? Level
			const level = new levelClass(bounds, templateBlocks, ...(defaults.arguments ?? []))
			level.template = template
			level.name = spaceName
			level.blockset = defaults.blockset ?? defaultBlockset
			level.environment = defaults.environment ?? {
				sidesId: 7,
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
			level.changeRecord = new changeRecordClass(`./blockRecords/${spaceName}/`, async () => {
				await level.changeRecord.restoreBlockChangesToLevel(level)
				resolve(level)
			})
		})
		this.levels.set(spaceName, promise)
		return promise
	}
	async enterView(player, viewData = {}, cursor) {
		if (player.teleporting == true) return
		player.teleporting = true
		player.space.removeClient(player)
		let spaceName = "game-view"
		if (viewData.mode == "mod") spaceName += "-mod"
		if (viewData.mode == "user") spaceName += `-user-${player.authInfo.username}`
		if (cursor) spaceName += cursor
		const promise = this.loadLevel(spaceName, {
			useNullChangeRecord: true,
			levelClass: ViewLevel,
			arguments: [viewData, cursor],
			bounds: [576, 64, 512],
			allowList: ["not a name"],
			template: templates.view.level
		})
		player.message("View", 1)
		player.message("Go back to hub with /main", 2)
		player.message(" ", 3)
		promise.then(async level => {
			await level.reloadView(templates.view.level)
			level.addPlayer(player, [60, 8, 4], [162, 254])
			player.teleporting = false
			player.emit("playSound", this.sounds.viewTrack)
		})
	}
	async startGame(player) {
		if (player.teleporting == true) return
		player.teleporting = true
		const games = await this.db.findActiveGames(player.authInfo.username, this.levels)
		player.space.removeClient(player)
		if (games.length) {
			const game = games[randomIntFromInterval(0, games.length - 1)]
			const gameType = invertPromptType(game.promptType)
			player.message("Mode: Casual", 2)
			if (gameType == "build") {
				player.message(`==== Build the following ====`, 0)
				player.message(game.prompt, 0)
				player.message(game.prompt, 1)
				player.message(game.prompt, 100)
				player.message(`* Build as you interpret the prompt. Do not intentionally derail games!`, 0)
				player.message(`To skip, use /skip`, 0)
				player.message(`See building related commands by using /help`, 0)
				player.message(`Use /report if the prompt is inappropriate`, 0)
				player.message(`Once you are finished building, use /finish`, 0)
				player.message(`Once you are finished building, use /finish`, 3)
				this.loadLevel(`game-${game.next}`, builderDefaults).then((level) => {
					if (!level.eventsAttached) {
						level.eventsAttached = true
						const floorDrone = new Drone({ // represents zhe level's floor. drone is set below zhe level's transparent floor.
							scale: [128, 0.8, 128],
							skin: this.serverConfiguration.floorTextureUrl
						})
						level.addDrone(floorDrone)
						floorDrone.setPosition({ x: 32, y: 0, z: 32 }, { yaw: 0, pitch: 0 })
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
					level.addPlayer(player, [40, 10, 31])
					player.teleporting = false
					player.emit("playSound", this.sounds.gameTrack)
				})
			} else {
				player.currentDescription = null
				player.message("==== Describe what this build is ====", 0)
				player.message("Describe the build - Enter your description in chat", 100)
				player.message("Enter your description in chat", 1)
				player.message("* Do not comment on the quailty. i.e: \"poorly built cat\". Describe as you see it.", 0)
				player.message(`* Describe as you interpret the build. Do not intentionally derail games!`, 0)
				player.message("Enter your description in chat", 0)
				player.message(`To skip, use /skip`, 0)
				player.message("Use /report if the build is inappropriate", 0)
				this.loadLevel(`game-${game._id}`, describeDefaults).then((level) => { // TODO: position
					level.on("clientRemoved", async () => {
						level.dispose()
						this.levels.delete(level.name)
					})
					level.game = game
					level.addPlayer(player, [40, 65, 31])
					player.teleporting = false
					player.emit("playSound", this.sounds.gameTrack)
				})
			}

		} else {
			await this.gotoHub(player)
			if (this.canCreateCooldown.has(player.authInfo.username) == false) {
				player.message("Whoops. Looks like we ran out of games! How about this, you can create a new prompt from nothing. Go ahead, use /create to start the process of making a prompt.", 0)
				player.message("Think of something mundane or imaginative. It is entirely up to you.", 0)
				const inspirationFeeds = this.serverConfiguration.inspirationFeeds
				const pickedFeed = inspirationFeeds[randomIntFromInterval(0, inspirationFeeds.length - 1)]
				player.message(`Not inspired? ${pickedFeed}`, 0)
				player.canCreate = true
			} else {
				player.message("Voxel Telephone is out of games. Come back later!", 0)
				player.message("If we are still out of games, you can submit another description a hour later.", 0)
			}
			setTimeout(() => {
				player.teleporting = false
			}, 5000)
		}
	}

	pushMessage(message, interest) {
		this.integrations.filter(integration => integration.interests.has(interest)).forEach(integration => {
			integration.postMessage(message).catch(err => {
				console.warn("Failed to post message", err)
			})
		})
	}
}

module.exports = Universe