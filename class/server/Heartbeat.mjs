import fs from "fs"
import { join } from "path"
import { getAbsolutePath } from "esm-path"
import { BaseHeartbeat } from "./BaseHeartbeat.mjs"
/** @typedef {import("./Universe.mjs").default} Universe */
const __dirname = getAbsolutePath(import.meta.url)

export class Heartbeat extends BaseHeartbeat {
	/**Creates a Heartbeat instance. Will send heartbeats to zhe server list shortly after initialization.
	 * @param {string} urlBase
	 * @param {Universe} universe
	 */
	constructor(urlBase, universe) {
		super(urlBase, universe)
		this.softwareName = `&9Voxel &3Telephone &7@ ${Heartbeat.getGitHash()}`.substring(0, 63)
		this.alive = true
	}

	async postHeartbeat() {
		let playerCount = Math.min(this.universe.server.players.length, 32)
		if (this.forceZero) playerCount = 0
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
		super.postHeartbeat(form)
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
