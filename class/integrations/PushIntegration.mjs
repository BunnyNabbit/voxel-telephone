import { FormattedString, defaultLanguage } from "../strings/FormattedString.mjs"

/** @typedef {import("../server/Universe.mjs").Universe} Universe */

export class PushIntegration {
	/**@todo Yet to be documented.
	 * @param {Universe} universe
	 * @param {string[]} [interests=[]]
	 * @param {string} [language="en"]
	 */
	constructor(interests = [], universe, language = "en") {
		this.interests = new Set(interests)
		this.supportReads = false
		this.universe = universe
		this.language = FormattedString.getLanguage(language)
	}
	/**Send message to integration. May be overriden or be used as a way to call `messageToString`.
	 * @param {string|FormattedString} message - The message to send.
	 * @abstract
	 */
	async postMessage(message) {
		if (this.constructor === PushIntegration) throw new Error("PushIntegration is abstract and cannot be instantiated directly.")
		return await this.messageToString(message)
	}
	/**@todo Yet to be documented.
	 * @param {string|FormattedString} message
	 */
	async messageToString(message) {
		if (message instanceof FormattedString) message = message.format([await this.language, defaultLanguage])
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
