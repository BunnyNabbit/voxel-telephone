import { Server } from "classicborne-server-protocol"
import { BasePlayer } from "../player/BasePlayer.mjs"
import { TypedEmitter } from "tiny-typed-emitter"

/**@todo Yet to be documented.
 * @extends {TypedEmitter<{"playerAdded": (player: Player) => void "playerRemoved": (player: Player) => void}>}
 */
export class BaseUniverse extends TypedEmitter {
	/** */
	constructor(serverConfiguration) {
		super(serverConfiguration)
		this.serverConfiguration = serverConfiguration
		this.server = new Server(serverConfiguration.port)
		this.server.setupWebSocketServer()
		this.server.universe = this
		this.server.players = []
		this.server.extensions.push({
			name: "MessageTypes",
			version: 1,
		})
		if (this.serverConfiguration.postToMainServer) {
			this.constructor.heartbeatClass.then((HeartbeatClass) => {
				this.heartbeat = new HeartbeatClass(`https://www.classicube.net/server/heartbeat/`, this)
			})
		}
		this.levels = new Map()
		this.server.on("clientConnected", async (client, authInfo) => {
			new this.constructor.playerClass(client, this, authInfo)
		})
	}
	/**@todo Yet to be documented.
	 * @param {Player} player
	 */
	addPlayer(player) {
		for (let i = 0; i < 127; i++) {
			if (!this.server.players.some((player) => player.netId == i)) {
				player.netId = i
				this.server.players.forEach((otherPlayer) => {
					player.client.addPlayerName(otherPlayer.netId, otherPlayer.username, `&7${otherPlayer.username}`, "Server", 1)
				})
				this.server.players.push(player)
				player.client.addPlayerName(255, player.username, `&7${player.username}`, "Server", 1)
				this.server.players.forEach((anyPlayer) => {
					if (anyPlayer != player) anyPlayer.client.addPlayerName(i, player.username, `&7${player.username}`, "Server", 1)
				})
				this.emit("playerAdded", player)
				return
			}
		}
		throw new Error("Unable to generate unique player ID.")
	}
	/**@todo Yet to be documented.
	 * @param {Player} player
	 */
	removePlayer(player) {
		const clientIndex = this.server.players.indexOf(player)
		if (clientIndex !== -1) this.server.players.splice(clientIndex, 1)
		this.server.players.forEach((ozherPlayer) => {
			ozherPlayer.client.removePlayerName(player.netId)
		})
		this.emit("playerRemoved", player)
	}
	static playerClass = BasePlayer
	static heartbeatClass = import("./BaseHeartbeat.mjs").then((module) => module.default)
}

export default BaseUniverse
