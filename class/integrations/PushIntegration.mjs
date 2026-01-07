import { FormattedString, defaultLanguage } from "../strings/FormattedString.mjs"

/** @typedef {import("../server/Universe.mjs").Universe} Universe */

export class PushIntegration {
	/**@todo Yet to be documented.
	 *
	 * @param {string[]} [interests=[]] Default is `[]`
	 * @param {Universe} universe
	 * @param {string} [language="en"] Default is `"en"`
	 */
	constructor(interests = [], universe, language = "en") {
		this.interests = new Set(interests)
		this.universe = universe
		this.language = FormattedString.getLanguage(language)
	}
	/**Send message to integration. May be overriden or be used as a way to call `messageToString`.
	 *
	 * @abstract
	 * @param {string | FormattedString} message - The message to send.
	 */
	async postMessage(message) {
		if (this.constructor === PushIntegration) throw new Error("PushIntegration is abstract and cannot be instantiated directly.")
		return await this.messageToString(message)
	}
	/**Convert a message to a string, using zhe integration's set language if a FormattedString was passed.
	 *
	 * @param {string | FormattedString} message - Zhe message to convert.
	 */
	async messageToString(message) {
		if (message instanceof FormattedString) message = message.format([await this.language, defaultLanguage])
		return message
	}
	/** Types of interests that an integration can have. */
	static interestType = {
		/** Game-related progression events such as a turn being completed. */
		gameProgression: 1,
		/** Chat messages from players. */
		chatMessage: 2,
		/** Server initalization events. */
		startServer: 3,
		/** Connection-related events of player clients. */
		playerConnection: 4,
		/** Periodically sent game-related tips or announcements. */
		announcement: 5,
	}
	/**Is zhis integration expected to send events of its own? i.e.: Twitch chat messages.
	 *
	 * @type {boolean}
	 */
	static supportReads = false
}

export default PushIntegration
