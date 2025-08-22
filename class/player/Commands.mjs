import exportLevelAsVox from "../../exportVox.mjs"
import { templates } from "../level/templates.mjs"
import { Zone } from "../level/Zone.mjs"
import PushIntegration from "../integrations/PushIntegration.mjs"
import { Help } from "../Help.mjs"
import { RealmManagerLevel } from "../level/RealmManagerLevel.mjs"
import { invertPromptType } from "../../utils.mjs"
import { textSymbols } from "../../constants.mjs"
import { ViewLevel } from "../level/ViewLevel.mjs"
import { FastForwardLevel } from "../level/FastForwardLevel.mjs"
import { HubLevel } from "../level/HubLevel.mjs"
import { FormattedString, stringSkeleton } from "../strings/FormattedString.mjs"

let creationLicenses = {}
import("../../creationLicenses.mjs").then((module) => {
	creationLicenses = module.default
})

export class Commands {
	/** */
	static register(universe) {
		universe.registerCommand(["/rules"], (player) => {
			universe.commandRegistry.attemptCall(player, `/help rules`)
		})
		universe.registerCommand(
			["/commit"],
			async (player) => {
				player.space.loading = true
				await player.space.changeRecord.commit(player.space.changeRecord.actionCount, player.space)
				player.space.loading = false
				player.space.inVcr = false
				player.message("Changes committed. VCR mode off")
				player.space.setBlinkText(false)
				player.space.players.forEach((player) => {
					player.emit("playSound", universe.sounds.deactivateVCR)
					player.emit("playSound", universe.sounds.gameTrack)
				})
				player.space.setBlinkText(false)
			},
			Commands.reasonVcr(false, "Level isn't in VCR mode. /vcr")
		)
		universe.registerCommand(["/finish"], async (player) => {
			if (player.space && player.space.game && !player.space.changeRecord.draining) {
				if (player.space.inVcr) return player.message(new FormattedString(stringSkeleton.command.finish.vcrReminder))
				const gameType = invertPromptType(player.space.game.promptType)
				console.log(gameType)
				if (gameType == "build") {
					if (player.space.changeRecord.actionCount == 0) return player.message(new FormattedString(stringSkeleton.command.finish.attemptFinishBuildEmpty))
					universe.pushMessage(`${player.authInfo.username} finished a turn (Build)`, PushIntegration.interestType.gameProgression)
					universe.server.players.forEach((otherPlayer) => {
						otherPlayer.emit("playSound", player.universe.sounds.complete)
					})
					universe.db.continueGame(player.space.game, player.space.game.next, gameType, player.authInfo.username).then(async (status) => {
						if (status.gameCompleted) {
							const game = await universe.db.getGame(status.document.root)
							const firstDescription = game[0].prompt
							const lastDescription = game[game.length - 2].prompt
							universe.pushMessage(`${player.authInfo.username} finished a game! Check out the game that started as &a"${firstDescription}" &fand ended with &a"${lastDescription}" &fIn the view gallery.`, PushIntegration.interestType.gameProgression)
							universe.db.setGameCompletion(status.document.root, true)
						}
					})
					if (player.space.changeRecord.dirty) await player.space.changeRecord.flushChanges()
					universe.db.addInteraction(player.authInfo.username, player.space.game.next, "built")
					exportLevelAsVox(player.space)
				} else {
					// describe
					if (!player.currentDescription) return player.message(new FormattedString(stringSkeleton.command.finish.attemptFinishDescriptionEmpty))
					universe.db.addInteraction(player.authInfo.username, player.space.game._id, "described")
					universe.pushMessage(`${player.authInfo.username} finished a turn (Describe)`, PushIntegration.interestType.gameProgression)
					universe.server.players.forEach((otherPlayer) => {
						otherPlayer.emit("playSound", player.universe.sounds.complete)
					})
					await universe.db.continueGame(player.space.game, player.space.game.next, gameType, player.authInfo.username, player.currentDescription)
					player.currentDescription = null
				}
				universe.db.addInteraction(player.authInfo.username, player.space.game.root, "complete")
				player.space.doNotReserve = true
				player.space.removePlayer(player)
				await HubLevel.teleportPlayer(player)
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
				player.space.removePlayer(player)
				await HubLevel.teleportPlayer(player)
			}
		})
		universe.registerCommand(
			["/abort"],
			async (player) => {
				if (player.space.loading) return player.message("Please wait")
				if (player.space.inVcr) {
					player.space.blocks = Buffer.from(await player.space.template.generate(player.space.bounds))
					await player.space.changeRecord.restoreBlockChangesToLevel(player.space)
					player.space.reload()
					player.space.inVcr = false
					player.message("Aborted. VCR mode off")
					player.space.setBlinkText(false)
					player.space.players.forEach((player) => {
						player.emit("playSound", universe.sounds.deactivateVCR)
						player.emit("playSound", universe.sounds.gameTrack)
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
			},
			Commands.reasonHasPermission(false, new FormattedString(stringSkeleton.command.error.missingBuildPermission))
		)
		universe.registerCommand(
			["/mark"],
			async (player) => {
				player.space.inferCurrentCommand(player.getInferredData(), player)
			},
			Commands.makeMultiValidator([Commands.reasonHasPermission(false), Commands.reasonLevelBlocking(false, "There are no current commands being run on the level")])
		)
		universe.registerCommand(["/paint", "/p"], async (player) => {
			player.paintMode = !player.paintMode
			if (player.paintMode) {
				player.message(new FormattedString(stringSkeleton.command.paint.on))
			} else {
				player.message(new FormattedString(stringSkeleton.command.paint.off))
			}
			player.emit("playSound", universe.sounds.toggle)
		})
		universe.registerCommand(["/repeat", "/static", "/t"], async (player) => {
			player.repeatMode = !player.repeatMode
			if (player.repeatMode) {
				player.message(new FormattedString(stringSkeleton.command.repeat.on))
			} else {
				player.message(new FormattedString(stringSkeleton.command.repeat.off))
			}
			player.emit("playSound", universe.sounds.toggle)
		})
		universe.registerCommand(["/skip"], async (player) => {
			if (player.space && player.space.game) {
				universe.db.addInteraction(player.authInfo.username, player.space.game._id, "skip")
				player.space.doNotReserve = true
				player.space.removePlayer(player)
				await HubLevel.teleportPlayer(player)
			}
		})
		universe.registerCommand(
			["/place", "/pl"],
			async (player) => {
				if (player.watchdog.rateOperation(1)) return
				const operationPosition = player.getBlockPosition()
				let block = player.heldBlock
				player.space.setBlock(operationPosition, block)
			},
			Commands.makeMultiValidator([Commands.reasonHasPermission(false), Commands.reasonVcr(true, new FormattedString(stringSkeleton.level.error.blockBlockingInVCR)), Commands.reasonLevelBlocking(true, new FormattedString(stringSkeleton.command.error.blockBlockingCommand))])
		)
		universe.registerCommand(["/clients"], async (player) => {
			player.message("&ePlayers using:")
			universe.server.players.forEach((otherPlayer) => {
				player.message(`&e  ${otherPlayer.client.appName}: &f${otherPlayer.authInfo.username}`, 0, "> ")
			})
		})
		universe.registerCommand(
			["/vcr"],
			async (player) => {
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
			},
			Commands.makeMultiValidator([Commands.reasonHasPermission(false), Commands.reasonVcrDraining(true), Commands.reasonVcr(true, "The level is already in VCR mode")])
		)
		universe.registerCommand(
			["/template"],
			async (player, message) => {
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
				if (player.space.loading) return player.message(new FormattedString(stringSkeleton.command.error.levelLoading))
				if (player.space.changeRecord.dirty) await player.space.changeRecord.flushChanges()
				player.space.template = template
				player.space.blocks = Buffer.from(await player.space.template.generate(player.space.bounds))
				await player.space.changeRecord.restoreBlockChangesToLevel(player.space, Math.max(player.space.changeRecord.actionCount, 1))
				player.space.reload()
				player.emit("playSound", universe.sounds.deactivateVCR)
			},
			Commands.makeMultiValidator([Commands.reasonHasPermission(false), Commands.reasonVcrDraining(true), Commands.reasonVcr(true, "The level is in VCR mode")])
		)
		universe.registerCommand(["/create"], async (player) => {
			if (player.canCreate && player.space?.name == universe.serverConfiguration.hubName) {
				player.creating = true
				player.message(new FormattedString(stringSkeleton.game.question.description.createGame))
			}
		})
		universe.registerCommand(
			["/rewind", "/rw", "/undo"],
			async (player, message) => {
				const count = Math.max(parseInt(message), 0) || 1
				if (player.space.loading) return player.message(new FormattedString(stringSkeleton.command.error.levelLoading))
				player.space.blocks = Buffer.from(await player.space.template.generate(player.space.bounds))
				await player.space.changeRecord.restoreBlockChangesToLevel(player.space, Math.max(player.space.changeRecord.actionCount - count, 1))
				player.space.reload()
				player.message(`Rewinded. Current actions: ${player.space.changeRecord.actionCount}/${player.space.changeRecord.maxActions}`)
				player.message(`To commit this state use /commit. use /abort to exit VCR`)
				player.emit("playSound", universe.sounds.rewind)
				player.space.setBlinkText(textSymbols.pause, textSymbols.rewind)
			},
			Commands.reasonVcr(false, "Level isn't in VCR mode. /vcr")
		)
		universe.registerCommand(
			["/fastforward", "/ff", "/redo"],
			async (player, message) => {
				const count = Math.max(parseInt(message), 0) || 1
				if (player.space.loading) return player.message(new FormattedString(stringSkeleton.command.error.levelLoading))
				player.space.blocks = Buffer.from(await player.space.template.generate(player.space.bounds))
				await player.space.changeRecord.restoreBlockChangesToLevel(player.space, Math.min(player.space.changeRecord.actionCount + count, player.space.changeRecord.maxActions))
				player.space.reload()
				player.message(`Fast-forwarded. Current actions: ${player.space.changeRecord.actionCount}/${player.space.changeRecord.maxActions}`)
				player.message(`To commit this state use /commit. Use /abort to exit VCR`)
				player.emit("playSound", universe.sounds.fastForward)
				player.space.setBlinkText(textSymbols.pause, textSymbols.fastForward)
			},
			Commands.reasonVcr(false, "Level isn't in VCR mode. /vcr")
		)
		universe.registerCommand(
			["/addzone"],
			async (player, message) => {
				if (player.space.name.startsWith("game-")) return
				const values = message
					.split(" ")
					.map((value) => parseInt(value))
					.filter((value) => !isNaN(value))
				const command = message.split(" ").slice(6).join(" ")
				if (values.length < 6 || !command) return player.message("Invalid arguments")
				const zone = new Zone(values.slice(0, 3), values.slice(3, 6))
				if (command == "spawnZone") {
					// special handling for spawnZone
					zone.globalCommand = `spawnZone:${player.orientation[0]},${player.orientation[1]}`
				} else {
					// all other commands
					zone.globalCommand = command
				}
				player.space.portals.push(zone)
				await universe.db.saveLevelPortals(player.space)
				player.message("Zone added")
			},
			Commands.reasonHasUserPermission("hubBuilder")
		)
		universe.registerCommand(
			["/removeallzones"],
			async (player) => {
				if (player.space.name.startsWith("game-")) return
				player.space.portals = []
				await universe.db.saveLevelPortals(player.space)
				player.message("Zones removed")
			},
			Commands.reasonHasUserPermission("hubBuilder")
		)
		universe.registerCommand(["/play"], async (player) => {
			universe.startGame(player)
		})
		universe.registerCommand(["/view", "/museum", "/gallery"], async (player, message) => {
			if (message == "mod") {
				const isModerator = await Commands.reasonHasUserPermission("moderator")(player)
				if (!isModerator) return
				ViewLevel.teleportPlayer(player, { viewAll: true, mode: "mod" })
			} else if (message == "user") {
				ViewLevel.teleportPlayer(player, { viewAll: true, mode: "user", username: player.authInfo.username })
			} else if (message == "purged") {
				const isModerator = await Commands.reasonHasUserPermission("moderator")(player)
				if (!isModerator) return
				ViewLevel.teleportPlayer(player, { viewAll: true, mode: "purged", username: player.authInfo.username })
			} else if (!message) {
				ViewLevel.teleportPlayer(player)
			} else {
				player.message("Unknown view argument. /help view")
			}
		})
		universe.registerCommand(["/main", "/hub", "/spawn", "/h", "/wmain", "/worldmain"], async (player) => {
			if (player.space) {
				player.space.removePlayer(player)
				HubLevel.teleportPlayer(player)
			}
		})
		universe.registerCommand(
			["/purge"],
			async (player, reason) => {
				const selectedTurns = player.selectedTurns
				if (!selectedTurns.description) return
				await universe.db.purgeLastTurn(selectedTurns.description.root, reason)
				await player.space.reloadView(templates.empty)
				player.message("Turn purged!")
			},
			Commands.reasonHasUserPermission("moderator")
		)
		universe.registerCommand(
			["/diverge", "/fork"],
			async (player, reason) => {
				const selectedTurns = player.selectedTurns
				if (!selectedTurns.description) return
				if (selectedTurns.description.depth == 0) return player.message("Unable to diverge game.")
				await universe.db.divergeGame(selectedTurns.description, reason)
				await player.space.reloadView(templates.empty)
				player.message("Game diverged!")
			},
			Commands.reasonHasUserPermission("moderator")
		)
		universe.registerCommand(["/playback"], async (player) => {
			const selectedTurns = player.selectedTurns
			if (!selectedTurns?.description) return player.message("No game is selected.")
			const game = await universe.db.getGame(selectedTurns.description.root)
			if (game.length !== 16) return player.message("Game is not complete.")
			FastForwardLevel.teleportPlayer(player, game)
		})

		universe.registerCommand(["/setting"], async (player, message) => {
			const interpretBoolean = (str) => {
				if (str == "true" || str == "on" || str == "1" || str == "yes") return true
				if (str == "false" || str == "off" || str == "0" || str == "no") return false
				return null
			}
			const setting = message.split(" ")[0]
			const value = interpretBoolean(message.split(" ")[1])
			const userRecord = await player.userRecord.get()
			if (value == null) return player.message("Invalid value. Must be true or false.")
			switch (setting) {
				case "music":
					userRecord.configuration.cefMusic = value
					break
				case "sounds":
					userRecord.configuration.cefSounds = value
					break
				default:
					return player.message("Unknown setting. /help setting")
			}
			player.message(`Setting ${setting} to ${value}`)
			player.emit("configuration", userRecord.configuration)
		})

		universe.registerCommand(["/license"], async (player, licenseName) => {
			const selectedTurns = player.selectedTurns
			if (!licenseName && selectedTurns && selectedTurns.build) {
				// Show current licenses
				const buildTurn = selectedTurns.build
				const licenses = buildTurn.licenses ?? []
				if (licenses.length == 0) {
					player.message("No licenses found.")
				} else {
					player.message("Current licenses:")
					licenses.forEach((license) => {
						const licenseData = creationLicenses[license]
						if (licenseData) player.message(`- ${licenseData.name} (${license})`)
					})
				}
				return
			}
			licenseName = licenseName.toUpperCase()
			if (!creationLicenses[licenseName]) {
				if (licenseName.length) player.message("Unknown license.")
				universe.commandRegistry.attemptCall(player, `/help license`)
				return
			}
			if (!selectedTurns || !selectedTurns.description) return player.message("No game is selected.")
			// check ownership
			const buildTurn = selectedTurns.build
			if (!buildTurn) return player.message("No build selected.")
			if (!buildTurn.creators.includes(player.authInfo.username)) return player.message("You are not the owner of this build.")
			const license = creationLicenses[licenseName]
			// check if license already exists
			const exists = (buildTurn.licenses ?? []).includes(licenseName)
			if (exists) return player.message("License already exists.")
			universe.db.addTurnLicense(buildTurn._id, licenseName, license.licenseData).then(() => {
				player.message(`Added license ${license.name} to ${selectedTurns.description.prompt}.`)
				player.space.reloadView(templates.empty)
			})
		})

		universe.registerCommand(["/realm", "/os", "/myrealm"], async (player) => {
			ViewLevel.teleportPlayer(player, { viewAll: true, mode: "realm", player: player.authInfo.username, levelClass: RealmManagerLevel })
			return
		})

		function unimplementedCommandHelper(commands, helpTopic) {
			universe.registerCommand(commands, (player) => {
				player.message("&cThis command is unavailable:")
				universe.commandRegistry.attemptCall(player, `/help ${helpTopic}`)
				player.message("&cFor help on existing commands and topics, use /help")
			})
		}

		unimplementedCommandHelper(["/levels", "/worlds", "/maps", "/goto", "/g", "/gr", "/gotorandom", "/joinrandom", "/move", "/teleport", "/tp"], "where-are-levels")
		unimplementedCommandHelper(["/ranks"], "where-are-ranks")

		Help.register(universe)
	}

	static reasonVcr(matchValue, message) {
		return function (player) {
			if (player.space.inVcr == matchValue) {
				if (message) player.message(message)
				return false
			}
			return true
		}
	}

	static reasonHasPermission(matchValue, message = new FormattedString(stringSkeleton.command.error.missingBuildPermission)) {
		return function (player) {
			if (player.space.userHasPermission(player.username) == matchValue) {
				if (message) player.message(message)
				return false
			}
			return true
		}
	}

	static reasonHasUserPermission(matchValue, message = new FormattedString(stringSkeleton.command.error.missingPermission)) {
		return async function (player) {
			const userRecord = await player.userRecord.get()
			if (userRecord.permissions[matchValue]) return true
			if (message) player.message(message)
			return false
		}
	}

	static reasonLevelBlocking(matchValue, message) {
		return function (player) {
			if (player.space.blocking == matchValue) {
				if (message) player.message(message)
				return false
			}
			return true
		}
	}

	static reasonVcrDraining(matchValue, message = new FormattedString(stringSkeleton.command.error.drainingVCR)) {
		return function (player) {
			if (player.space.changeRecord.draining == matchValue) {
				if (message) player.message(message)
				return false
			}
			return true
		}
	}

	static makeMultiValidator(reasons = []) {
		return async function (player, str) {
			for (const reason of reasons) {
				if ((await reason(player, str)) == false) return false
			}
			return true
		}
	}
}
