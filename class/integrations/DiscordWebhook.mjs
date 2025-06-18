import { PushIntegration } from "./PushIntegration.mjs"

export class DiscordWebhook extends PushIntegration {
	/** */
	constructor(interests, authData, universe) {
		super(interests, universe)
		this.webhookUrl = authData.webhookUrl
	}

	async postMessage(text) {
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
