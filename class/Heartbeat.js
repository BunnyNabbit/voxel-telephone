const qs = require("qs")
const axios = require("axios")
const crypto = require("crypto")
const fs = require("fs")
const { join } = require('node:path')

class Heartbeat {
	constructor(urlBase, universe) {
		this.universe = universe
		this.salt = crypto.randomBytes(82).toString("hex")
		this.urlBase = urlBase
		this.pinged = false
		setInterval(() => {
			this.postHeartbeat()
		}, 60000)
		this.softwareName = `&9Voxel &3Telephone &7@ ${Heartbeat.getGitHash()}`.substring(0, 63)
		this.postHeartbeat()
		console.log(this.softwareName)
	}
	postHeartbeat() {
		let clientCount = Math.min(this.universe.server.clients.length, 32)
		if (this.forceZero) clientCount = 0
		const pingURL = this.urlBase
		const form = {
			name: this.universe.serverConfiguration.serverName,
			port: this.universe.serverConfiguration.port.toString(),
			users: clientCount.toString(),
			max: "64",
			software: this.softwareName,
			public: "true",
			web: "true",
			salt: this.salt.toString("hex"),
		}
		axios.post(pingURL, qs.stringify(form)).then((response) => {
			if (this.pinged == false) console.log(response.data)
			this.pinged = true
		}).catch((err) => {
			console.log(err)
		})
	}
	// https://stackoverflow.com/a/56975550
	static getGitHash() {
		const rev = fs.readFileSync(join(__dirname, "../.git/HEAD")).toString().trim().split(/.*[: ]/).slice(-1)[0]
		if (rev.indexOf('/') === -1) {
			return rev
		} else {
			return fs.readFileSync('.git/' + rev).toString().trim()
		}
	}
}

module.exports = Heartbeat