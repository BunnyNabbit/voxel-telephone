const mongojs = require("mongojs")
const serverConfiguration = require("../config.json")
const gameCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephone")
const reportCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephoneReports")
const interactionCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephoneInteractions")
const portalCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephonePortals")

const Zone = require("./Zone.js")

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
}

module.exports = Database