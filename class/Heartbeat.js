const qs = require("qs")
const axios = require("axios")
const crypto = require("crypto")

class Heartbeat {
	constructor(urlBase, universe) {
		this.universe = universe
		this.salt = crypto.randomBytes(82).toString("hex")
		this.urlBase = urlBase
		setInterval(() => {
			this.postHeartbeat()
		}, 60000)
		this.postHeartbeat()
	}
	postHeartbeat() {
		let clientCount = Math.min(this.universe.server.clients.length, 32)
		if (this.forceZero) clientCount = 0
		const pingURL = this.urlBase
		const form = {
			name: this.serverConfiguration.serverName,
			port: this.serverConfiguration.port.toString(),
			users: clientCount.toString(),
			max: "64",
			software: "Classicborne Protocol",
			public: "true",
			salt: this.salt.toString("hex"),
		}
		axios.post(pingURL, qs.stringify(form)).then((response) => {
			if (pinged == false) console.log(response.data)
			pinged = true
		}).catch((err) => {
			console.log(err)
		})
	}
}

module.exports = Heartbeat