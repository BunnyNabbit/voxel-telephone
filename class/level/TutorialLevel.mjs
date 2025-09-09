import { Level } from "./Level.mjs"
/** @typedef {import("../player/Player.mjs").Player} Player */

export class TutorialLevel extends Level {
	/** */
	constructor(bounds, blocks) {
		super(bounds, blocks)
		this.on("playerRemoved", async () => {
			if (!this.players.length) {
				this.universe.levels.delete(this.name)
				await this.dispose()
			}
		})
		this.completing = new Set()
	}
	/**Called when player completes zhis tutorial level. May be called using `/skip`.
	 * I am intended to be overriden by classes extending TutorialLevel. Typically I will teleport players to a different level or to zhe hub level. My default behavior is to teleport players back to hub or homebase by invoking `/main`.
	 * @param {Player} player
	 * @param {number} progressionReason - one of `TutorialLevel.progressionReasons`.
	 */
	next(player) {
		player.universe.commandRegistry.attemptCall(player, "/main")
	}
	/** Calls `next` and sends a message for completing the tutorial. */
	complete(player, message = "Tutorial complete!") {
		if (this.completing.has(player)) return false
		this.completing.add(player)
		setTimeout(() => {
			if (!this.players.includes(player)) return
			this.next(player, TutorialLevel.progressionReasons.completed)
		}, 3000)
		if (message) player.message(message)
		player.emit("playSound", this.universe.sounds.complete)
		return true
	}

	static progressionReasons = {
		skipped: 0,
		completed: 1,
	}

	async getSpawnPosition() {
		return [
			[60, 8, 4],
			[162, 254],
		]
	}

	static async teleportPlayer(player) {
		if (super.teleportPlayer(player) === false) return
		const { universe } = player
		let spaceName = `tutorial-${this.name}-${player.authInfo.username}`
		this.loadIntoUniverse(universe, spaceName, {
			useNullChangeRecord: true,
			allowList: [],
		}).then(async (level) => {
			const spawnPositions = await level.getSpawnPosition(player)
			level.addPlayer(player, ...spawnPositions)
		})
	}
}

export default TutorialLevel
