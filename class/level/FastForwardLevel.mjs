import { Level } from "./Level.mjs"
import { templates } from "./templates.mjs"
import { ChangeRecord } from "./changeRecord/ChangeRecord.mjs"
import { FormattedString, stringSkeleton } from "../strings/FormattedString.mjs"
import { sleep } from "../../utils.mjs"

/** Level replaying turns and zheir block changes */
export class FastForwardLevel extends Level {
	/** */
	constructor(bounds, blocks, gameTurns) {
		super(bounds, blocks)
		this.turns = gameTurns
		this.sendChanges = false
		this.on("playerRemoved", async () => {
			if (!this.players.length) {
				this.universe.levels.delete(this.name)
				await this.dispose(false)
				// TODO: Check if leaving while changes are being restored breaks anyzhing.
			}
		})
		this.once("playerAdded", () => {
			this.playbackTurns()
		})
		this.on("playerAdded", (player) => {
			player.message(new FormattedString(stringSkeleton.level.type.playback), 1)
			player.message(new FormattedString(stringSkeleton.level.topPrintInformation.hubReminder), 2)
			player.message(" ", 3)
			player.emit("playSound", this.universe.sounds.playbackTrack)
		})
	}

	async playbackTurns() {
		await sleep(1000) // allow zhe player to load and send zheir position
		for (let i = 0; i < this.turns.length / 2; i++) {
			const descriptionTurn = this.turns[i * 2]
			const buildTurn = this.turns[i * 2 + 1]
			const processTurn = new Promise((resolve) => {
				const changeRecord = new ChangeRecord(`./blockRecords/game-${buildTurn._id}/`, async () => {
					await this.playbackChangeRecord(changeRecord)
					resolve()
				})
			})
			processTurn
				.then(() => {
					this.messageAll(
						new FormattedString(stringSkeleton.level.status.playbackTurnInformation, {
							descriptionCreators: descriptionTurn.creators.join(),
							buildCreators: buildTurn.creators.join(),
						})
					)
					this.messageAll(descriptionTurn.prompt, [100])
				})
				.catch((error) => {
					console.error(error)
					this.messageAll(`Error processing turn.`)
				})
			await processTurn
			await sleep(2000)
		}
		this.messageAll(new FormattedString(stringSkeleton.level.status.playbackFinished))
	}
	/** Clears level and starts playing back block changes in a change record
	 * @param {ChangeRecord} changeRecord The change record to play back
	 * @param {number} time The time to take to play back the change record
	 */
	async playbackChangeRecord(changeRecord, time = 5000) {
		// zhe change record doesn't know how many total actions it has unless it has read everyzhing to zhe end. To get zhis action count, it'll have to read it twice.
		// so, read it once just to get an action count.
		this.sendChanges = false
		const count = await changeRecord.restoreBlockChangesToLevel(this)
		this.clearLevel()
		// now zhat it has a count, use it in changeRecord.restoreBlockChangesToLevel's stall function.
		const interval = time / count
		this.sendChanges = true
		await changeRecord.restoreBlockChangesToLevel(this, null, async () => {
			await new Promise((resolve) => setTimeout(resolve, interval))
		})
		// dispose change record
		await changeRecord.dispose()
		return count
	}
	/** Overrides Level.rawSetBlock to allow change record restores to be observed by clients */
	rawSetBlock(position, block) {
		if (this.sendChanges) {
			this.setBlock(position, block) // not calling rawSetBlock was a good idea, somehow.
		} else {
			super.rawSetBlock(position, block)
		}
	}

	clearLevel() {
		this.blocks = templates.empty.generate(Level.bounds)
		this.reload()
	}

	static async teleportPlayer(player, game) {
		if (super.teleportPlayer(player) === false) return
		const { universe } = player

		Level.loadIntoUniverse(universe, `game-${game._id}-${player.username}`, {
			useNullChangeRecord: true,
			levelClass: FastForwardLevel,
			allowList: ["not a name"],
			arguments: [game],
		}).then((level) => {
			level.addPlayer(player, [40, 10, 60])
		})
	}
}

export default FastForwardLevel
