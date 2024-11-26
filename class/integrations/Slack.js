const { WebClient } = require('@slack/web-api')
const PushIntegration = require("./PushIntegration.js")

class Slack extends PushIntegration {
	constructor(interests, authData, universe) {
		super(interests, universe)
		this.client = new WebClient(authData.token)
		this.channel = authData.channel
	}

	async postMessage(text, blocks = null) {
		// Call the chat.postMessage method using the WebClient
		const result = await this.client.chat.postMessage({
			channel: this.channel, // Channel ID or name  (e.g., '#general' or 'C1234567890')
			text: text, // Optional fallback text if blocks are used
			blocks: blocks // Optional blocks for rich formatting
		})
		return result // Return the result for further processing if needed
	}
}

module.exports = Slack