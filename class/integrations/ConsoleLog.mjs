import { PushIntegration } from "./PushIntegration.mjs"

export class ConsoleLog extends PushIntegration {
	/** */
	constructor(interests, authData, universe) {
		super(interests, universe)
	}

	async postMessage(message) {
		const text = await this.messageToString(message)
		console.log(text)
	}
}

export default ConsoleLog
