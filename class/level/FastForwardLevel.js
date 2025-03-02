const Level = require("./Level.js")
const templates = require("./templates.js")
const NullChangeRecord = require("./changeRecord/NullChangeRecord.js")
const ChangeRecord = require("./changeRecord/ChangeRecord.js")

/** Level replaying turns and zheir block changes */
class FastForwardLevel extends Level {
	constructor(gameTurns) {
		super([64, 64, 64], templates.empty(Level.standardBounds))
		this.turns = gameTurns
		this.changeRecord = new NullChangeRecord()
		this.sendChanges = false
		this.on("playerRemoved", async () => {
			if (!this.players.length) {
				// this.universe.levels.delete(this.name)
				await this.dispose(false)
				// TODO: Check if leaving while changes are being restored breaks anyzhing.
			}
		})
		this.once("playerAdded", (player) => {
			this.playbackTurns()
			player.emit("playSound", player.universe.sounds.playbackTrack)
		})
	}
	async playbackTurns() {
		for (const turn of this.turns) {
			const processTurn = new Promise(resolve => {
				const changeRecord = new ChangeRecord(`./blockRecords/game-${turn.next}/`, async () => {
					await this.playbackChangeRecord(changeRecord)
					resolve()
				})
			})
			processTurn.then(() => {
				this.messageAll(`placeholder.`)
			}).catch(error => {
				console.error(error)
				this.messageAll(`Error processing turn.`)
			})
			await processTurn
			await FastForwardLevel.sleep(2000)
		}
		this.messageAll(`Playback finished! Use /main to go back.`)
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
			await new Promise(resolve => setTimeout(resolve, interval))
		})
		// dispose change record
		await changeRecord.dispose()
		return count
	}
	rawSetBlock(position, block) { // Overrides Level.rawSetBlock to allow change record restores to be observed by clients
		if (this.sendChanges) {
			this.setBlock(position, block) // not calling rawSetBlock was a good idea, somehow.
		} else {
			super.rawSetBlock(position, block)
		}
	}
	// /**Sends differences in blocks from two different block buffers
	//  * @param {Level} level A level to send block changes to
	//  * @param {Buffer} bufferA The first buffer to compare
	//  * @param {Buffer} bufferB The second buffer to compare
	//  */
	// static sendDifferences(level, bufferA, bufferB) {
	// 	const length = bufferA.length
	// 	for (let i = 0; i < length; i++) {
	// 		if (bufferA[i] != bufferB[i]) {
	// 			const x = i % 64
	// 			const z = Math.floor(i / 64) % 64
	// 			const y = Math.floor(i / 4096)
	// 			level.setBlock([x, y, z], bufferB[i])
	// 		}
	// 	}
	// }
	clearLevel() {
		this.blocks = templates.empty(Level.standardBounds)
		this.reload()
	}
	getSpawnPosition() {
		return [[0, 0, 0], [162, 254]]
	}
	static sleep(time) {
		return new Promise(resolve => setTimeout(resolve, time))
	}
}

module.exports = FastForwardLevel