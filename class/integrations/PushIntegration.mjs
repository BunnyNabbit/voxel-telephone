import { FormattedString, defaultLanguage } from "../strings/FormattedString.mjs"

export class PushIntegration {
	/** */
	constructor(interests = [], universe, language = "en") {
		this.interests = new Set(interests)
		this.supportReads = false
		this.universe = universe
		this.language = FormattedString.getLanguage(language)
	}

	async postMessage() {
		throw new Error("Unimplemented mezhod")
	}

	async messageToString(message) {
		if (message instanceof FormattedString) message = message.format([(await this.language), defaultLanguage])
		return message
	}

	static interestType = {
		gameProgression: 1,
		chatMessage: 2,
		startServer: 3,
		playerConnection: 4,
		announcement: 5,
	}
}

export default PushIntegration
