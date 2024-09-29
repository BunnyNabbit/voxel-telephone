const Server = require("classicborne-server-protocol")
const Level = require("./class/Level.js")
const ViewLevel = require("./class/ViewLevel.js")
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

const builderDefaults = {
	template: templates.builder
}
const describeDefaults = {
	template: templates.empty,
	allowList: []
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
		const hubDefaults = {
			template: templates.empty,
			allowList: this.serverConfiguration.hubEditors
		}
		this.loadLevel(this.serverConfiguration.hubName, hubDefaults).then(async level => {
			level.on("clientRemoved", async () => {
				if (level.clients.length == 0 && !level.changeRecord.draining && level.changeRecord.dirty) {
					console.log("Saving", level.name)
					const size = await level.changeRecord.flushChanges()
					console.log(`Saved ${size}`)
				}
			})
			level.on("clientAdded", () => {

			})
			level.portals = await this.db.getPortals(level.name)
		})

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
		this.commandRegistry.registerCommand(["/rules"], (client) => {
			client.message("== Rules", 0)
			client.message("The point of the game is to see how builds transform when users take turn describing and building.", 0)
			client.message("1. Do not intentionally derail the games. Build and describe as you genuinely see it.", 0)
			client.message("2. Builds and prompts must not be inappropriate.", 0)
		})
		function reasonVcr(matchValue, message) {
			return function (client) {
				if (client.space.inVcr == matchValue) {
					if (message) client.message(message, 0)
					return false
				}
				return true
			}
		}
		function reasonHasPermission(matchValue, message) {
			return function (client) {
				if (client.space.userHasPermission(client.authInfo.username) == matchValue) {
					if (message) client.message(message, 0)
					return false
				}
				return true
			}
		}
		function reasonVcrDraining(matchValue, message) {
			return function (client) {
				if (client.space.changeRecord.draining == matchValue) {
					if (message) client.message(message, 0)
					return false
				}
				return true
			}
		}
		function makeMultiValidator(reasons = []) {
			return function (client, str) {
				for (const reason of reasons) {
					if (reason(client, str)) return false
				}
				return true
			}
		}
		this.commandRegistry.registerCommand(["/commit"], async (client) => {
			client.space.loading = true
			await client.space.changeRecord.commit(client.space.changeRecord.actionCount)
			client.space.loading = false
			client.space.inVcr = false
			client.message("Changes commited. VCR mode off", 0)
		}, reasonVcr(false, "Level isn't in VCR mode. /vcr"))
		this.commandRegistry.registerCommand(["/finish"], async (client) => {
			if (client.space && client.space.game && !client.space.changeRecord.draining) {
				const gameType = invertPromptType(client.space.game.promptType)
				console.log(gameType)
				if (gameType == "build") {
					if (client.space.changeRecord.actionCount == 0) {
						client.message("There is nothing. Build the prompt you are given!")
						return
					}
					this.server.clients.forEach(otherClient => otherClient.message(`${client.authInfo.username} finished a turn (Build)`, 0))
					this.db.continueGame(client.space.game, client.space.game.next, gameType, client.authInfo.username)
					if (client.space.changeRecord.dirty) await client.space.changeRecord.flushChanges()
					this.db.addInteraction(client.authInfo.username, client.space.game.next, "built")
					exportLevelAsVox(client.space)
				} else { // describe
					if (!client.currentDescription) {
						client.message("You currently have no description for this build. Write something in chat first!")
						return
					}
					this.db.addInteraction(client.authInfo.username, client.space.game._id, "described")
					this.server.clients.forEach(otherClient => otherClient.message(`${client.authInfo.username} finished a turn (Describe)`, 0))
					await this.db.continueGame(client.space.game, client.space.game.next, gameType, client.authInfo.username, client.currentDescription)
					client.currentDescription = null
				}
				this.db.addInteraction(client.authInfo.username, client.space.game.root, "complete")
				client.space.doNotReserve = true
				client.space.removeClient(client)
				await this.gotoHub(client)
			}
		})
		this.commandRegistry.registerCommand(["/report"], async (client, message) => {
			if (client.space && client.space.name !== this.serverConfiguration.hubName) {
				let reason = message
				if (reason.length == 0) reason = "[ Empty report ]"
				this.db.addInteraction(client.authInfo.username, client.space.game._id, "skip")
				this.db.addInteraction(client.authInfo.username, client.space.game._id, "report")
				await this.db.deactivateGame(client.space.game._id)
				await this.db.addReport(client.authInfo.username, client.space.game._id, reason)
				console.log(`Game reported with reason: "${reason}"`)
				client.message(`Game reported with reason: "${reason}"`, 0)
				client.space.doNotReserve = true
				client.space.removeClient(client);
				await gotoHub(client)
			}
		})
		this.commandRegistry.registerCommand(["/abort"], async (client) => {
			if (client.space.loading) return client.message("Please wait", 0)
			if (client.space.inVcr) {
				client.space.blocks = client.space.template(client.space.bounds)
				await client.space.changeRecord.restoreBlockChangesToLevel(client.space)
				client.space.reload()
				client.space.inVcr = false
				client.message("Aborted. VCR mode off", 0)
			} else {
				if (client.space.currentCommand) {
					client.space.blocking = false
					client.space.currentCommand = null
					client.message("Command aborted", 0)
				} else {
					client.message("Nothing happened", 0)
				}
			}
		}, reasonHasPermission(false, "You don't have permission to build in this level!"))
		this.commandRegistry.registerCommand(["/mark"], async (client) => {
			if (!client.space.blocking) {
				client.message("There are no current commands being run on the level", 0)
				return
			}
			client.space.inferCurrentCommand(client.position.map(value => Math.min(Math.max(Math.floor(value), 0), 63)))
		}, reasonHasPermission(false, "You don't have permission to build in this level!"))
		this.commandRegistry.registerCommand(["/paint"], async (client) => {
			client.paintMode = !client.paintMode
			if (client.paintMode) {
				client.message("Paint mode on", 0)
			} else {
				client.message("Paint mode off", 0)
			}
		})
		this.commandRegistry.registerCommand(["/help"], async (client) => { // TODO: this should be replaced by a different system
			client.message("/cuboid", 0)
			client.message("/place", 0)
			client.message("/mark", 0)
			client.message("/vcr - rewind mistakes", 0)
			client.message("/paint - toggles paint mode", 0)
			client.message("/abort - abort interactive operations", 0)
		})
		this.commandRegistry.registerCommand(["/skip"], async (client,) => {
			if (client.space && client.space.name !== this.serverConfiguration.hubName) {
				this.db.addInteraction(client.authInfo.username, client.space.game._id, "skip")
				client.space.doNotReserve = true
				client.space.removeClient(client);
				await this.gotoHub(client)
			}
		})
		this.commandRegistry.registerCommand(["/pl", "/place"], async (client) => {
			if (client.space.inVcr) return client.message("Unable to place block. Level is in VCR mode", 0)
			if (client.space.blocking) return client.message("Unable to place block. Command in level is expecting additional arguments", 0)
			if (client.watchdog.rateOperation(1)) return
			const operationPosition = [0, -1, 0].map((offset, index) => client.position[index] + offset).map(value => Math.min(Math.max(Math.floor(value), 0), 63))
			let block = client.heldBlock
			if (operationPosition.some(value => value > 63)) {
				return
			}
			client.space.setBlock(operationPosition, block)
		}, reasonHasPermission(false, "You don't have permission to build in this level!"))
		this.commandRegistry.registerCommand(["/clients"], async (client) => {
			client.message("&ePlayers using:", 0)
			this.server.clients.forEach(otherClient => {
				client.message(`&e  ${otherClient.socket.appName}: &f${otherClient.authInfo.username}`, 0, "> ")
			})
		})
		this.commandRegistry.registerCommand(["/vcr"], async (client) => {
			if (client.space.changeRecord.draining) return client.message(`VCR is busy. Try again later?`, 0)
			if (client.space.changeRecord.dirty) await client.space.changeRecord.flushChanges()
			if (!client.space.inVcr) {
				client.space.changeRecord.maxActions = client.space.changeRecord.actionCount
				client.space.toggleVcr()
				client.message(`VCR has ${client.space.changeRecord.actionCount} actions. VCR Controls`, 0)
				client.message(`/rewind (actions) - undos actions`, 0)
				// client.message(`/keyframe (keyframe number) - VCR brings to keyframe`)
				client.message(`/fastforward (actions) - redos rewinded actions`, 0)
				client.message(`/commit - loads current state seen in the VCR preview. will override change record.`, 0)
				client.message(`/abort - aborts VCR preview, loading state as it was before enabling VCR.`, 0)
				client.space.reload()
			} else {
				client.message(`The level is already in VCR mode`, 0)
			}
		}, reasonHasPermission(false, "You don't have permission to build in this level!"))
		this.commandRegistry.registerCommand(["/create"], async (client) => {
			if (client.canCreate && client.space?.name == this.serverConfiguration.hubName) {
				client.creating = true
				client.message("Enter a description in chat. It can be mundane or imaginative.", 0)
			}
		})
		this.commandRegistry.registerCommand(["/rewind", "/rw", "/undo"], async (client, message) => {
			if (!client.space.inVcr) return client.message("Level isn't in VCR mode. /vcr", 0)
			const count = Math.max(parseInt(message), 0) || 1
			if (client.space.loading) return client.message("Level is busy seeking. Try again later", 0)
			client.space.blocks = client.space.template(client.space.bounds)
			await client.space.changeRecord.restoreBlockChangesToLevel(client.space, Math.max(client.space.changeRecord.actionCount - count, 1))
			client.space.reload()
			client.message(`Rewinded. Current actions: ${client.space.changeRecord.actionCount}/${client.space.changeRecord.maxActions}`, 0)
			client.message(`To commit this state use /commit. use /abort to exit VCR`, 0)
		})
		this.commandRegistry.registerCommand(["/fastforward", "/ff", "/redo"], async (client, message) => {
			if (!client.space.inVcr) return client.message("Level isn't in VCR mode. /vcr", 0)
			const count = Math.max(parseInt(message), 0) || 1
			if (client.space.loading) return client.message("Level is busy seeking. Try again later", 0)
			client.space.blocks = client.space.template(client.space.bounds)
			await client.space.changeRecord.restoreBlockChangesToLevel(client.space, Math.min(client.space.changeRecord.actionCount + count, client.space.changeRecord.maxActions))
			client.space.reload()
			client.message(`Fast-forwarded. Current actions: ${client.space.changeRecord.actionCount}/${client.space.changeRecord.maxActions}`, 0)
			client.message(`To commit this state use /commit. Use /abort to exit VCR`, 0)
		})
		this.commandRegistry.registerCommand(["/addzone"], async (client, message) => {
			if (!this.serverConfiguration.hubEditors.includes(client.authInfo.username) || client.space.name.startsWith("game-")) return
			const values = message.split(" ").map(value => parseInt(value)).filter(value => !isNaN(value))
			const command = message.split(" ").slice(6).join(" ")
			if (values.length < 6 || !command) return client.message("Invalid arguments", 0)
			const zone = new Zone(values.slice(0, 3), values.slice(3, 6))
			zone.globalCommand = command
			client.space.portals.push(zone)
			await this.db.saveLevelPortals(client.space)
			client.message("Zone added", 0)
		})
		this.commandRegistry.registerCommand(["/removeallzones"], async (client, message) => {
			if (!this.serverConfiguration.hubEditors.includes(client.authInfo.username) || client.space.name.startsWith("game-")) return
			client.space.portals = []
			await this.db.saveLevelPortals(client.space)
			client.message("Zones removed", 0)
		})
		this.commandRegistry.registerCommand(["/play"], async (client, message) => {
			this.startGame(client)
		})
		this.commandRegistry.registerCommand(["/view"], async (client, message) => {
			const isModerationView = message == "mod" && this.serverConfiguration.moderators.includes(client.authInfo.username)
			this.enterView(client, isModerationView)
		})
		const verifyUsernames = (this.serverConfiguration.verifyUsernames && this.heartbeat)
		this.server.on("clientConnected", async (client, authInfo) => {
			if (this.server.clients.some(otherClient => otherClient.socket.remoteAddress == client.socket.remoteAddress)) {
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
			client.watchdog = new Watchdog(client);
			await this.gotoHub(client)
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
				if (this.commandRegistry.attemptCall(client, message)) return
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
	gotoHub(client) {
		const promise = this.loadLevel(this.serverConfiguration.hubName)
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
		client.message(" ", 2)
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
				client.message("Not inspired? https://www.bing.com/images/feed", 0)
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