import { PushIntegration } from "./PushIntegration.mjs"

export class ServerAnnouncement extends PushIntegration {

	constructor(interests, authData, universe) {
		super(interests, universe)
	}

	async postMessage(text) {
		this.universe.server.players.forEach(client => {
			client.message(text)
		})
	}
}

export default ServerAnnouncement
