import mongojs from "mongojs"
// A stripped down, MJS-friendly version of Database.js
console.log("loaded")
export default class Database {
	constructor(serverConfiguration) {
		this.gameCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephone")
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

	getGames(cursor, limit = 9) {
		return new Promise(resolve => {
			const findDocument = {
				depth: 0
			}
			if (cursor) {
				findDocument._id = { $lt: cursor }
			}
			this.gameCollection.find(findDocument).sort({ _id: -1 }).limit(limit, async (err, games) => {
				let promises = []
				games.forEach(game => {
					promises.push(this.getGame(game._id))
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

	getUserRecordDocument(username) {
		return new Promise((resolve, reject) => {
			this.userCollection.findOne({ _id: username }, (err, document) => {
				if (err) return reject(err)
				if (document) {
					resolve(document)
				} else {
					// resolve(UserRecord.getDefaultRecord(username))
					resolve()
				}
			})
		})
	}
}
