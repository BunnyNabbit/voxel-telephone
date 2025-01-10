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
	universe.registerCommand(["/rules"], (player) => {
		player.message("== Rules")
		player.message("The point of the game is to see how builds transform when users take turn describing and building.")
		player.message("1. Do not intentionally derail the games. Build and describe as you genuinely see it.")
		player.message("2. Builds and prompts must not be inappropriate.")
	})
	function reasonVcr(matchValue, message) {
		return function (player) {
			if (player.space.inVcr == matchValue) {
				if (message) player.message(message)
				return false
			}
			return true
		}
	}
	function reasonHasPermission(matchValue, message = "You don't have permission to build in this level!") {
		return function (player) {
			if (player.space.userHasPermission(player.username) == matchValue) {
				if (message) player.message(message)
				return false
			}
			return true
		}
	}
	function reasonHasUserPermission(matchValue, message = "You don't have permission to use this command!") {
		return async function (player) {
			const userRecord = await player.userRecord.data
			if (userRecord.permissions[matchValue]) {
				return true
			}
			if (message) player.message(message)
			return false
		}
	}
	function reasonLevelBlocking(matchValue, message) {
		return function (player) {
			if (player.space.blocking == matchValue) {
				if (message) player.message(message)
				return false
			}
			return true
		}
	}
	function reasonVcrDraining(matchValue, message = "VCR is busy. Try again later?") {
		return function (player) {
			if (player.space.changeRecord.draining == matchValue) {
				if (message) player.message(message)
				return false
			}
			return true
		}
	}
	function makeMultiValidator(reasons = []) {
		return async function (player, str) {
			for (const reason of reasons) {
				if (await reason(player, str) == false) return false
			}
			return true
		}
	}
	universe.registerCommand(["/commit"], async (player) => {
		player.space.loading = true
		await player.space.changeRecord.commit(player.space.changeRecord.actionCount)
		player.space.loading = false
		player.space.inVcr = false
		player.message("Changes commited. VCR mode off")
		player.space.clients.forEach(player => {
			player.emit("playSound", universe.sounds.deactivateVCR)
			player.emit("playSound", universe.sounds.gameTrack)
		})
	}, reasonVcr(false, "Level isn't in VCR mode. /vcr"))
	universe.registerCommand(["/finish"], async (player) => {
		if (player.space && player.space.game && !player.space.changeRecord.draining) {
			const gameType = invertPromptType(player.space.game.promptType)
			console.log(gameType)
			if (gameType == "build") {
				if (player.space.changeRecord.actionCount == 0) {
					player.message("There is nothing. Build the prompt you are given!")
					return
				}
				universe.pushMessage(`${player.authInfo.username} finished a turn (Build)`, PushIntegration.interestType.gameProgression)
				universe.server.players.forEach(otherPlayer => {
					otherPlayer.emit("playSound", player.universe.sounds.complete)
				})
				universe.db.continueGame(player.space.game, player.space.game.next, gameType, player.authInfo.username)
				if (player.space.changeRecord.dirty) await player.space.changeRecord.flushChanges()
				universe.db.addInteraction(player.authInfo.username, player.space.game.next, "built")
				exportLevelAsVox(player.space)
			} else { // describe
				if (!player.currentDescription) {
					player.message("You currently have no description for this build. Write something in chat first!")
					return
				}
				universe.db.addInteraction(player.authInfo.username, player.space.game._id, "described")
				universe.pushMessage(`${player.authInfo.username} finished a turn (Describe)`, PushIntegration.interestType.gameProgression)
				universe.server.players.forEach(otherPlayer => {
					otherPlayer.emit("playSound", player.universe.sounds.complete)
				})
				await universe.db.continueGame(player.space.game, player.space.game.next, gameType, player.authInfo.username, player.currentDescription)
				player.currentDescription = null
			}
			universe.db.addInteraction(player.authInfo.username, player.space.game.root, "complete")
			player.space.doNotReserve = true
			player.space.removeClient(player)
			await universe.gotoHub(player)
		}
	})
	universe.registerCommand(["/report"], async (player, message) => {
		if (player.space && player.space.game) {
			let reason = message
			if (reason.length == 0) reason = "[ Empty report ]"
			universe.db.addInteraction(player.authInfo.username, player.space.game._id, "skip")
			universe.db.addInteraction(player.authInfo.username, player.space.game._id, "report")
			await universe.db.deactivateGame(player.space.game._id)
			await universe.db.addReport(player.authInfo.username, player.space.game._id, reason)
			console.log(`Game reported with reason: "${reason}"`)
			player.message(`Game reported with reason: "${reason}"`)
			player.space.doNotReserve = true
			player.space.removeClient(player);
			await universe.gotoHub(player)
		}
	})
	universe.registerCommand(["/abort"], async (player) => {
		if (player.space.loading) return player.message("Please wait")
		if (player.space.inVcr) {
			player.space.blocks = Buffer.from(await player.space.template(player.space.bounds))
			await player.space.changeRecord.restoreBlockChangesToLevel(player.space)
			player.space.reload()
			player.space.inVcr = false
			player.message("Aborted. VCR mode off")
			player.space.clients.forEach(client => {
				client.emit("playSound", universe.sounds.deactivateVCR)
				client.emit("playSound", universe.sounds.gameTrack)
			})
		} else {
			if (player.space.currentCommand) {
				player.space.blocking = false
				player.space.currentCommand = null
				player.message("Command aborted")
				player.emit("playSound", universe.sounds.abort)
			} else {
				player.message("Nothing happened")
			}
		}
	}, reasonHasPermission(false, "You don't have permission to build in this level!"))
	universe.registerCommand(["/mark"], async (player) => {
		player.space.inferCurrentCommand(player.position.map(value => Math.min(Math.max(Math.floor(value), 0), 63)))
	}, makeMultiValidator([reasonHasPermission(false), reasonLevelBlocking(false, "There are no current commands being run on the level")]))
	universe.registerCommand(["/paint", "/p"], async (player) => {
		player.paintMode = !player.paintMode
		if (player.paintMode) {
			player.message("Paint mode on")
		} else {
			player.message("Paint mode off")
		}
		player.emit("playSound", universe.sounds.toggle)
	})
	universe.registerCommand(["/skip"], async (player) => {
		if (player.space && player.space.game) {
			universe.db.addInteraction(player.authInfo.username, player.space.game._id, "skip")
			player.space.doNotReserve = true
			player.space.removeClient(player)
			await universe.gotoHub(player)
		}
	})
	universe.registerCommand(["/place", "/pl"], async (player) => {
		if (player.watchdog.rateOperation(1)) return
		const operationPosition = [0, -1, 0].map((offset, index) => player.position[index] + offset).map(value => Math.min(Math.max(Math.floor(value), 0), 63))
		let block = player.heldBlock
		if (operationPosition.some(value => value > 63)) {
			return
		}
		player.space.setBlock(operationPosition, block)
	}, makeMultiValidator([reasonHasPermission(false), reasonVcr(true, "Unable to place block. Level is in VCR mode"), reasonLevelBlocking(true, "Unable to place block. Command in level is expecting additional arguments")]))
	universe.registerCommand(["/clients"], async (player) => {
		player.message("&ePlayers using:")
		universe.server.players.forEach(otherPlayer => {
			player.message(`&e  ${otherPlayer.client.appName}: &f${otherPlayer.authInfo.username}`, "> ")
		})
	})
	universe.registerCommand(["/vcr"], async (player) => {
		if (player.space.changeRecord.dirty) await player.space.changeRecord.flushChanges()
		player.space.changeRecord.maxActions = player.space.changeRecord.actionCount
		player.space.toggleVcr()
		player.message(`VCR has ${player.space.changeRecord.actionCount} actions. VCR Controls`)
		player.message(`/rewind (actions) - undos actions`)
		// client.message(`/keyframe (keyframe number) - VCR brings to keyframe`)
		player.message(`/fastforward (actions) - redos rewinded actions`)
		player.message(`/commit - loads current state seen in the VCR preview. will override change record.`)
		player.message(`/abort - aborts VCR preview, loading state as it was before enabling VCR.`)
		player.space.reload()
		player.emit("playSound", universe.sounds.activateVCR)
	}, makeMultiValidator([reasonHasPermission(false, "You don't have permission to build in this level!"), reasonVcrDraining(true), reasonVcr(true, "The level is already in VCR mode")]))
	universe.registerCommand(["/template"], async (player, message) => {
		let template
		switch (message) {
			case "builder":
				template = templates.builder
				break
			case "empty":
				template = templates.empty
				break
			default:
				return player.message("Invalid template name. Use /help templates for a list of templates")
		}
		if (player.space.loading) return player.message("Level is busy seeking. Try again later")
		if (player.space.changeRecord.dirty) await player.space.changeRecord.flushChanges()
		player.space.template = template
		player.space.blocks = Buffer.from(await player.space.template(player.space.bounds))
		await player.space.changeRecord.restoreBlockChangesToLevel(player.space, Math.max(player.space.changeRecord.actionCount, 1))
		player.space.reload()
		player.emit("playSound", universe.sounds.deactivateVCR)
	}, makeMultiValidator([reasonHasPermission(false, "You don't have permission to build in this level!"), reasonVcrDraining(true), reasonVcr(true, "The level is in VCR mode")]))
	universe.registerCommand(["/create"], async (player) => {
		if (player.canCreate && player.space?.name == universe.serverConfiguration.hubName) {
			player.creating = true
			player.message("Enter a description in chat. It can be mundane or imaginative.")
		}
	})
	universe.registerCommand(["/rewind", "/rw", "/undo"], async (player, message) => {
		const count = Math.max(parseInt(message), 0) || 1
		if (player.space.loading) return player.message("Level is busy seeking. Try again later")
		player.space.blocks = Buffer.from(await player.space.template(player.space.bounds))
		await player.space.changeRecord.restoreBlockChangesToLevel(player.space, Math.max(player.space.changeRecord.actionCount - count, 1))
		player.space.reload()
		player.message(`Rewinded. Current actions: ${player.space.changeRecord.actionCount}/${player.space.changeRecord.maxActions}`)
		player.message(`To commit this state use /commit. use /abort to exit VCR`)
		player.emit("playSound", universe.sounds.rewind)
	}, reasonVcr(false, "Level isn't in VCR mode. /vcr"))
	universe.registerCommand(["/fastforward", "/ff", "/redo"], async (player, message) => {
		const count = Math.max(parseInt(message), 0) || 1
		if (player.space.loading) return player.message("Level is busy seeking. Try again later")
		player.space.blocks = Buffer.from(await player.space.template(player.space.bounds))
		await player.space.changeRecord.restoreBlockChangesToLevel(player.space, Math.min(player.space.changeRecord.actionCount + count, player.space.changeRecord.maxActions))
		player.space.reload()
		player.message(`Fast-forwarded. Current actions: ${player.space.changeRecord.actionCount}/${player.space.changeRecord.maxActions}`)
		player.message(`To commit this state use /commit. Use /abort to exit VCR`)
		player.emit("playSound", universe.sounds.fastForward)
	}, reasonVcr(false, "Level isn't in VCR mode. /vcr"))
	universe.registerCommand(["/addzone"], async (player, message) => {
		if (player.space.name.startsWith("game-")) return
		const values = message.split(" ").map(value => parseInt(value)).filter(value => !isNaN(value))
		const command = message.split(" ").slice(6).join(" ")
		if (values.length < 6 || !command) return player.message("Invalid arguments")
		const zone = new Zone(values.slice(0, 3), values.slice(3, 6))
		if (command == "spawnZone") { // special handling for spawnZone
			zone.globalCommand = `spawnZone:${player.orientation[0]},${player.orientation[1]}`
		} else { // all other commands
			zone.globalCommand = command
		}
		player.space.portals.push(zone)
		await universe.db.saveLevelPortals(player.space)
		player.message("Zone added")
	}, reasonHasUserPermission("hubBuilder"))
	universe.registerCommand(["/removeallzones"], async (player) => {
		if (player.space.name.startsWith("game-")) return
		player.space.portals = []
		await universe.db.saveLevelPortals(player.space)
		player.message("Zones removed")
	}, reasonHasUserPermission("hubBuilder"))
	universe.registerCommand(["/play"], async (player) => {
		universe.startGame(player)
	})
	universe.registerCommand(["/view"], async (player, message) => {
		if (message == "mod") {
			const isModerator = await reasonHasUserPermission("moderator")(player)
			if (!isModerator) return
			universe.enterView(player, { viewAll: true, mode: "mod" })
		} else if (message == "user") {
			universe.enterView(player, { viewAll: true, mode: "user", username: player.authInfo.username })
		} else if (!message) {
			universe.enterView(player)
		} else {
			player.message("Unknown view argument. /help view")
		}
	})
	universe.registerCommand(["/main", "/hub", "/spawn"], async (player) => {
		if (player.space) {
			player.space.removeClient(player)
			universe.gotoHub(player)
		}
	})
	universe.registerCommand(["/purge"], async (player, reason) => {
		const selectedTurns = player.selectedTurns
		if (!selectedTurns.description) return
		await universe.db.purgeLastTurn(selectedTurns.description.root, reason)
		await player.space.reloadView(templates.view.level)
		player.message("Turn purged!")
	}, reasonHasUserPermission("moderator"))
	universe.registerCommand(["/diverge", "/fork"], async (player, reason) => {
		const selectedTurns = player.selectedTurns
		if (!selectedTurns.description) return
		if (selectedTurns.description.depth == 0) return player.message("Unable to diverge game.")
		await universe.db.divergeGame(selectedTurns.description, reason)
		await player.space.reloadView(templates.view.level)
		player.message("Game diverged!")
	}, reasonHasUserPermission("moderator"))

	help.register(universe)
}

module.exports = {
	register
}