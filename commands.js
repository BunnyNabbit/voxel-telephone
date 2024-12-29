const exportLevelAsVox = require("./exportVox.js")
const templates = require("./templates.js")
const Zone = require("./class/Zone.js")
const PushIntegration = require("./class/integrations/PushIntegration.js")

function invertPromptType(promptType) {
	if (promptType == "description") return "build"
	return "description"
}

const help = require("./help.js")

function register(universe) {
	universe.registerCommand(["/rules"], (client) => {
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
	function reasonHasPermission(matchValue, message = "You don't have permission to build in this level!") {
		return function (client) {
			if (client.space.userHasPermission(client.username) == matchValue) {
				if (message) client.message(message, 0)
				return false
			}
			return true
		}
	}
	function reasonHasUserPermission(matchValue, message = "You don't have permission to use this command!") {
		return async function (client) {
			const userRecord = await client.userRecord.data
			if (userRecord.permissions[matchValue]) {
				return true
			}
			if (message) client.message(message, 0)
			return false
		}
	}
	function reasonLevelBlocking(matchValue, message) {
		return function (client) {
			if (client.space.blocking == matchValue) {
				if (message) client.message(message, 0)
				return false
			}
			return true
		}
	}
	function reasonVcrDraining(matchValue, message = "VCR is busy. Try again later?") {
		return function (client) {
			if (client.space.changeRecord.draining == matchValue) {
				if (message) client.message(message, 0)
				return false
			}
			return true
		}
	}
	function makeMultiValidator(reasons = []) {
		return async function (client, str) {
			for (const reason of reasons) {
				if (await reason(client, str) == false) return false
			}
			return true
		}
	}
	universe.registerCommand(["/commit"], async (client) => {
		client.space.loading = true
		await client.space.changeRecord.commit(client.space.changeRecord.actionCount)
		client.space.loading = false
		client.space.inVcr = false
		client.message("Changes commited. VCR mode off", 0)
		client.space.clients.forEach(client => {
			client.emit("playSound", universe.sounds.deactivateVCR)
			client.emit("playSound", universe.sounds.gameTrack)
		})
	}, reasonVcr(false, "Level isn't in VCR mode. /vcr"))
	universe.registerCommand(["/finish"], async (client) => {
		if (client.space && client.space.game && !client.space.changeRecord.draining) {
			const gameType = invertPromptType(client.space.game.promptType)
			console.log(gameType)
			if (gameType == "build") {
				if (client.space.changeRecord.actionCount == 0) {
					client.message("There is nothing. Build the prompt you are given!")
					return
				}
				universe.pushMessage(`${client.authInfo.username} finished a turn (Build)`, PushIntegration.interestType.gameProgression)
				universe.server.clients.forEach(otherClient => {
					otherClient.emit("playSound", client.universe.sounds.complete)
				})
				universe.db.continueGame(client.space.game, client.space.game.next, gameType, client.authInfo.username)
				if (client.space.changeRecord.dirty) await client.space.changeRecord.flushChanges()
				universe.db.addInteraction(client.authInfo.username, client.space.game.next, "built")
				exportLevelAsVox(client.space)
			} else { // describe
				if (!client.currentDescription) {
					client.message("You currently have no description for this build. Write something in chat first!")
					return
				}
				universe.db.addInteraction(client.authInfo.username, client.space.game._id, "described")
				universe.pushMessage(`${client.authInfo.username} finished a turn (Describe)`, PushIntegration.interestType.gameProgression)
				universe.server.clients.forEach(otherClient => {
					otherClient.emit("playSound", client.universe.sounds.complete)
				})
				await universe.db.continueGame(client.space.game, client.space.game.next, gameType, client.authInfo.username, client.currentDescription)
				client.currentDescription = null
			}
			universe.db.addInteraction(client.authInfo.username, client.space.game.root, "complete")
			client.space.doNotReserve = true
			client.space.removeClient(client)
			await universe.gotoHub(client)
		}
	})
	universe.registerCommand(["/report"], async (client, message) => {
		if (client.space && client.space.game) {
			let reason = message
			if (reason.length == 0) reason = "[ Empty report ]"
			universe.db.addInteraction(client.authInfo.username, client.space.game._id, "skip")
			universe.db.addInteraction(client.authInfo.username, client.space.game._id, "report")
			await universe.db.deactivateGame(client.space.game._id)
			await universe.db.addReport(client.authInfo.username, client.space.game._id, reason)
			console.log(`Game reported with reason: "${reason}"`)
			client.message(`Game reported with reason: "${reason}"`, 0)
			client.space.doNotReserve = true
			client.space.removeClient(client);
			await universe.gotoHub(client)
		}
	})
	universe.registerCommand(["/abort"], async (client) => {
		if (client.space.loading) return client.message("Please wait", 0)
		if (client.space.inVcr) {
			client.space.blocks = Buffer.from(await client.space.template(client.space.bounds))
			await client.space.changeRecord.restoreBlockChangesToLevel(client.space)
			client.space.reload()
			client.space.inVcr = false
			client.message("Aborted. VCR mode off", 0)
			client.space.clients.forEach(client => {
				client.emit("playSound", universe.sounds.deactivateVCR)
				client.emit("playSound", universe.sounds.gameTrack)
			})
		} else {
			if (client.space.currentCommand) {
				client.space.blocking = false
				client.space.currentCommand = null
				client.message("Command aborted", 0)
				client.emit("playSound", universe.sounds.abort)
			} else {
				client.message("Nothing happened", 0)
			}
		}
	}, reasonHasPermission(false, "You don't have permission to build in this level!"))
	universe.registerCommand(["/mark"], async (client) => {
		client.space.inferCurrentCommand(client.position.map(value => Math.min(Math.max(Math.floor(value), 0), 63)))
	}, makeMultiValidator([reasonHasPermission(false), reasonLevelBlocking(false, "There are no current commands being run on the level")]))
	universe.registerCommand(["/paint", "/p"], async (client) => {
		client.paintMode = !client.paintMode
		if (client.paintMode) {
			client.message("Paint mode on", 0)
		} else {
			client.message("Paint mode off", 0)
		}
		client.emit("playSound", universe.sounds.toggle)
	})
	universe.registerCommand(["/skip"], async (client,) => {
		if (client.space && client.space.game) {
			universe.db.addInteraction(client.authInfo.username, client.space.game._id, "skip")
			client.space.doNotReserve = true
			client.space.removeClient(client);
			await universe.gotoHub(client)
		}
	})
	universe.registerCommand(["/place", "/pl"], async (client) => {
		if (client.watchdog.rateOperation(1)) return
		const operationPosition = [0, -1, 0].map((offset, index) => client.position[index] + offset).map(value => Math.min(Math.max(Math.floor(value), 0), 63))
		let block = client.heldBlock
		if (operationPosition.some(value => value > 63)) {
			return
		}
		client.space.setBlock(operationPosition, block)
	}, makeMultiValidator([reasonHasPermission(false), reasonVcr(true, "Unable to place block. Level is in VCR mode"), reasonLevelBlocking(true, "Unable to place block. Command in level is expecting additional arguments")]))
	universe.registerCommand(["/clients"], async (client) => {
		client.message("&ePlayers using:", 0)
		universe.server.clients.forEach(otherClient => {
			client.message(`&e  ${otherClient.appName}: &f${otherClient.authInfo.username}`, 0, "> ")
		})
	})
	universe.registerCommand(["/vcr"], async (client) => {
		if (client.space.changeRecord.dirty) await client.space.changeRecord.flushChanges()
		client.space.changeRecord.maxActions = client.space.changeRecord.actionCount
		client.space.toggleVcr()
		client.message(`VCR has ${client.space.changeRecord.actionCount} actions. VCR Controls`, 0)
		client.message(`/rewind (actions) - undos actions`, 0)
		// client.message(`/keyframe (keyframe number) - VCR brings to keyframe`)
		client.message(`/fastforward (actions) - redos rewinded actions`, 0)
		client.message(`/commit - loads current state seen in the VCR preview. will override change record.`, 0)
		client.message(`/abort - aborts VCR preview, loading state as it was before enabling VCR.`, 0)
		client.space.reload()
		client.emit("playSound", universe.sounds.activateVCR)
	}, makeMultiValidator([reasonHasPermission(false, "You don't have permission to build in this level!"), reasonVcrDraining(true), reasonVcr(true, "The level is already in VCR mode")]))
	universe.registerCommand(["/template"], async (client, message) => {
		let template
		switch (message) {
			case "builder":
				template = templates.builder
				break
			case "empty":
				template = templates.empty
				break
			default:
				return client.message("Invalid template name. Use /help templates for a list of templates", 0)
		}
		if (client.space.loading) return client.message("Level is busy seeking. Try again later", 0)
		if (client.space.changeRecord.dirty) await client.space.changeRecord.flushChanges()
		client.space.template = template
		client.space.blocks = Buffer.from(await client.space.template(client.space.bounds))
		await client.space.changeRecord.restoreBlockChangesToLevel(client.space, Math.max(client.space.changeRecord.actionCount, 1))
		client.space.reload()
		client.emit("playSound", universe.sounds.deactivateVCR)
	}, makeMultiValidator([reasonHasPermission(false, "You don't have permission to build in this level!"), reasonVcrDraining(true), reasonVcr(true, "The level is in VCR mode")]))
	universe.registerCommand(["/create"], async (client) => {
		if (client.canCreate && client.space?.name == universe.serverConfiguration.hubName) {
			client.creating = true
			client.message("Enter a description in chat. It can be mundane or imaginative.", 0)
		}
	})
	universe.registerCommand(["/rewind", "/rw", "/undo"], async (client, message) => {
		const count = Math.max(parseInt(message), 0) || 1
		if (client.space.loading) return client.message("Level is busy seeking. Try again later", 0)
		client.space.blocks = Buffer.from(await client.space.template(client.space.bounds))
		await client.space.changeRecord.restoreBlockChangesToLevel(client.space, Math.max(client.space.changeRecord.actionCount - count, 1))
		client.space.reload()
		client.message(`Rewinded. Current actions: ${client.space.changeRecord.actionCount}/${client.space.changeRecord.maxActions}`, 0)
		client.message(`To commit this state use /commit. use /abort to exit VCR`, 0)
		client.emit("playSound", universe.sounds.rewind)
	}, reasonVcr(false, "Level isn't in VCR mode. /vcr"))
	universe.registerCommand(["/fastforward", "/ff", "/redo"], async (client, message) => {
		const count = Math.max(parseInt(message), 0) || 1
		if (client.space.loading) return client.message("Level is busy seeking. Try again later", 0)
		client.space.blocks = Buffer.from(await client.space.template(client.space.bounds))
		await client.space.changeRecord.restoreBlockChangesToLevel(client.space, Math.min(client.space.changeRecord.actionCount + count, client.space.changeRecord.maxActions))
		client.space.reload()
		client.message(`Fast-forwarded. Current actions: ${client.space.changeRecord.actionCount}/${client.space.changeRecord.maxActions}`, 0)
		client.message(`To commit this state use /commit. Use /abort to exit VCR`, 0)
		client.emit("playSound", universe.sounds.fastForward)
	}, reasonVcr(false, "Level isn't in VCR mode. /vcr"))
	universe.registerCommand(["/addzone"], async (client, message) => {
		if (client.space.name.startsWith("game-")) return
		const values = message.split(" ").map(value => parseInt(value)).filter(value => !isNaN(value))
		const command = message.split(" ").slice(6).join(" ")
		if (values.length < 6 || !command) return client.message("Invalid arguments", 0)
		const zone = new Zone(values.slice(0, 3), values.slice(3, 6))
		if (command == "spawnZone") { // special handling for spawnZone
			zone.globalCommand = `spawnZone:${client.orientation[0]},${client.orientation[1]}`
		} else { // all other commands
			zone.globalCommand = command
		}
		client.space.portals.push(zone)
		await universe.db.saveLevelPortals(client.space)
		client.message("Zone added", 0)
	}, reasonHasUserPermission("hubBuilder"))
	universe.registerCommand(["/removeallzones"], async (client) => {
		if (client.space.name.startsWith("game-")) return
		client.space.portals = []
		await universe.db.saveLevelPortals(client.space)
		client.message("Zones removed", 0)
	}, reasonHasUserPermission("hubBuilder"))
	universe.registerCommand(["/play"], async (client) => {
		universe.startGame(client)
	})
	universe.registerCommand(["/view"], async (client, message) => {
		if (message == "mod") {
			const isModerator = await reasonHasUserPermission("moderator")(client)
			if (!isModerator) return
			universe.enterView(client, { viewAll: true, mode: "mod" })
		} else if (message == "user") {
			universe.enterView(client, { viewAll: true, mode: "user", username: client.authInfo.username })
		} else if (!message) {
			universe.enterView(client)
		} else {
			client.message("Unknown view argument. /help view", 0)
		}
	})
	universe.registerCommand(["/main", "/hub", "/spawn"], async (client) => {
		if (client.space) {
			client.space.removeClient(client)
			universe.gotoHub(client)
		}
	})
	universe.registerCommand(["/purge"], async (client, reason) => {
		const selectedTurns = client.selectedTurns
		if (!selectedTurns.description) return
		await universe.db.purgeLastTurn(selectedTurns.description.root, reason)
		await client.space.reloadView(templates.view.level)
		client.message("Turn purged!", 0)
	}, reasonHasUserPermission("moderator"))
	universe.registerCommand(["/diverge", "/fork"], async (client, reason) => {
		const selectedTurns = client.selectedTurns
		if (!selectedTurns.description) return
		if (selectedTurns.description.depth == 0) return client.message("Unable to diverge game.", 0)
		await universe.db.divergeGame(selectedTurns.description, reason)
		await client.space.reloadView(templates.view.level)
		client.message("Game diverged!", 0)
	}, reasonHasUserPermission("moderator"))

	help.register(universe)
}

module.exports = {
	register
}