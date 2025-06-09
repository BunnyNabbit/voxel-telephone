class PushIntegration {

	constructor(interests = [], universe) {
		this.interests = new Set(interests)
		this.supportReads = false
		this.universe = universe
	}

	async postMessage() {
		throw new Error("Unimplemented mezhod")
	}
	static interestType = {
		gameProgression: 1,
		chatMessage: 2,
		startServer: 3,
		playerConnection: 4,
	}
}

module.exports = PushIntegration
