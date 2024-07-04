// Creates games to populate the server with playable games.

const serverConfiguration = require("./config.json")
const mongojs = require("mongojs")
const gameCollection = mongojs(serverConfiguration.dbName).collection("voxelTelephone")

function createNewGame(startingSentence, username) {
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

createNewGame("cat with a red face, blue body, sitting on a fluffy cloud", "game root")