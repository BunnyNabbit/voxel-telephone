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
	function reasonHasPermission(matchValue, message) {
		return function (client) {
			if (client.space.userHasPermission(client.authInfo.username) == matchValue) {
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
	universe.registerCommand(["/commit"], async (client) => {
		client.space.loading = true
		await client.space.changeRecord.commit(client.space.changeRecord.actionCount)
		client.space.loading = false
		client.space.inVcr = false
		client.message("Changes commited. VCR mode off", 0)
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
				universe.server.clients.forEach(otherClient => otherClient.message(`${client.authInfo.username} finished a turn (Build)`, 0))
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
				universe.server.clients.forEach(otherClient => otherClient.message(`${client.authInfo.username} finished a turn (Describe)`, 0))
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
	universe.registerCommand(["/mark"], async (client) => {
		if (!client.space.blocking) {
			client.message("There are no current commands being run on the level", 0)
			return
		}
		client.space.inferCurrentCommand(client.position.map(value => Math.min(Math.max(Math.floor(value), 0), 63)))
	}, reasonHasPermission(false, "You don't have permission to build in this level!"))
	universe.registerCommand(["/paint"], async (client) => {
		client.paintMode = !client.paintMode
		if (client.paintMode) {
			client.message("Paint mode on", 0)
		} else {
			client.message("Paint mode off", 0)
		}
	})
	universe.registerCommand(["/help"], async (client) => { // TODO: this should be replaced by a different system
		client.message("/cuboid", 0)
		client.message("/place", 0)
		client.message("/mark", 0)
		client.message("/vcr - rewind mistakes", 0)
		client.message("/paint - toggles paint mode", 0)
		client.message("/abort - abort interactive operations", 0)
	})
	universe.registerCommand(["/skip"], async (client,) => {
		if (client.space && client.space.game) {
			universe.db.addInteraction(client.authInfo.username, client.space.game._id, "skip")
			client.space.doNotReserve = true
			client.space.removeClient(client);
			await universe.gotoHub(client)
		}
	})
	universe.registerCommand(["/pl", "/place"], async (client) => {
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
	universe.registerCommand(["/clients"], async (client) => {
		client.message("&ePlayers using:", 0)
		universe.server.clients.forEach(otherClient => {
			client.message(`&e  ${otherClient.socket.appName}: &f${otherClient.authInfo.username}`, 0, "> ")
		})
	})
	universe.registerCommand(["/vcr"], async (client) => {
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
	universe.registerCommand(["/create"], async (client) => {
		if (client.canCreate && client.space?.name == universe.serverConfiguration.hubName) {
			client.creating = true
			client.message("Enter a description in chat. It can be mundane or imaginative.", 0)
		}
	})
	universe.registerCommand(["/rewind", "/rw", "/undo"], async (client, message) => {
		if (!client.space.inVcr) return client.message("Level isn't in VCR mode. /vcr", 0)
		const count = Math.max(parseInt(message), 0) || 1
		if (client.space.loading) return client.message("Level is busy seeking. Try again later", 0)
		client.space.blocks = client.space.template(client.space.bounds)
		await client.space.changeRecord.restoreBlockChangesToLevel(client.space, Math.max(client.space.changeRecord.actionCount - count, 1))
		client.space.reload()
		client.message(`Rewinded. Current actions: ${client.space.changeRecord.actionCount}/${client.space.changeRecord.maxActions}`, 0)
		client.message(`To commit this state use /commit. use /abort to exit VCR`, 0)
	})
	universe.registerCommand(["/fastforward", "/ff", "/redo"], async (client, message) => {
		if (!client.space.inVcr) return client.message("Level isn't in VCR mode. /vcr", 0)
		const count = Math.max(parseInt(message), 0) || 1
		if (client.space.loading) return client.message("Level is busy seeking. Try again later", 0)
		client.space.blocks = client.space.template(client.space.bounds)
		await client.space.changeRecord.restoreBlockChangesToLevel(client.space, Math.min(client.space.changeRecord.actionCount + count, client.space.changeRecord.maxActions))
		client.space.reload()
		client.message(`Fast-forwarded. Current actions: ${client.space.changeRecord.actionCount}/${client.space.changeRecord.maxActions}`, 0)
		client.message(`To commit this state use /commit. Use /abort to exit VCR`, 0)
	})
	universe.registerCommand(["/addzone"], async (client, message) => {
		if (!universe.serverConfiguration.hubEditors.includes(client.authInfo.username) || client.space.name.startsWith("game-")) return
		const values = message.split(" ").map(value => parseInt(value)).filter(value => !isNaN(value))
		const command = message.split(" ").slice(6).join(" ")
		if (values.length < 6 || !command) return client.message("Invalid arguments", 0)
		const zone = new Zone(values.slice(0, 3), values.slice(3, 6))
		zone.globalCommand = command
		client.space.portals.push(zone)
		await universe.db.saveLevelPortals(client.space)
		client.message("Zone added", 0)
	})
	universe.registerCommand(["/removeallzones"], async (client, message) => {
		if (!universe.serverConfiguration.hubEditors.includes(client.authInfo.username) || client.space.name.startsWith("game-")) return
		client.space.portals = []
		await universe.db.saveLevelPortals(client.space)
		client.message("Zones removed", 0)
	})
	universe.registerCommand(["/play"], async (client, message) => {
		universe.startGame(client)
	})
	universe.registerCommand(["/view"], async (client, message) => {
		const isModerationView = message == "mod" && universe.serverConfiguration.moderators.includes(client.authInfo.username)
		universe.enterView(client, isModerationView)
	})
	universe.registerCommand(["/main", "/hub", "/spawn"], async (client, message) => {
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
}

module.exports = {
	register
}