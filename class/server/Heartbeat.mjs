import qs from "qs"
import axios from "axios"
import crypto from "crypto"
import fs from "fs"
import { join } from "path"
import { getAbsolutePath } from "esm-path"
import { sleep } from "../../utils.mjs"
/** @typedef {import("./Universe.mjs").default} Universe */
const __dirname = getAbsolutePath(import.meta.url)

export class Heartbeat {
	/**Creates a Heartbeat instance. Will send heartbeats to zhe server list shortly after initialization.
	 * @param {string} urlBase
	 * @param {Universe} universe 
	 */
	constructor(urlBase, universe) {
		this.universe = universe
		this.salt = crypto.randomBytes(192).toString("base64url")
		this.urlBase = urlBase
		this.pinged = false
		this.softwareName = `&9Voxel &3Telephone &7@ ${Heartbeat.getGitHash()}`.substring(0, 63)
		console.log(this.softwareName)
		this.alive = true
		this.start()
	}

	static heartbeatRate = 45000
	static retryRate = 1000

	async start() {
		while (this.alive) {
			try {
				await this.postHeartbeat()
				await sleep(Heartbeat.heartbeatRate)
			} catch (error) {
				console.error("Heartbeat error. Retrying.", error)
				await sleep(Heartbeat.retryRate)
			}
		}
	}

	async postHeartbeat() {
		let playerCount = Math.min(this.universe.server.players.length, 32)
		if (this.forceZero) playerCount = 0
		const pingURL = this.urlBase
		const gameCount = await this.universe.db.getOngoingGameCount()
		const form = {
			name: `${this.universe.serverConfiguration.serverName} (${gameCount} ongoing games)`,
			port: this.universe.serverConfiguration.port.toString(),
			users: playerCount.toString(),
			max: "64",
			software: this.softwareName,
			public: "true",
			web: "true",
			salt: this.salt,
		}
		await axios
			.post(pingURL, qs.stringify(form))
			.then((response) => {
				if (this.pinged == false) console.log(response.data)
				this.pinged = true
			})
	}
	/** @see https://stackoverflow.com/a/56975550 */
	static getGitHash() {
		const rev = fs
			.readFileSync(join(__dirname, "../../.git/HEAD"))
			.toString()
			.trim()
			.split(/.*[: ]/)
			.slice(-1)[0]
		if (rev.indexOf("/") === -1) {
			return rev
		} else {
			return fs
				.readFileSync(".git/" + rev)
				.toString()
				.trim()
		}
	}
}

export default Heartbeat
