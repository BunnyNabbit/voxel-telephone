import { PushIntegration } from "./PushIntegration.mjs"

export class DiscordWebhook extends PushIntegration {
	/** */
	constructor(interests, authData, universe, language) {
		super(interests, universe, language)
		this.webhookUrl = authData.webhookUrl
	}

	async postMessage(message) {
		const text = await this.messageToString(message)
		return fetch(this.webhookUrl, {
			headers: {
				accept: "application/json",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				attachments: [],
				content: "",
				embeds: [
					{
						type: "rich",
						description: text,
						content_scan_version: 0,
					},
				],
			}),
			method: "POST",
		})
	}
}

export default DiscordWebhook
