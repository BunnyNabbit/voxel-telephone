const mongojs = require("mongojs")
const serverConfiguration = require("../config.json")
const gameCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephone")
const reportCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephoneReports")
const interactionCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephoneInteractions")
const portalCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephonePortals")
const userCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephoneUsers")
const banCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephoneBans")
const ledgerCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephoneLedger")
const purgedCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephonePurged")

const Zone = require("./Zone.js")
const UserRecord = require("./UserRecord.js")

class Database {
	constructor(serverConfiguration) {
		this.playerReserved = new Map()
	}
	findActiveGames(username, levels) {
		return new Promise(resolve => {
			const games = []
			// find reserved game if it exists
			const reserved = this.playerReserved.get(username)
			if (reserved) return resolve([reserved])
			gameCollection.find({ active: true }, async (err, docs) => {
				if (err) return resolve([])
				for (let i = 0; i < docs.length; i++) {
					const game = docs[i]
					// check if game id is already active as a level
					console.log(levels.keys())
					console.log(levels.has(`game-${game.next}`))
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
		return new Promise(async resolve => {
			gameCollection.find({ root: gameRootId }).sort({ depth: 1 }, (err, games) => {
				resolve(games)
			})
		})
	}

	getGames(cursor, limit = 9) {
		return new Promise(resolve => {
			const findDocument = {
				depth: 0
			}
			if (cursor) {
				findDocument._id = { $lt: cursor }
			}
			gameCollection.find(findDocument).sort({ _id: -1 }).limit(limit, async (err, games) => {
				let promises = []
				games.forEach(game => {
					promises.push(this.getGame(game._id))
				})
				resolve(await Promise.all(promises))
			})
		})
	}

	async getPortals(name) {
		return new Promise(resolve => {
			portalCollection.findOne({ _id: name }, (err, doc) => {
				if (err || !doc) return resolve([])
				const zones = doc.portals.map(zone => Zone.deserialize(zone))
				resolve(zones)
			})
		})
	}

	saveLevelPortals(level) {
		return new Promise(resolve => {
			const portals = level.portals.map(portal => portal.serialize())
			portalCollection.replaceOne({ _id: level.name }, { _id: level.name, portals }, { upsert: true }, (err,) => {
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
			gameCollection.insert(document, (err) => {
				resolve(document)
			})
		})
	}

	getInteraction(username, id, type) {
		return new Promise(resolve => {
			interactionCollection.find({ username, forId: id, type }, (err, docs) => {
				if (err) return resolve(null)
				resolve(docs[0])
			})
		})
	}

	addReport(username, id, reason) {
		return new Promise(resolve => {
			reportCollection.insert({
				username, forId: id, reason, unresolved: true
			}, (err) => {
				resolve()
			})
		})
	}

	updateReportStatus(reportId, status) {
		return new Promise(resolve => {
			reportCollection.update({ _id: reportId }, { $set: { unresolved: status } }, (err) => {
				resolve()
			})
		})
	}

	getReports(gameIds) {
		return new Promise(resolve => {
			reportCollection.find({ _id: { $in: gameIds } }, (err, reports) => {
				resolve(reports)
			})
		})
	}

	addInteraction(username, id, type) {
		return new Promise(resolve => {
			interactionCollection.insert({
				username, forId: id, type
			}, (err) => {
				resolve()
			})
		})
	}

	deactivateGame(gameId) {
		return new Promise(resolve => {
			gameCollection.update({ _id: gameId }, { $set: { active: false } }, (err) => {
				resolve()
			})
		})
	}

	continueGame(originalDocument, newGameId, promptType, username, description) {
		return new Promise(resolve => {
			gameCollection.update({ _id: originalDocument._id }, { $set: { active: false } }, (err) => {
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
				gameCollection.insert(document, (err) => {
					if (!document.active) {
						resolve({ document, status: 1 })
					}
					resolve({ document, status: 0 })
				})
			})
		})
	}

	getUserRecordDocument(username) {
		return new Promise((resolve, reject) => {
			userCollection.findOne({ _id: username }, (err, document) => {
				if (err) return reject(err)
				if (document) {
					resolve(document)
				} else {
					resolve(UserRecord.getDefaultRecord(username))
				}
			})
		})
	}

	addTransaction(account, currency, amount) {
		return new Promise((resolve) => {
			ledgerCollection.insert({ account, currency, amount }, (err) => {
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
			ledgerCollection.aggregate(aggregation, (err, docs) => {
				const map = new Map()
				docs.forEach(doc => {
					map.set(doc._id, doc.sum)
				})
				resolve(map)
			})
		})
	}

	async divergeGame(game) {
		const turns = await this.getGame(game.root)

	}

	regenerateGameNextTurnId(gameId) {
		return new Promise(resolve => {
			gameCollection.update({ _id: gameId }, { $set: { next: new mongojs.ObjectID() } })
		})
	}

	async purgeLastTurn(gameRootId, reason) {
		const turns = await this.getGame(gameRootId)
		const lastTurn = turns[turns.length - 1]
		if (lastTurn.depth !== 0) {
			const previousTurnId = turns[turns.length - 2]._id
			gameCollection.update({ _id: previousTurnId }, { $set: { active: true } })
			lastTurn.reason = reason
			purgedCollection.insert(lastTurn)
			gameCollection.delete({ _id: lastTurn._id })
		}
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
			banCollection.insert(document, (err) => {
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
			banCollection.find(findDocument, (err, docs) => {
				resolve(docs)
			})
		})
	}

	acknowledgeBan(banId) {
		banCollection.update({ _id: banId }, { $set: { acknowledged: true } })
	}
}

module.exports = Database