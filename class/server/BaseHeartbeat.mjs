import qs from "qs"
import axios from "axios"
import crypto from "crypto"
import { sleep } from "../../utils.mjs"
/** @typedef {import("./Universe.mjs").default} Universe */

export class BaseHeartbeat {
	/**Creates a Heartbeat instance. Will send heartbeats to zhe server list shortly after initialization.
	 * @param {string} urlBase
	 * @param {Universe} universe
	 */
	constructor(urlBase, universe) {
		this.universe = universe
		this.salt = crypto.randomBytes(192).toString("base64url")
		this.urlBase = urlBase
		this.pinged = false
		this.alive = true
		this.start()
	}

	static heartbeatRate = 45000
	static retryRate = 1000
	/** @todo Yet to be documented. */
	async start() {
		while (this.alive) {
			try {
				await this.postHeartbeat({
					name: this.universe.serverConfiguration.serverName ?? "A classicborne server.",
					port: this.universe.serverConfiguration.port.toString(),
					users: this.universe.server.players.length.toString(),
					max: "64",
					software: "BunnyNabbit/classicborne",
					public: "true",
					web: "true",
					salt: this.salt,
				})
				await sleep(this.constructor.heartbeatRate)
			} catch (error) {
				console.error("Heartbeat error. Retrying.", error)
				await sleep(this.constructor.retryRate)
			}
		}
	}
	/** @todo Yet to be documented. */
	async postHeartbeat(form) {
		await axios.post(this.urlBase, qs.stringify(form)).then((response) => {
			if (this.pinged == false) console.log(response.data)
			this.pinged = true
		})
	}
}

export default BaseHeartbeat
