// Creates games to populate the server with playable games.

import serverConfiguration from "../config.json" with { type: "json" }
import { MongoClient, ObjectId } from "mongodb"
const client = new MongoClient(serverConfiguration.dbConnectionString ?? "mongodb://localhost:27017")
const gameCollection = client(serverConfiguration.dbName).collection("voxelTelephone")

function createNewGame(startingSentence, username) {
	return new Promise((resolve) => {
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
		gameCollection.insert(document, (err) => {
			if (err) return console.error("Error while creating new game", err)
			resolve(document)
		})
	})
}

createNewGame("cat with a red face, blue body, sitting on a fluffy cloud", "game root")
