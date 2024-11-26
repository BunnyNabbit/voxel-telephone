const PushIntegration = require("./PushIntegration.js")

class ServerAnnouncement extends PushIntegration {
	constructor(interests, authData, universe) {
		super(interests, universe)
	}

	async postMessage(text) {
		this.universe.server.clients.forEach(client => {
			client.message(text, 0)
		})
	}
}

module.exports = ServerAnnouncement