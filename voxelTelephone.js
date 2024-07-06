const Server = require("classicborne-server-protocol")
const serverConfiguration = require("./config.json")
console.log(serverConfiguration)
const server = new Server(serverConfiguration.port)
server.clients = []
server.extensions.push({
	name: "MessageTypes",
	version: 1
})
const db = require("./db.js")
const crypto = require("crypto")
const fs = require("fs")
const qs = require("qs")
const salt = crypto.randomBytes(82).toString("hex")
const filter = require("./filter.js")
const filterMessages = serverConfiguration.replacementMessages
const axios = require("axios")
const exportLevelAsVox = require("./exportVox.js")

let forceZero = false
let pinged = false
async function postHeartbeat() {
	let clientCount = Math.min(server.clients.length, 32)
	if (forceZero) clientCount = 0
	// console.log("clients:", clientCount)
	const pingURL = `https://www.classicube.net/server/heartbeat/`
	const form = {
		name: serverConfiguration.serverName,
		port: serverConfiguration.port.toString(),
		users: clientCount.toString(),
		max: "64",
		software: "Classicborne Protocol",
		public: "true",
		salt: salt.toString("hex"),
	}
	axios.post(pingURL, qs.stringify(form)).then((response) => {
		if (pinged == false) console.log(response.data)
		pinged = true
	}).catch((err) => {
		console.log(err)
	})
}

if (serverConfiguration.postToMainServer) {
	setInterval(() => {
		postHeartbeat()
	}, 60000)
	postHeartbeat()
}

function clamp(number, min, max) {
	return Math.min(Math.max(number, min), max)
}
function createEmpty(bounds) {
	return Buffer.alloc(bounds[0] * bounds[1] * bounds[2])
}
const nbt = require("nbt")
let builderTemplate = null
nbt.parse(fs.readFileSync(`./voxel-telephone-64.cw`), async (error, data) => {
	if (error) throw error
	builderTemplate = data.value.BlockArray.value
})
function createBuilder() {
	if (!builderTemplate) throw "Builder template not found"
	return Buffer.from(builderTemplate)
}
const noop = () => { }
const defaultTexturePackUrl = serverConfiguration.texturePackUrl
const defaultEnvironment = {
	sidesId: 250,
	edgeId: 250,
	edgeHeight: 0
}

class Watchdog {
	constructor(client) {
		this.interval = setInterval(() => {
			this.currentRate = 0
		}, 1000)
		this.currentRate = 0
		this.limit = 382
		this.client = client
	}
	rateOperation(amount = 1) {
		this.currentRate += amount
		if (this.currentRate > this.limit) {
			this.client.disconnect("Sanctioned: Watchdog triggered")
			return true
		}
		return false
	}
	destroy() {
		clearInterval(this.interval)
	}
}

// const nbt = require("./nbt/nbt.js")
// const palette = []
// nbt.parse(fs.readFileSync(`./voxel-telephone-64.cw`), async (error, data) => {
// 	Object.values(data.value.Metadata.value.CPE.value.BlockDefinitions.value).reverse().forEach(blockDefinition => {
// 		// console.log(blockDefinition.value.ID2.value)
// 		const element = [1, 2, 3].map((value) => blockDefinition.value.Fog.value[value])
// 		element.push(blockDefinition.value.BlockDraw.value)
// 		palette.push(element)
// 		// palette.push("#" + blockDefinition.value.Fog.value[1].toString(16).padStart(2,0) + blockDefinition.value.Fog.value[2].toString(16).padStart(2,0) + blockDefinition.value.Fog.value[3].toString(16).padStart(2,0))
// 	})
// 	// console.log(palette)
// 	fs.writeFileSync("./6-8-5-rgb.json", JSON.stringify(palette))
// })

function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms)
	})
}

const ChangeRecord = require("./ChangeRecord.js")
const Level = require("./Level.js")
const defaultBlockset = JSON.parse(fs.readFileSync("./6-8-5-rgb.json").toString())

const levels = new Map()
const playerReserved = db.playerReserved
function loadLevel(spaceName, defaults = {}) {
	const cached = levels.get(spaceName)
	if (cached) return cached
	const promise = new Promise(async resolve => {
		const bounds = defaults.bounds ?? [64, 64, 64]
		const template = defaults.template ?? createEmpty
		const level = new Level(bounds, template(bounds))
		level.template = template
		level.name = spaceName
		level.blockset = defaults.blockset ?? defaultBlockset
		level.environment = defaults.environment ?? defaultEnvironment
		level.texturePackUrl = defaults.texturePackUrl ?? defaultTexturePackUrl
		level.allowList = defaults.allowList ?? []
		level.changeRecord = new ChangeRecord(`./blockRecords/${spaceName}/`, null, async () => {
			await level.changeRecord.restoreBlockChangesToLevel(level)
			resolve(level)
		})
	})
	levels.set(spaceName, promise)
	return promise
}
const hubDefaults = {
	template: createEmpty,
	allowList: serverConfiguration.hubEditors
}
const builderDefaults = {
	template: createBuilder
}
const describeDefaults = {
	template: createEmpty,
	allowList: []
}
const hubName = serverConfiguration.hubName;
loadLevel(hubName, hubDefaults).then(async level => {
	level.on("clientRemoved", async () => {
		if (level.clients.length == 0 && !level.changeRecord.draining && level.changeRecord.dirty) {
			console.log("Saving", level.name)
			const size = await level.changeRecord.flushChanges()
			console.log(`Saved ${size}`)
		}
	})
	level.on("clientAdded", () => {

	})
	level.portals = await db.getPortals(level.name)
})

const listOperators = serverConfiguration.listOperators
server.addClient = (client) => {
	for (let i = 0; i < 127; i++) {
		if (!server.clients.some(client => client.netId == i)) {
			client.netId = i
			server.clients.forEach(otherClient => {
				client.addPlayerName(otherClient.netId, otherClient.authInfo.username, `&7${otherClient.authInfo.username}`)
			})
			server.clients.push(client)
			server.clients.forEach(anyClient => {
				anyClient.addPlayerName(i, client.authInfo.username, `&7${client.authInfo.username}`)
			})
			return
		}
	}

	throw "Unable to generate unique player ID"
}
server.removeClient = (client) => {
	const clientIndex = server.clients.indexOf(client)
	if (clientIndex !== -1) server.clients.splice(clientIndex, 1)
	server.clients.forEach(anyClient => {
		anyClient.removePlayerName(client.netId)
	})
}
function randomIntFromInterval(min, max) {
	return Math.floor(Math.random() * (max - min + 1) + min)
}

function invertPromptType(promptType) {
	if (promptType == "description") return "build"
	return "description"
}

async function main(params) {
	// console.log(new mongojs.ObjectID().getTimestamp())
	return
	console.log("Start")
	const games = await db.findActiveGames()
	console.log(games)
	if (games.length)
		db.continueGame(games[0], games[0].next, "build")
}
main()

async function startGame(client) {
	if (client.teleporting == true) return
	client.teleporting = true
	client.message("teleport", 0)
	const games = await db.findActiveGames(client.authInfo.username, levels)
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
			loadLevel(`game-${game.next}`, builderDefaults).then((level) => {
				level.on("clientRemoved", async (client) => {
					if (!level.changeRecord.dirty) {
						await level.dispose()
						levels.delete(level.name)
						return
					}
					db.addInteraction(client.authInfo.username, game.next, "built")
					exportLevelAsVox(level)
					if (level.doNotReserve) return
					// reserve game for player
					playerReserved.set(client.authInfo.username, level.game)
					console.log("reserved game")
					if (!level.changeRecord.draining) {
						level.changeRecord.flushChanges()
					}
					const timeout = setTimeout(async () => {
						await level.dispose()
						levels.delete(level.name)
						playerReserved.delete(client.authInfo.username)
						console.log("removed reserved game")
					}, 7200000) // two hours
					level.once("clientAdded", () => {
						client.message(">> Returned to this game because it was reserved for you.")
						client.message(">> Games will only be reserved for two hours.")
						playerReserved.delete(client.authInfo.username)
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
			loadLevel(`game-${game._id}`, describeDefaults).then((level) => { // TODO: position
				level.on("clientRemoved", async (client) => {
					level.dispose()
					levels.delete(level.name)
				})
				level.game = game
				level.addClient(client, [40, 65, 31])
				client.teleporting = false
			})
		}

	} else {
		await gotoHub(client)
		if (canCreateCooldown.has(client.authInfo.username) == false) {
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

function gotoHub(client) {
	const promise = loadLevel(hubName)
	client.message("Hub", 1)
	client.message(" ", 2)
	client.message(" ", 3)
	promise.then(level => {
		level.addClient(client, [60, 8, 4], [162, 254])
	})
	return promise
}

const canCreateCooldown = new Set()

const GlobalCommandRegistry = require("./GlobalCommandRegistry.js")
const Zone = require("./Zone.js")
const commandRegistry = new GlobalCommandRegistry()
commandRegistry.registerCommand(["/rules"], (client) => {
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
commandRegistry.registerCommand(["/commit"], async (client) => {
	client.space.loading = true
	await client.space.changeRecord.commit(client.space.changeRecord.actionCount)
	client.space.loading = false
	client.space.inVcr = false
	client.message("Changes commited. VCR mode off", 0)
}, reasonVcr(false, "Level isn't in VCR mode. /vcr"))
commandRegistry.registerCommand(["/finish"], async (client) => {
	if (client.space && client.space.game && !client.space.changeRecord.draining) {
		const gameType = invertPromptType(client.space.game.promptType)
		console.log(gameType)
		if (gameType == "build") {
			if (client.space.changeRecord.actionCount == 0) {
				client.message("There is nothing. Build the prompt you are given!")
				return
			}
			server.clients.forEach(otherClient => otherClient.message(`${client.authInfo.username} finished a turn (Build)`, 0))
			db.continueGame(client.space.game, client.space.game.next, gameType)
			if (client.space.changeRecord.dirty) await client.space.changeRecord.flushChanges()
			db.addInteraction(client.authInfo.username, client.space.game.next, "built")
			exportLevelAsVox(client.space)
		} else { // describe
			if (!client.currentDescription) {
				client.message("You currently have no description for this build. Write something in chat first!")
				return
			}
			db.addInteraction(client.authInfo.username, client.space.game._id, "described")
			server.clients.forEach(otherClient => otherClient.message(`${client.authInfo.username} finished a turn (Describe)`, 0))
			await db.continueGame(client.space.game, client.space.game.next, gameType, client.currentDescription)
			client.currentDescription = null
		}
		db.addInteraction(client.authInfo.username, client.space.game.root, "complete")
		client.space.doNotReserve = true
		client.space.removeClient(client)
		await gotoHub(client)
	}
})
commandRegistry.registerCommand(["/report"], async (client, message) => {
	if (client.space && client.space.name !== hubName) {
		let reason = message
		if (reason.length == 0) reason = "[ Empty report ]"
		db.addInteraction(client.authInfo.username, client.space.game._id, "skip")
		db.addInteraction(client.authInfo.username, client.space.game._id, "report")
		await db.deactivateGame(client.space.game._id)
		await db.addReport(client.authInfo.username, client.space.game._id, reason)
		console.log(`Game reported with reason: "${reason}"`)
		client.message(`Game reported with reason: "${reason}"`, 0)
		client.space.doNotReserve = true
		client.space.removeClient(client);
		await gotoHub(client)
	}
})
commandRegistry.registerCommand(["/abort"], async (client) => {
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
commandRegistry.registerCommand(["/mark"], async (client) => {
	if (!client.space.blocking) {
		client.message("There are no current commands being run on the level", 0)
		return
	}
	client.space.inferCurrentCommand(client.position.map(value => Math.min(Math.max(Math.floor(value), 0), 63)))
}, reasonHasPermission(false, "You don't have permission to build in this level!"))
commandRegistry.registerCommand(["/paint"], async (client) => {
	client.paintMode = !client.paintMode
	if (client.paintMode) {
		client.message("Paint mode on", 0)
	} else {
		client.message("Paint mode off", 0)
	}
})
commandRegistry.registerCommand(["/help"], async (client) => { // TODO: this should be replaced by a different system
	client.message("/cuboid", 0)
	client.message("/place", 0)
	client.message("/mark", 0)
	client.message("/vcr - rewind mistakes", 0)
	client.message("/paint - toggles paint mode", 0)
	client.message("/abort - abort interactive operations", 0)
})
commandRegistry.registerCommand(["/skip"], async (client,) => {
	if (client.space && client.space.name !== hubName) {
		db.addInteraction(client.authInfo.username, client.space.game._id, "skip")
		client.space.doNotReserve = true
		client.space.removeClient(client);
		await gotoHub(client)
	}
})
commandRegistry.registerCommand(["/pl", "/place"], async (client) => {
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
commandRegistry.registerCommand(["/clients"], async (client) => {
	client.message("&ePlayers using:", 0)
	server.clients.forEach(otherClient => {
		client.message(`&e  ${otherClient.socket.appName}: &f${otherClient.authInfo.username}`, 0, "> ")
	})
})
commandRegistry.registerCommand(["/vcr"], async (client) => {
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
commandRegistry.registerCommand(["/create"], async (client) => {
	if (client.canCreate && client.space?.name == hubName) {
		client.creating = true
		client.message("Enter a description in chat. It can be mundane or imaginative.", 0)
	}
})
commandRegistry.registerCommand(["/rewind", "/rw", "/undo"], async (client, message) => {
	if (!client.space.inVcr) return client.message("Level isn't in VCR mode. /vcr", 0)
	const count = Math.max(parseInt(message), 0) || 1
	if (client.space.loading) return client.message("Level is busy seeking. Try again later", 0)
	client.space.blocks = client.space.template(client.space.bounds)
	await client.space.changeRecord.restoreBlockChangesToLevel(client.space, Math.max(client.space.changeRecord.actionCount - count, 1))
	client.space.reload()
	client.message(`Rewinded. Current actions: ${client.space.changeRecord.actionCount}/${client.space.changeRecord.maxActions}`, 0)
	client.message(`To commit this state use /commit. use /abort to exit VCR`, 0)
})
commandRegistry.registerCommand(["/fastforward", "/ff", "/redo"], async (client, message) => {
	if (!client.space.inVcr) return client.message("Level isn't in VCR mode. /vcr", 0)
	const count = Math.max(parseInt(message), 0) || 1
	if (client.space.loading) return client.message("Level is busy seeking. Try again later", 0)
	client.space.blocks = client.space.template(client.space.bounds)
	await client.space.changeRecord.restoreBlockChangesToLevel(client.space, Math.min(client.space.changeRecord.actionCount + count, client.space.changeRecord.maxActions))
	client.space.reload()
	client.message(`Fast-forwarded. Current actions: ${client.space.changeRecord.actionCount}/${client.space.changeRecord.maxActions}`, 0)
	client.message(`To commit this state use /commit. Use /abort to exit VCR`, 0)
})
commandRegistry.registerCommand(["/addzone"], async (client, message) => {
	if (!serverConfiguration.hubEditors.includes(client.authInfo.username) || client.space.name.startsWith("game-")) return
	const values = message.split(" ").map(value => parseInt(value)).filter(value => !isNaN(value))
	const command = message.split(" ").slice(6).join(" ")
	if (values.length < 6 || !command) return client.message("Invalid arguments", 0)
	const zone = new Zone(values.slice(0, 3), values.slice(3, 6))
	zone.globalCommand = command
	client.space.portals.push(zone)
	await db.saveLevelPortals(client.space)
	client.message("Zone added", 0)
})
commandRegistry.registerCommand(["/removeallzones"], async (client, message) => {
	if (!serverConfiguration.hubEditors.includes(client.authInfo.username) || client.space.name.startsWith("game-")) return
	client.space.portals = []
	await db.saveLevelPortals(client.space)
	client.message("Zones removed", 0)
})
commandRegistry.registerCommand(["/play"], async (client, message) => {
	startGame(client)
})
commandRegistry.registerCommand(["/view"], async (client, message) => {
	if (client.warned) return
	client.warned = true
	client.message("View mode has not been developed. Check back later! I am still collecting games.", 0)
})
server.on("clientConnected", async (client, authInfo) => {
	if (server.clients.some(otherClient => otherClient.socket.remoteAddress == client.socket.remoteAddress)) {
		return client.disconnect("Too many connections!")
	}
	if (server.clients.some(otherClient => otherClient.authInfo.username == authInfo.username)) {
		return client.disconnect("Another client already has that name")
	}
	if (serverConfiguration.verifyUsernames && crypto.createHash("md5").update(salt + authInfo.username).digest("hex") !== authInfo.key) {
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
	commandRegistry.attemptCall(client, "/rules")
	if (listOperators.includes(authInfo.username)) {
		client.message("* You are considered a list operator.", 0)
		client.message("* To force the heartbeat to post zero players, use /forcezero", 0)
	}
	server.addClient(client)
	server.clients.forEach(otherClient => otherClient.message(`+ ${client.authInfo.username} connected`, 0))
	client.serverIdentification("Voxel Telephone", "a silly game", 0x64)
	client.watchdog = new Watchdog(client);
	// (await loadLevel(hubName)).addClient(client, [60, 8, 4], [162, 254])
	await gotoHub(client)
	client.on("setBlock", operation => {
		if (client.watchdog.rateOperation()) return
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
		if (commandRegistry.attemptCall(client, message)) return
		// a few hardcoded commands
		if (message == "/forcezero" && listOperators.includes(client.authInfo.username)) {
			forceZero = true
			console.log(`! ${client.authInfo.username} forced heartbeat players to zero`)
			server.clients.forEach(otherClient => otherClient.message(`! ${client.authInfo.username} forced heartbeat players to zero`, 0))
			return
		}
		if (client.watchdog.rateOperation(20)) return
		// pass this to the level
		if (message.startsWith("/")) {
			if (!client.space.userHasPermission(client.authInfo.username)) return client.message("You don't have permission to build in this level", 0)
			if (client.space.inVcr) {
				client.message("Unable to use commands. Level is in VCR mode", 0)
				return
			}
			client.space.interpretCommand(message.replace("/", ""))
		} else {
			if (filter.matches(message)) {
				server.clients.forEach(otherClient => otherClient.message(`&7${client.authInfo.username}: &f${filterMessages[0, randomIntFromInterval(0, filterMessages.length - 1)]}`, 0))
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
				canCreateCooldown.add(client.authInfo.username)
				client.message("Your description has been submitted!", 0)
				const game = await db.createNewGame(message, client.authInfo.username)
				// addInteraction(client.authInfo.username, game._id, "complete")
				db.addInteraction(client.authInfo.username, game._id, "skip")
				setTimeout(() => {
					canCreateCooldown.delete(client.authInfo.username)
				}, 3600000) // one hour
			} else {
				server.clients.forEach(otherClient => otherClient.message(`&7${client.authInfo.username}: &f${message}`, 0))
			}
		}
	})
	client.on("close", () => {
		if (client.space) {
			client.space.removeClient(client)
			client.watchdog.destroy()
			server.removeClient(client)
			server.clients.forEach(otherClient => otherClient.message(`- ${client.authInfo.username} disconnected`, 0))
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
			// portal detection
			client.space.portals.forEach(portal => {
				if (portal.intersects(client.position)) {
					if (portal.globalCommand) {
						commandRegistry.attemptCall(client, portal.globalCommand)
					}
				}
			})
		}
	})
})
console.log("Server")