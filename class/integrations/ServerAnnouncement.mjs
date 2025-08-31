import { PushIntegration } from "./PushIntegration.mjs"

export class ServerAnnouncement extends PushIntegration {
	/** */
	constructor(interests, authData, universe) {
		super(interests, universe)
	}

	async postMessage(message) {
		this.universe.server.players.forEach((client) => {
			client.message(message)
		})
	}
}

export default ServerAnnouncement
