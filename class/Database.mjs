import mongojs from "mongojs"
import { Zone } from "./level/Zone.mjs"
import { UserRecord } from "./player/UserRecord.mjs"

export class Database {
	constructor(serverConfiguration) {
		this.gameCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephone")
		this.downloadsCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephoneDownloads")
		this.reportCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephoneReports")
		this.interactionCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephoneInteractions")
		this.portalCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephonePortals")
		this.userCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephoneUsers")
		this.banCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephoneBans")
		this.ledgerCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephoneLedger")
		this.purgedCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephonePurged")
		this.playerReserved = new Map()
	}
	findActiveGames(username, levels) {
		return new Promise(resolve => {
			const games = []
			// find reserved game if it exists
			const reserved = this.playerReserved.get(username)
			if (reserved) return resolve([reserved])
			this.gameCollection.find({ active: true }, async (err, docs) => {
				if (err) return resolve([])
				for (let i = 0; i < docs.length; i++) {
					const game = docs[i]
					// check if game id is already active as a level
					if (levels.has(`game-${game.next}`) || levels.has(`game-${game._id}`)) continue
					// check if user has skipped the current ID, or already completed the root ID.
					const completeInteraction = await this.getInteraction(username, game.root, "complete")
					if (completeInteraction) continue
					const skipInteraction = await this.getInteraction(username, game._id, "skip")
					if (skipInteraction) continue
					games.push(game)
				}
				resolve(games)
			})
		})
	}

	getGame(gameRootId) {
		return new Promise(resolve => {
			this.gameCollection.find({ root: gameRootId }).sort({ depth: 1 }, (err, games) => {
				resolve(games)
			})
		})
	}

	getGames(cursor, limit = 9, onlyCompleted) {
		return new Promise(resolve => {
			const findDocument = {
				depth: 0
			}
			if (cursor) {
				findDocument._id = { $lt: cursor }
			}
			if (onlyCompleted) {
				findDocument.depth = 15
			}
			this.gameCollection.find(findDocument).sort({ _id: -1 }).limit(limit, async (err, games) => {
				let promises = []
				games.forEach(game => {
					promises.push(this.getGame(game.root))
				})
				resolve(await Promise.all(promises))
			})
		})
	}

	getUserGrid(username, cursor) {
		return new Promise(resolve => {
			const findDocument = { promptType: "build", creators: username }
			if (cursor) {
				findDocument._id = { $lt: cursor }
			}
			this.gameCollection.find(findDocument).sort({ _id: -1 }).limit(65, async (err, buildTurns) => {
				let promises = []
				buildTurns.forEach(buildTurn => { // get zhe previous turn which is zhe description
					promises.push(new Promise(resolve => {
						this.gameCollection.findOne({ _id: buildTurn.parent }, (err, describeTurn) => {
							resolve({ describeTurn, buildTurn })
						})
					}))
				})
				const grid = []
				let currentColumn = []
				const turns = await Promise.all(promises)
				turns.forEach(turnSet => {
					currentColumn.push(turnSet.describeTurn, turnSet.buildTurn)
					if (currentColumn.length == 16) {
						grid.push(currentColumn)
						currentColumn = []
					}
				})
				if (currentColumn.length) grid.push(currentColumn)
				resolve(grid)
			})
		})
	}

	getLicensedGrid(cursor) {
		return new Promise(resolve => {
			const findDocument = { promptType: "build", licenses: { $exists: true } }
			if (cursor) {
				findDocument._id = { $lt: cursor }
			}
			this.gameCollection.find(findDocument).sort({ _id: -1 }).limit(65, async (err, buildTurns) => {
				let promises = []
				buildTurns.forEach(buildTurn => {
					promises.push(new Promise(resolve => {
						this.gameCollection.findOne({ _id: buildTurn.parent }, (err, describeTurn) => {
							resolve({ describeTurn, buildTurn })
						})
					}))
				})
				const grid = []
				let currentColumn = []
				const turns = await Promise.all(promises)
				turns.forEach(turnSet => {
					currentColumn.push(turnSet.describeTurn, turnSet.buildTurn)
					if (currentColumn.length == 16) {
						grid.push(currentColumn)
						currentColumn = []
					}
				})
				if (currentColumn.length) grid.push(currentColumn)
				resolve(grid)
			})
		})
	}

	getPurgedGrid(cursor) {
		return new Promise(resolve => {
			const findDocument = {}
			if (cursor) {
				findDocument._id = { $lt: cursor }
			}
			this.purgedCollection.find(findDocument).sort({ _id: -1 }).limit(65, async (err, purgedTurns) => {
				const grid = []
				let currentColumn = []
				purgedTurns.forEach(turn => {
					if (turn.promptType == "description") {
						currentColumn.push(turn, null)
					} else {
						currentColumn.push({
							promptType: "description",
							creators: ["Moderator"],
							prompt: turn.reason || "[ No reason provided ]",
							next: turn._id,
						}, turn)
					}
					if (currentColumn.length == 16) {
						grid.push(currentColumn)
						currentColumn = []
					}
				})
				if (currentColumn.length) grid.push(currentColumn)
				console.log(grid)
				resolve(grid)
			})
		})
	}

	async getPortals(name) {
		return new Promise(resolve => {
			this.portalCollection.findOne({ _id: name }, (err, doc) => {
				if (err || !doc) return resolve([])
				const zones = doc.portals.map(zone => Zone.deserialize(zone))
				resolve(zones)
			})
		})
	}

	saveLevelPortals(level) {
		return new Promise(resolve => {
			const portals = level.portals.map(portal => portal.serialize())
			this.portalCollection.replaceOne({ _id: level.name }, { _id: level.name, portals }, { upsert: true }, (err,) => {
				if (err) console.log(err)
				resolve()
			})
		})
	}

	createNewGame(startingSentence, username) {
		return new Promise(resolve => {
			const gameId = new mongojs.ObjectID()
			const gameNextId = new mongojs.ObjectID()
			const document = {
				_id: gameId,
				root: gameId,
				active: true,
				creators: [username],
				prompt: startingSentence,
				promptType: "description",
				next: gameNextId,
				parent: "self",
				depth: 0
			}
			this.gameCollection.insert(document, (err) => {
				resolve(document)
			})
		})
	}

	getInteraction(username, id, type) {
		return new Promise(resolve => {
			this.interactionCollection.find({ username, forId: id, type }, (err, docs) => {
				if (err) return resolve(null)
				resolve(docs[0])
			})
		})
	}

	addReport(username, id, reason) {
		return new Promise(resolve => {
			this.reportCollection.insert({
				username, forId: id, reason, unresolved: true
			}, (err) => {
				resolve()
			})
		})
	}

	updateReportStatus(reportId, status) {
		return new Promise(resolve => {
			this.reportCollection.update({ _id: reportId }, { $set: { unresolved: status } }, (err) => {
				resolve()
			})
		})
	}

	getReports(gameIds) {
		return new Promise(resolve => {
			this.reportCollection.find({ _id: { $in: gameIds } }, (err, reports) => {
				resolve(reports)
			})
		})
	}

	addInteraction(username, id, type) {
		return new Promise(resolve => {
			this.interactionCollection.insert({
				username, forId: id, type
			}, (err) => {
				resolve()
			})
		})
	}

	deactivateGame(gameId) {
		return new Promise(resolve => {
			this.gameCollection.update({ _id: gameId }, { $set: { active: false } }, (err) => {
				resolve()
			})
		})
	}

	continueGame(originalDocument, newGameId, promptType, username, description) {
		return new Promise(resolve => {
			this.gameCollection.update({ _id: originalDocument._id }, { $set: { active: false } }, (err) => {
				const gameNextId = new mongojs.ObjectID()
				const document = {
					_id: newGameId,
					root: originalDocument.root,
					active: true,
					creators: [],
					next: gameNextId,
					parent: originalDocument._id,
					depth: originalDocument.depth + 1
				}
				if (username) {
					document.creators.push(username)
				}
				if (document.depth == 15) {
					document.active = false
				}
				if (promptType == "description") {
					document.prompt = description
					document.promptType = "description"
				} else {
					document.promptType = "build"
				}
				this.gameCollection.insert(document, (err) => {
					if (err) console.error(err)
					if (document.active) {
						resolve({ document, gameCompleted: false })
					} else {
						resolve({ document, gameCompleted: true })
					}
				})
			})
		})
	}

	getUserRecordDocument(username, returnEmptyIfAbsent = false) {
		return new Promise((resolve, reject) => {
			this.userCollection.findOne({ _id: username }, (err, document) => {
				if (err) return reject(err)
				if (document) {
					resolve(document)
				} else {
					if (returnEmptyIfAbsent) {
						resolve()
					} else {
						resolve(UserRecord.getDefaultRecord(username))
					}
				}
			})
		})
	}

	addTransaction(account, currency, amount) {
		return new Promise((resolve) => {
			this.ledgerCollection.insert({ account, currency, amount }, (err) => {
				resolve()
			})
		})
	}

	getBalance(account) {
		const aggregation = [
			{
				'$match': {
					'account': account
				}
			}, {
				'$group': {
					'_id': '$currency',
					'sum': {
						'$sum': '$amount'
					}
				}
			}
		]
		return new Promise((resolve) => {
			this.ledgerCollection.aggregate(aggregation, (err, docs) => {
				const map = new Map()
				docs.forEach(doc => {
					map.set(doc._id, doc.sum)
				})
				resolve(map)
			})
		})
	}

	async divergeGame(descriptionTurn) {
		const targetDepth = descriptionTurn.depth
		const turns = await this.getGame(descriptionTurn.root)
		const previousTurnId = turns[turns.length - 1]
		const promises = []
		const divergedRootId = new mongojs.ObjectID()
		let parentId = "self"
		turns.forEach((turn) => {
			promises.push(new Promise(resolve => {
				const newDepth = turn.depth - targetDepth
				if (newDepth >= 0) {
					if (parentId == "self") {
						const oldId = turn._id
						turn._id = divergedRootId
						turn.root = divergedRootId
						turn.parent = "self"
						turn.depth = newDepth
						this.gameCollection.remove({ _id: oldId }, (err) => {
							this.gameCollection.insert(turn, (err) => {
								resolve()
							})
						})
					} else {
						const updateDocument = { $set: { depth: newDepth, parent: parentId, root: divergedRootId } }
						this.gameCollection.update({ _id: turn._id }, updateDocument, (err) => {
							resolve()
						})
					}

					parentId = turn._id
				}
			}))
		})
		await Promise.all(promises)
		await this.regenerateGameNextTurnId(previousTurnId)
		await this.setGameCompletion(descriptionTurn.root, false)
		await this.setGameCompletion(divergedRootId, false)
		this.gameCollection.update({ _id: previousTurnId }, { $set: { active: true } })
	}

	regenerateGameNextTurnId(gameId) {
		return new Promise(resolve => {
			this.gameCollection.update({ _id: gameId }, { $set: { next: new mongojs.ObjectID() } }, (err) => {
				resolve()
			})
		})
	}

	async purgeLastTurn(gameRootId, reason) {
		const turns = await this.getGame(gameRootId)
		const lastTurn = turns[turns.length - 1]
		if (lastTurn.depth !== 0) {
			const previousTurnId = turns[turns.length - 2]._id
			this.gameCollection.update({ _id: previousTurnId }, { $set: { active: true } })
			await this.regenerateGameNextTurnId(previousTurnId)
		}
		lastTurn.reason = reason
		this.purgedCollection.insert(lastTurn)
		return new Promise(resolve => {
			this.gameCollection.remove({ _id: lastTurn._id }, (err) => {
				this.setGameCompletion(gameRootId, false)
				resolve()
			})
		})
	}

	addBan(username, configuration = {}) {
		return new Promise(resolve => {
			const document = {
				username,
				end: new Date(Date.now() + configuration.duration),
				start: new Date(),
				acknowledged: false,
				type: configuration.type
			}
			this.banCollection.insert(document, (err) => {
				resolve()
			})
		})
	}

	getBans(username, onlyActive) {
		return new Promise(resolve => {
			let findDocument = null
			if (onlyActive) {
				findDocument = {
					$or: [
						{ username, end: { $gt: new Date() } },
						{ username, acknowledged: true }
					]
				}
			} else {
				findDocument = { username }
			}
			this.banCollection.find(findDocument, (err, docs) => {
				resolve(docs)
			})
		})
	}

	acknowledgeBan(banId) {
		this.banCollection.update({ _id: banId }, { $set: { acknowledged: true } })
	}

	saveUserRecord(userRecord) {
		return new Promise(async resolve => {
			this.userCollection.replaceOne({ _id: userRecord.username }, await userRecord.get(), { upsert: true }, (err) => {
				this.draining = false
				if (err) console.error(err)
				resolve()
			})
		})
	}

	getSpotvoxRenderJobs() {
		return new Promise(resolve => {
			this.gameCollection.find({ promptType: "build", render: { $exists: false } }).limit(32, (err, docs) => {
				if (err) return resolve([])
				resolve(docs)
			})
		})
	}

	addSpotvoxRender(buildTurnId, data) {
		return new Promise(resolve => {
			this.gameCollection.update({ _id: buildTurnId }, { $set: { render: data } }, () => {
				resolve()
			})
		})
	}

	getTurnRender(turnId) {
		return new Promise(resolve => {
			this.gameCollection.findOne({ _id: turnId }, { render: 1 }, (err, turn) => {
				if (!turn) return resolve()
				resolve(turn.render)
			})
		})
	}

	getTurn(turnId) {
		return new Promise(resolve => {
			this.gameCollection.findOne({ _id: turnId }, (err, turn) => {
				if (!turn) return resolve()
				resolve(turn)
			})
		})
	}

	getTurnDownload(turnId, format) {
		return new Promise(resolve => {
			this.downloadsCollection.findOne({ forId: turnId, format }, (err, download) => {
				if (!download) return resolve()
				resolve(download)
			})
		})
	}
	/**Add a download entry.
	 * @param {ObjectID} turnId - The ID of a turn.
	 * @param {Buffer} data - The download data.
	 * @param {string} format - The download format.
	 * @returns {Promise<void>} - A promise that resolves when the operation is complete.
	 */
	addDownload(turnId, data, format) {
		const id = `${turnId}-${format}`
		return new Promise(resolve => {
			this.downloadsCollection.replaceOne({ _id: id }, { _id: id, forId: turnId, data, format }, { upsert: true }, () => {
				resolve()
			})
		})
	}
	/**Add a license to a turn.
	 * @param {ObjectID} turnId - The ID of the turn.
	 * @param {string} licenseSlug - The license identifier.
	 * @returns {Promise<void>} - A promise that resolves when the operation is complete.
	 */
	addTurnLicense(turnId, licenseSlug) {
		return new Promise(resolve => {
			this.gameCollection.update({ _id: turnId }, { $addToSet: { licenses: licenseSlug } }, () => {
				resolve()
			})
		})
	}
	/**Sets completion state for all turns in game
	 * @param {ObjectID} gameId - The ID of the game.
	 * @param {boolean} status - The status type.
	 */
	setGameCompletion(gameId, status) {
		return new Promise(resolve => {
			this.gameCollection.updateMany({ root: gameId }, { $set: { gameStatus: status } }, () => {
				resolve()
			})
		})
	}
}
