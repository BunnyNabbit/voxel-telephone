import { Zone } from "./level/Zone.mjs"
import { UserRecord } from "./player/UserRecord.mjs"
import { randomIntFromInterval } from "../utils.mjs"
import { MongoClient, ObjectId } from "mongodb"

export class Database {
	/** */
	constructor(serverConfiguration) {
		this.client = new MongoClient(serverConfiguration.dbConnectionString ?? "mongodb://localhost:27017")
		this.db = this.client.db(serverConfiguration.dbName)
		this.gameCollection = this.db.collection("voxelTelephone")
		this.downloadsCollection = this.db.collection("voxelTelephoneDownloads")
		this.reportCollection = this.db.collection("voxelTelephoneReports")
		this.interactionCollection = this.db.collection("voxelTelephoneInteractions")
		this.portalCollection = this.db.collection("voxelTelephonePortals")
		this.userCollection = this.db.collection("voxelTelephoneUsers")
		this.banCollection = this.db.collection("voxelTelephoneBans")
		this.ledgerCollection = this.db.collection("voxelTelephoneLedger")
		this.purgedCollection = this.db.collection("voxelTelephonePurged")
		this.realmCollection = this.db.collection("voxelTelephoneRealms")
		this.playerReserved = new Map()
		this.serverConfiguration = serverConfiguration
	}

	async findActiveGames(username, levels) {
		const games = []
		// find reserved game if it exists
		const reserved = this.playerReserved.get(username)
		if (reserved) return [reserved]
		const docs = await this.gameCollection
			.find({ active: true })
			.toArray()
			.then(async (docs) => {
				for (let i = 0; i < docs.length; i++) {
					const activeTurn = docs[i]
					// check if game id is already active as a level
					if (levels.has(`game-${activeTurn.next}`) || levels.has(`game-${activeTurn._id}`)) continue
					// check if user has skipped the current ID, or already completed the root ID.
					if (this.serverConfiguration.skipCompletedGames) {
						const completeInteraction = await this.getInteraction(username, activeTurn.root, "complete")
						if (completeInteraction) continue
					} else {
						if (this.serverConfiguration.skipCheckedCompletedTurns > 1) {
							// if more turns from zhe last turn in zhe game should be checked.
							let game = (await this.getGame(activeTurn.root)).slice(-this.serverConfiguration.skipCheckedCompletedTurns)
							if (game.find((turn) => turn.creators.includes(username))) continue
						} else {
							// check if active turn was played by player instead.
							if (activeTurn.creators.includes(username)) continue
						}
					}
					const skipInteraction = await this.getInteraction(username, activeTurn._id, "skip")
					if (skipInteraction) continue
					games.push(activeTurn)
				}
				return games
			})
			.catch(() => {
				return []
			})
		return docs
	}

	getGame(gameRootId) {
		return this.gameCollection.find({ root: gameRootId }).sort({ depth: 1 }).toArray()
	}

	async getGames(cursor, limit = 9, onlyCompleted) {
		const findDocument = {
			depth: 0,
		}
		if (cursor) findDocument._id = { $lt: cursor }
		if (onlyCompleted) findDocument.depth = 15
		const games = this.gameCollection.find(findDocument).sort({ _id: -1 }).limit(limit)
		let promises = []
		for await (const game of games) {
			promises.push(this.getGame(game.root))
		}
		return await Promise.all(promises)
	}

	async getUserGrid(username, cursor) {
		const findDocument = { promptType: "build", creators: username }
		if (cursor) findDocument._id = { $lt: cursor }
		const buildTurns = await this.gameCollection.find(findDocument).sort({ _id: -1 }).limit(65).toArray()
		let promises = []
		buildTurns.forEach((buildTurn) => {
			// get zhe previous turn which is zhe description
			promises.push(
				this.gameCollection.findOne({ _id: buildTurn.parent }).then((describeTurn) => {
					return { describeTurn, buildTurn }
				})
			)
		})
		const grid = []
		let currentColumn = []
		const turns = await Promise.all(promises)
		turns.forEach((turnSet) => {
			currentColumn.push(turnSet.describeTurn, turnSet.buildTurn)
			if (currentColumn.length == 16) {
				grid.push(currentColumn)
				currentColumn = []
			}
		})
		if (currentColumn.length) grid.push(currentColumn)
		return grid
	}

	async getLicensedGrid(cursor) {
		const findDocument = { promptType: "build", licenses: { $exists: true } }
		if (cursor) findDocument._id = { $lt: cursor }
		const buildTurns = await this.gameCollection.find(findDocument).sort({ _id: -1 }).limit(65).toArray()
		let promises = []
		buildTurns.forEach((buildTurn) => {
			promises.push(
				this.gameCollection.findOne({ _id: buildTurn.parent }).then((describeTurn) => {
					return { describeTurn, buildTurn }
				})
			)
		})
		const grid = []
		let currentColumn = []
		const turns = await Promise.all(promises)
		turns.forEach((turnSet) => {
			currentColumn.push(turnSet.describeTurn, turnSet.buildTurn)
			if (currentColumn.length == 16) {
				grid.push(currentColumn)
				currentColumn = []
			}
		})
		if (currentColumn.length) grid.push(currentColumn)
		return grid
	}

	getPurgedGrid(cursor) {
		const findDocument = {}
		if (cursor) findDocument._id = { $lt: cursor }
		return this.purgedCollection
			.find(findDocument)
			.sort({ _id: -1 })
			.limit(65)
			.toArray()
			.then(async (purgedTurns) => {
				const grid = []
				let currentColumn = []
				purgedTurns.forEach((turn) => {
					if (turn.promptType == "description") {
						currentColumn.push(turn, null)
					} else {
						currentColumn.push(
							{
								promptType: "description",
								creators: ["Moderator"],
								prompt: turn.reason || "[ No reason provided ]",
								next: turn._id,
							},
							turn
						)
					}
					if (currentColumn.length == 16) {
						grid.push(currentColumn)
						currentColumn = []
					}
				})
				if (currentColumn.length) grid.push(currentColumn)
				return grid
			})
	}

	async getPortals(name) {
		return this.portalCollection
			.findOne({ _id: name })
			.then((doc) => {
				if (!doc) return []
				const zones = doc.portals.map((zone) => Zone.deserialize(zone))
				return zones
			})
			.catch(() => {
				return []
			})
	}

	saveLevelPortals(level) {
		const portals = level.portals.map((portal) => portal.serialize())
		return this.portalCollection.replaceOne({ _id: level.name }, { _id: level.name, portals }, { upsert: true })
	}

	async createNewGame(startingSentence, username) {
		const gameId = new ObjectId()
		const gameNextId = new ObjectId()
		const document = {
			_id: gameId,
			root: gameId,
			active: true,
			creators: [username],
			prompt: startingSentence,
			promptType: "description",
			next: gameNextId,
			parent: "self",
			depth: 0,
		}
		await this.gameCollection.insertOne(document)
		return document
	}

	async getInteraction(username, id, type) {
		return this.interactionCollection
			.find({ username, forId: id, type })
			.toArray()
			.then((docs) => {
				return docs[0]
			})
			.catch(() => {
				return null
			})
	}

	addReport(username, id, reason) {
		return this.reportCollection.insertOne({
			username,
			forId: id,
			reason,
			unresolved: true,
		})
	}

	updateReportStatus(reportId, status) {
		return this.reportCollection.updateMany({ _id: reportId }, { $set: { unresolved: status } })
	}

	async getReports(gameIds) {
		const reports = await this.reportCollection.find({ _id: { $in: gameIds } }).toArray()
		return reports
	}

	addInteraction(username, id, type) {
		return this.interactionCollection.insertOne({
			username,
			forId: id,
			type,
		})
	}

	deactivateGame(gameId) {
		return this.gameCollection.updateMany({ _id: gameId }, { $set: { active: false } })
	}

	async continueGame(originalDocument, newGameId, promptType, username, description) {
		await this.gameCollection.updateMany({ _id: originalDocument._id }, { $set: { active: false } })
		const gameNextId = new ObjectId()
		const document = {
			_id: newGameId,
			root: originalDocument.root,
			active: true,
			creators: [],
			next: gameNextId,
			parent: originalDocument._id,
			depth: originalDocument.depth + 1,
		}
		if (username) document.creators.push(username)
		if (document.depth == 15) document.active = false
		if (promptType == "description") {
			document.prompt = description
			document.promptType = "description"
		} else {
			document.promptType = "build"
		}
		await this.gameCollection.insertOne(document)
		if (document.active) {
			return { document, gameCompleted: false }
		} else {
			return { document, gameCompleted: true }
		}
	}

	async getUserRecordDocument(username, returnEmptyIfAbsent = false) {
		const document = await this.userCollection.findOne({ _id: username })
		if (document) {
			return document
		} else {
			if (returnEmptyIfAbsent) {
				return
			} else {
				return UserRecord.getDefaultRecord(username)
			}
		}
	}

	addTransaction(account, currency, amount) {
		return this.ledgerCollection.insertOne({ account, currency, amount })
	}

	async getBalance(account) {
		const aggregation = [
			{
				$match: {
					account: account,
				},
			},
			{
				$group: {
					_id: "$currency",
					sum: {
						$sum: "$amount",
					},
				},
			},
		]

		const docs = this.ledgerCollection.aggregate(aggregation)
		const map = new Map()
		for await (const doc of docs) {
			map.set(doc._id, doc.sum)
		}
		return map
	}

	async divergeGame(descriptionTurn) {
		const targetDepth = descriptionTurn.depth
		const turns = await this.getGame(descriptionTurn.root)
		const previousTurnId = turns[turns.length - 1]
		const promises = []
		const divergedRootId = new ObjectId()
		let parentId = "self"
		for await (const turn of turns) {
			promises.push(
				new Promise((resolve) => {
					const newDepth = turn.depth - targetDepth
					if (newDepth >= 0) {
						if (parentId == "self") {
							const oldId = turn._id
							turn._id = divergedRootId
							turn.root = divergedRootId
							turn.parent = "self"
							turn.depth = newDepth
							this.gameCollection.deleteOne({ _id: oldId }).then(() => {
								this.gameCollection.insertOne(turn).then(() => {
									resolve()
								})
							})
						} else {
							const updateDocument = { $set: { depth: newDepth, parent: parentId, root: divergedRootId } }
							this.gameCollection.updateMany({ _id: turn._id }, updateDocument).then(() => {
								resolve()
							})
						}

						parentId = turn._id
					}
				})
			)
		}
		await Promise.all(promises)
		await this.regenerateGameNextTurnId(previousTurnId)
		await this.setGameCompletion(descriptionTurn.root, false)
		await this.setGameCompletion(divergedRootId, false)
		this.gameCollection.updateMany({ _id: previousTurnId }, { $set: { active: true } })
	}

	regenerateGameNextTurnId(gameId) {
		return this.gameCollection.updateMany({ _id: gameId }, { $set: { next: new ObjectId() } })
	}

	async purgeLastTurn(gameRootId, reason) {
		const turns = await this.getGame(gameRootId)
		const lastTurn = turns[turns.length - 1]
		if (lastTurn.depth !== 0) {
			const previousTurnId = turns[turns.length - 2]._id
			this.gameCollection.updateMany({ _id: previousTurnId }, { $set: { active: true } })
			await this.regenerateGameNextTurnId(previousTurnId)
		}
		lastTurn.reason = reason
		this.purgedCollection.insertOne(lastTurn)
		await this.gameCollection.deleteOne({ _id: lastTurn._id })
		await this.setGameCompletion(gameRootId, false)
	}

	async addBan(username, configuration = {}) {
		const document = {
			username,
			end: new Date(Date.now() + configuration.duration),
			start: new Date(),
			acknowledged: false,
			type: configuration.type,
		}
		await this.banCollection.insertOne(document)
	}

	async getBans(username, onlyActive) {
		let findDocument = null
		if (onlyActive) {
			findDocument = {
				$or: [
					{ username, end: { $gt: new Date() } },
					{ username, acknowledged: true },
				],
			}
		} else {
			findDocument = { username }
		}
		const docs = await this.banCollection.find(findDocument).toArray()
		return docs
	}

	acknowledgeBan(banId) {
		return this.banCollection.updateMany({ _id: banId }, { $set: { acknowledged: true } })
	}

	async saveUserRecord(userRecord) {
		await this.userCollection.replaceOne({ _id: userRecord.username }, await userRecord.get(), { upsert: true })
		this.draining = false
	}

	async getSpotvoxRenderJobs() {
		try {
			const docs = await this.gameCollection
				.find({ promptType: "build", render: { $exists: false } })
				.limit(32)
				.toArray()
			return docs
		} catch {
			return []
		}
	}

	addSpotvoxRender(buildTurnId, data) {
		return this.gameCollection.updateMany({ _id: buildTurnId }, { $set: { render: data } })
	}

	async getTurnRender(turnId) {
		const turn = await this.gameCollection.findOne({ _id: turnId }, { render: 1 })
		if (!turn) return
		return turn.render
	}

	async getTurn(turnId) {
		return this.gameCollection.findOne({ _id: turnId })
	}

	getTurnDownload(turnId, format) {
		return this.downloadsCollection.findOne({ forId: turnId, format })
	}
	/**Add a download entry.
	 * @param {ObjectId} turnId - The ID of a turn.
	 * @param {Buffer} data - The download data.
	 * @param {string} format - The download format.
	 * @returns {Promise<void>} A promise that resolves when the operation is complete.
	 */
	async addDownload(turnId, data, format) {
		const id = `${turnId}-${format}`
		await this.downloadsCollection.replaceOne({ _id: id }, { _id: id, forId: turnId, data, format }, { upsert: true })
	}
	/**Add a license to a turn.
	 * @param {ObjectId} turnId - The ID of the turn.
	 * @param {string} licenseSlug - The license identifier.
	 * @returns {Promise<void>} A promise that resolves when the operation is complete.
	 */
	async addTurnLicense(turnId, licenseSlug) {
		await this.gameCollection.updateMany({ _id: turnId }, { $addToSet: { licenses: licenseSlug } })
	}
	/**Sets completion state for all turns in game
	 * @param {ObjectId} gameId - The ID of the game.
	 * @param {boolean} status The status type.
	 */
	async setGameCompletion(gameId, status) {
		await this.gameCollection.updateMany({ root: gameId }, { $set: { gameStatus: status } })
	}
	/**Get the realm grid for a user.
	 * @param {string} username - The username of the user.
	 * @param {ObjectId} cursor - The cursor for pagination.
	 * @returns {Promise<Array>} A promise that resolves to an array of realms.
	 */
	async getRealmGrid(username, cursor) {
		const findDocument = { ownedBy: username }
		let limit = 65
		const grid = []
		let currentColumn = []
		if (cursor) {
			findDocument._id = { $lt: cursor }
		} else {
			limit-- // make space for + icon
			currentColumn.push(
				{
					promptType: "description",
					prompt: "Create a realm!",
				},
				null
			)
		}

		const realms = await this.realmCollection.find(findDocument).sort({ _id: -1 }).limit(limit).toArray()
		for await (const realm of realms) {
			currentColumn.push(
				{
					promptType: "description",
					creators: [realm.ownedBy],
					prompt: realm.realmName,
					next: realm._id,
				},
				realm
			)
			if (currentColumn.length == 16) {
				grid.push(currentColumn)
				currentColumn = []
			}
		}

		if (currentColumn.length) grid.push(currentColumn)
		return grid
	}
	/**Creates a new realm for a user.
	 * @param {string} username - The username of the user.
	 * @returns {Promise<Object>} A promise that resolves to the created realm document or null if an error occurs.
	 */
	async createNewRealm(username) {
		const realmId = new ObjectId()
		const document = {
			_id: realmId,
			ownedBy: username,
			realmName: Database.generateName(),
		}
		try {
			await this.realmCollection.insertOne(document)
			return document
		} catch (err) {
			console.error("Error creating new realm:", err)
			return null
		}
	}
	/**Fetches a realm by its ID.
	 * @param {ObjectId} realmId - The ID of the realm to fetch.
	 * @returns {Promise<Object>} A promise that resolves to the realm document or null if not found.
	 */
	async getRealm(realmId) {
		try {
			const realm = await this.realmCollection.findOne({ _id: realmId })
			return realm
		} catch (err) {
			console.error("Error fetching realm:", err)
			return null
		}
	}
	/**Saves a realm preview.
	 * @param {ObjectId} realmId - The ID of the realm.
	 * @param {Buffer} blocks - The blocks to save as a preview.
	 * @returns {Promise<void>} A promise that resolves when the operation is complete.
	 */
	async saveRealmPreview(realmId, blocks) {
		try {
			return await this.realmCollection.updateMany({ _id: realmId }, { $set: { preview: blocks } })
		} catch (err) {
			console.error("Error saving realm preview:", err)
		}
	}
	/**Generates a random name consisting of three syllables.
	 * @param {number} lengzh - The number of syllables to generate (default is 3).
	 * @returns {string} A randomly generated name.
	 */
	static generateName(lengzh = 3) {
		let name = ""
		for (let i = 0; i < lengzh; i++) {
			const randomIndex = randomIntFromInterval(0, Database.zhreeTypes.length - 1)
			name += Database.zhreeTypes[randomIndex]
		}
		return name
	}
	static zhreeTypes = ["tou", "hoo", "oh", "xow", "hy", "th", "we", "to"]
	/**Counts the number of ongoing games in the database.
	 * @returns {Promise<number>} A promise that resolves to the count of ongoing games.
	 */
	async getOngoingGameCount() {
		try {
			const count = await this.gameCollection.countDocuments({ active: true }, { timeoutMS: 5000 })
			return count
		} catch (err) {
			console.error("Error counting ongoing games:", err)
			return 0
		}
	}
}
