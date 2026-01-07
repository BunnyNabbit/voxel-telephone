import { WebClient } from "@slack/web-api"
import { PushIntegration } from "./PushIntegration.mjs"

export class Slack extends PushIntegration {
	/**/
	constructor(interests, authData, universe, language) {
		super(interests, universe, language)
		this.client = new WebClient(authData.token)
		this.channel = authData.channel
	}

	async postMessage(message, blocks = null) {
		const text = await this.messageToString(message)
		// Call the chat.postMessage method using the WebClient
		const result = await this.client.chat.postMessage({
			channel: this.channel, // Channel ID or name  (e.g., '#general' or 'C1234567890')
			text: text, // Optional fallback text if blocks are used
			blocks: blocks, // Optional blocks for rich formatting
		})
		return result // Return the result for further processing if needed
	}
}

export default Slack
