const Server = require("classicborne-server-protocol")
const Level = require("./class/Level.js")
const ViewLevel = require("./class/ViewLevel.js")
const HubLevel = require("./class/HubLevel.js")
const GlobalCommandRegistry = require("./class/GlobalCommandRegistry.js")
const Zone = require("./class/Zone.js")
const ChangeRecord = require("./class/ChangeRecord.js")
const NullChangeRecord = require("./class/NullChangeRecord.js")
const exportLevelAsVox = require("./exportVox.js")
const filter = require("./filter.js")
const defaultBlockset = require("./6-8-5-rgb.json")
const crypto = require("crypto")
const fs = require("fs")
const Database = require("./class/Database.js")
const Heartbeat = require("./class/Heartbeat.js")
const Watchdog = require("./class/Watchdog.js")
const DroneTransmitter = require("./class/DroneTransmitter.js")
const templates = require("./templates.js")
const UserRecord = require("./class/UserRecord.js")
const commands = require("./commands.js")

const builderDefaults = {
	template: templates.builder
}
const describeDefaults = {
	template: templates.empty,
	allowList: ["not a name"]
}

function clamp(number, min, max) {
	return Math.min(Math.max(number, min), max)
}
function createEmpty(bounds) {
	return Buffer.alloc(bounds[0] * bounds[1] * bounds[2])
}

function randomIntFromInterval(min, max) {
	return Math.floor(Math.random() * (max - min + 1) + min)
}
function invertPromptType(promptType) {
	if (promptType == "description") return "build"
	return "description"
}
function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms)
	})
}

class Universe {
	constructor(serverConfiguration) {
		console.log({ serverConfiguration })
		this.serverConfiguration = serverConfiguration
		this.server = new Server(serverConfiguration.port)
		this.server.universe = this
		this.server.clients = []
		this.server.extensions.push({
			name: "MessageTypes",
			version: 1
		})
		this.db = new Database(this.serverConfiguration)
		const filterMessages = this.serverConfiguration.replacementMessages
		const listOperators = this.serverConfiguration.listOperators

		if (this.serverConfiguration.postToMainServer) {
			this.heartbeat = new Heartbeat(`https://www.classicube.net/server/heartbeat/`, this)
		}

		this.levels = new Map()
		this.playerReserved = this.db.playerReserved

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
		}

		this.canCreateCooldown = new Set()

		this.commandRegistry = new GlobalCommandRegistry()
		commands.register(this)
		const verifyUsernames = (this.serverConfiguration.verifyUsernames && this.heartbeat)
		this.server.on("clientConnected", async (client, authInfo) => {
			if (this.server.clients.filter(otherClient => otherClient.socket.remoteAddress == client.socket.remoteAddress).length >= this.serverConfiguration.maxIpConnections) {
				return client.disconnect("Too many connections!")
			}
			if (this.server.clients.some(otherClient => otherClient.authInfo.username == authInfo.username)) {
				return client.disconnect("Another client already has that name")
			}
			if (verifyUsernames && crypto.createHash("md5").update(this.heartbeat.salt + authInfo.username).digest("hex") !== authInfo.key) {
				console.log("Connection failed")
				client.message("It appears that authorization failed. Are you connecting via the Classicube server list? Try refreshing it.", 0)
				client.message(`You will be disconnected in 10 seconds.`, 0)
				setTimeout(() => {
					client.disconnect("Authorization failed. Please check chat logs.")
				}, 10000)
				return
			}
			console.log(authInfo.username, "connected")
			if (!authInfo.extensions) return client.disconnect("Enable ClassiCube enhanced mode or use other supported client")
			client.customBlockSupport(1)
			client.authInfo = authInfo
			client.message("Welcome to Voxel Telephone. A silly game of telephone where you take turns describing and building.", 0)
			this.commandRegistry.attemptCall(client, "/rules")
			if (listOperators.includes(authInfo.username)) {
				client.message("* You are considered a list operator.", 0)
				client.message("* To force the heartbeat to post zero players, use /forcezero", 0)
			}
			this.server.addClient(client)
			client.droneTransmitter = new DroneTransmitter(client)
			this.server.clients.forEach(otherClient => otherClient.message(`+ ${client.authInfo.username} connected`, 0))
			client.serverIdentification("Voxel Telephone", "a silly game", 0x64)
			client.userRecord = new UserRecord(client, this.db.getUserRecordDocument(client.authInfo.username))
			client.watchdog = new Watchdog(client)
			this.gotoHub(client)
			client.on("setBlock", operation => {
				if (client.watchdog.rateOperation()) return
				if (!client.space) return
				const operationPosition = [operation.x, operation.y, operation.z]
				let block = operation.type
				if (!client.space.userHasPermission(client.authInfo.username)) {
					client.setBlock(client.space.getBlock(operationPosition), operationPosition[0], operationPosition[1], operationPosition[2])
					return client.message("You don't have permission to build in this level", 0)
				}
				if (operationPosition.some(value => value > 63)) {
					client.disconnect("Illegal position received")
					return
				}
				if (operation.mode == 0) {
					block = 0
				}
				if (client.space.inVcr) {
					client.setBlock(client.space.getBlock(operationPosition), operationPosition[0], operationPosition[1], operationPosition[2])
					client.message("Unable to place block. Level is in VCR mode", 0)
					return
				}
				if (client.space.blocking) {
					client.setBlock(client.space.getBlock(operationPosition), operationPosition[0], operationPosition[1], operationPosition[2])
					if (client.space.inferCurrentCommand(operationPosition) !== "inferred position") {
						client.message("Unable to place block. Command in level is expecting additional arguments", 0)
					}
					return
				}
				if (client.paintMode) {
					client.space.setBlock(operationPosition, client.heldBlock, [])
				} else {
					client.space.setBlock(operationPosition, block, [client])
				}
			})
			client.on("message", async (message) => {
				if (client.watchdog.rateOperation(10)) return
				console.log(client.authInfo.username, message)
				if (await this.commandRegistry.attemptCall(client, message)) return
				// a few hardcoded commands
				if (message == "/forcezero" && listOperators.includes(client.authInfo.username) && this.heartbeat) {
					this.heartbeat.forceZero = true
					console.log(`! ${client.authInfo.username} forced heartbeat players to zero`)
					this.server.clients.forEach(otherClient => otherClient.message(`! ${client.authInfo.username} forced heartbeat players to zero`, 0))
					return
				}
				if (client.watchdog.rateOperation(20)) return
				// pass this to the level
				if (message.startsWith("/")) {
					if (!client.space) return
					if (!client.space.userHasPermission(client.authInfo.username)) return client.message("You don't have permission to build in this level", 0)
					if (client.space.inVcr) {
						client.message("Unable to use commands. Level is in VCR mode", 0)
						return
					}
					client.space.interpretCommand(message.replace("/", ""))
				} else {
					if (filter.matches(message)) {
						this.server.clients.forEach(otherClient => otherClient.message(`&7${client.authInfo.username}: &f${filterMessages[0, randomIntFromInterval(0, filterMessages.length - 1)]}`, 0))
						return
					}
					if (client.space?.game?.promptType == "build") {
						client.currentDescription = message
						client.message("Description:", 0)
						client.message(message, 0)
						client.message(message, 1)
						client.message("Use /finish to confirm your description for this build", 3)
						client.message("Use /finish to confirm your description for this build", 0)
					} else if (client.creating) {
						client.creating = false
						client.canCreate = false
						this.canCreateCooldown.add(client.authInfo.username)
						client.message("Your description has been submitted!", 0)
						const game = await this.db.createNewGame(message, client.authInfo.username)
						// addInteraction(client.authInfo.username, game._id, "complete")
						this.db.addInteraction(client.authInfo.username, game._id, "skip")
						setTimeout(() => {
							this.canCreateCooldown.delete(client.authInfo.username)
						}, 3600000) // one hour
					} else {
						this.server.clients.forEach(otherClient => otherClient.message(`&7${client.authInfo.username}: &f${message}`, 0, "> "))
					}
				}
			})
			client.on("close", () => {
				if (client.space) {
					client.space.removeClient(client)
					client.watchdog.destroy()
					this.server.removeClient(client)
					this.server.clients.forEach(otherClient => otherClient.message(`- ${client.authInfo.username} disconnected`, 0))
					console.log("left")
				}
			})
			client.position = [0, 0, 0]
			client.orientation = [0, 0]
			client.paintMode = false
			client.on("position", (position, orientation, heldBlock) => {
				client.position = [position.x, position.y, position.z]
				client.heldBlock = heldBlock
				client.orientation = [orientation.yaw, orientation.pitch]
				if (client.space) {
					const controlledDrone = client.space.clientDrones.get(client)
					if (controlledDrone) {
						controlledDrone.setPosition(position, orientation)
					}
					// portal detection
					client.space.portals.forEach(portal => {
						if (portal.intersects(client.position)) {
							if (portal.globalCommand) {
								this.commandRegistry.attemptCall(client, portal.globalCommand)
							}
						}
					})
				}
			})
		})
	}
	async registerCommand(...args) {
		this.commandRegistry.registerCommand(...args)
	}

	async gotoHub(client, forcedHubName) {
		let hubName = forcedHubName || (await (client.userRecord.data)).defaultHub || this.serverConfiguration.hubName
		const promise = this.loadLevel(hubName,{
			template: templates.empty,
			allowList: this.serverConfiguration.hubEditors,
			levelClass: HubLevel,
			arguments: [hubName, this.db]
		})
		client.message("Hub", 1)
		client.message(" ", 2)
		client.message(" ", 3)
		promise.then(level => {
			level.addClient(client, [60, 8, 4], [162, 254])
		})
		return promise
	}

	loadLevel(spaceName, defaults = {}) {
		const cached = this.levels.get(spaceName)
		if (cached) return cached
		const promise = new Promise(async resolve => {
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
					level.on("clientRemoved", async (client) => {
						level.dispose()
						this.levels.delete(level.name)
					})
					level.game = game
					level.addClient(client, [40, 65, 31])
					client.teleporting = false
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