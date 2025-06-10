import { promisify } from "node:util"
import fs from "fs"
import { SmartBuffer } from "smart-buffer"
import zlib from "zlib"
const deflate = promisify(zlib.deflate)
const inflate = promisify(zlib.inflate)
import trash from "trash"
import { join } from 'path'
import sqlite3 from "sqlite3"
const { Database, OPEN_READWRITE, OPEN_CREATE } = sqlite3.verbose()

/** Represents a change record for a level. */
export class ChangeRecord {
	/**Creates a new ChangeRecord instance.
	 * @param {string} path - The path to the change record file.
	 * @param {function} loadedCallback - The callback function to call when file handles are opened.
	 */
	constructor(path, loadedCallback = () => { }) {
		this.currentBuffer = new SmartBuffer()
		this.path = path
		this.draining = false
		this.dirty = false
		this.vhsFh = null
		this.bounds = [64, 64, 64]
		this.actionCount = 0
		this.currentActionCount = 0
		// fs.mkd
		if (!fs.existsSync(path)) fs.mkdirSync(path)
		this.keyframeRecord = new KeyframeRecord(join(path, "/dvr.db"))
		Promise.all([fs.promises.open(join(path + "/vhs.bin"), "a+")], this.keyframeRecord.ready).then((values) => {
			this.vhsFh = values[0]
			loadedCallback(this)
		})
	}
	/**Appends a block change to zhe change record.
	 * @param {number[]} position - The position of the block change.
	 * @param {number} block - The block type.
	 */
	addBlockChange(position, block) {
		this.appendAction(false, position.concat(block))
	}
	/**Append an action to the change record.
	 * @param {boolean} isCommand - Whether the action is a command.
	 * @param {number[]} actionBytes - The action bytes to append.
	 * @param {string} commandString - The command string (if applicable).
	 */
	appendAction(isCommand = false, actionBytes, commandString) {
		this.actionCount += 1
		this.currentActionCount += 1
		this.dirty = true
		if (isCommand) { // contains command data. will contain positions and a string that is the full command. this action is variable
			this.currentBuffer.writeUInt8(actionBytes.length)
			this.currentBuffer.writeStringNT(commandString)
			actionBytes.forEach(byte => {
				this.currentBuffer.writeUInt8(byte)
			})
		} else { // single block change
			this.currentBuffer.writeUInt8(0) // action code
			if (actionBytes.length !== 4) throw "For a single block change, the actionBytes array must have four numbers in the 0-255 range."
			actionBytes.forEach(byte => {
				this.currentBuffer.writeUInt8(byte)
			})
		}
	}
	/**Process the VHS file with a given processor function.
	 * @param {object} vhsFh - The file handle of the VHS file.
	 * @param {function} processor - The processor function to process each action.
	 * @param {number} [startFileOffset=0] - The offset to start processing from.
	 * @param {number} [startActionCount=0] - The action count to start from.
	 * @returns {Promise<number>} The total number of actions processed.
	 * @private
	 */
	async _processVhsFile(vhsFh, processor, startFileOffset = 0, startActionCount = 0) {
		let currentFileReadOffset = startFileOffset
		this.actionCount = startActionCount
		while (true) {
			let bufferLength = Buffer.alloc(4)
			await vhsFh.read(bufferLength, 0, bufferLength.length, currentFileReadOffset)
			bufferLength = bufferLength.readUint32LE(0)
			if (bufferLength == 0) break

			const deflateBuffer = Buffer.alloc(bufferLength)
			await vhsFh.read(deflateBuffer, 0, deflateBuffer.length, currentFileReadOffset + 4)
			let changes = await inflate(deflateBuffer)
			let bufferActionCount = 0
			changes = SmartBuffer.fromBuffer(changes)

			while (changes.remaining()) {
				const actions = changes.readUInt8()
				const actionBytes = []
				let commandName = null
				bufferActionCount++

				if (actions > 0) {
					commandName = changes.readStringNT()
					for (let i = 0; i < actions; i++) {
						actionBytes.push(changes.readUInt8())
					}
				}

				const exit = await processor(actions, commandName, actionBytes, changes, currentFileReadOffset, bufferActionCount)
				if (!exit) return this.actionCount // Allow early exit
			}

			currentFileReadOffset += bufferLength + 4
		}
		return this.actionCount
	}
	/**Restore block changes to a level.
	 * @param {Level} level - The level to restore changes to.
	 * @param {number} [maxActions] - The maximum number of actions to restore.
	 * @param {function} [staller] - The function to call to stall the restore process. Also prevents creating keyframes.
	 * @returns {Promise<number>} The total number of actions restored.
	 */
	async restoreBlockChangesToLevel(level, maxActions, staller) {
		level.loading = true
		const latestKeyframe = await this.keyframeRecord.getLatestKeyframe(maxActions ?? Infinity, level?.template?.iconName ?? "empty", level.bounds)
		const startingFileOffset = latestKeyframe?.offset ?? 0
		const startingActionCount = latestKeyframe?.totalActionCount ?? 0
		let keyframeBufferActionCount = latestKeyframe?.bufferActionCount
		let seeking = false
		if (latestKeyframe) {
			seeking = true
			const inflatedVoxelData = await inflate(latestKeyframe.voxelData)
			level.blocks = inflatedVoxelData
		}
		let restoreWatch = new Stopwatch(true)
		const count = await this._processVhsFile(this.vhsFh, async (actions, commandName, actionBytes, changes, currentFileReadOffset, bufferActionCount) => {
			if (staller) await staller()
			if (maxActions && this.actionCount == maxActions) {
				level.loading = false
				return false // Stop processing
			}
			if (!seeking) {
				this.actionCount += 1
				if (actions == 0) {
					level.rawSetBlock([changes.readUInt8(), changes.readUInt8(), changes.readUInt8()], changes.readUInt8())
				} else {
					level.interpretCommand(commandName)
					level.currentCommandActionBytes = actionBytes
					level.commitAction()
				}
			} else {
				if (actions == 0) changes.readBuffer(4)
				if (bufferActionCount >= keyframeBufferActionCount) {
					seeking = false // Stop seeking once we reach the keyframe buffer action count
					restoreWatch.start() // restart stopwatch for keyframe creation
				}
			}
			// Create a keyframe if enough time has passed since the last one, and we're not stalling or seeking
			if (!staller && !seeking && restoreWatch.elapsed > ChangeRecord.lagKeyframeTime) {
				restoreWatch.stop()
				const keyframeId = await this.keyframeRecord.addKeyframe(currentFileReadOffset, this.actionCount, bufferActionCount, level?.template?.iconName ?? "empty", level.blocks, level.bounds)
				console.log(`Created keyframe ${keyframeId} at offset ${currentFileReadOffset} for ${level.template.iconName} after ${restoreWatch.elapsed}ms`)
				restoreWatch.start()
			}
			return true // Continue processing
		}, startingFileOffset, startingActionCount)
		level.loading = false
		console.log("loaded", count)
		return count
	}
	static lagKeyframeTime = 250 // milliseconds
	/**Flush changes to disk by compressing current buffer and append it to zhe VHS file.
	 * @returns {Promise<number>} The length of the flushed buffer.
	 */
	async flushChanges() {
		this.draining = true
		this.currentActionCount = 0
		this.dirty = false
		const bufferBlock = this.currentBuffer.toBuffer()
		this.currentBuffer = new SmartBuffer()
		const deflateBuffer = await deflate(bufferBlock)
		const vhsBlockBuffer = new SmartBuffer({ size: deflateBuffer.length + 4 })
		vhsBlockBuffer.writeUInt32LE(deflateBuffer.length)
		vhsBlockBuffer.writeBuffer(deflateBuffer)
		await this.vhsFh.appendFile(vhsBlockBuffer.toBuffer())
		this.draining = false
		return vhsBlockBuffer.length
	}
	/**Trims the VHS file to the specified action count, discarding any actions beyond that count.
	 * @param {number} toActionCount - The action count to trim to.
	 */
	async commit(toActionCount, level) {
		if (this.dirty) await this.flushChanges()
		await this.vhsFh.close()

		const originalPath = join(this.path, "vhs.bin")
		const originalHandle = await fs.promises.open(originalPath, "r+")
		const tempHandle = await fs.promises.open(join(this.path, "temp.vhs.bin"), "w+")
		this.vhsFh = tempHandle // Use the temp file handle for writing
		const latestKeyframe = await this.keyframeRecord.getLatestKeyframe(toActionCount, level.template.iconName, level.bounds)
		// const startingActionCount = latestKeyframe?.totalActionCount ?? 0 // it's off by one. some where!
		let startingActionCount = 0
		let startingFileOffset = 0
		if (latestKeyframe) {
			startingFileOffset = latestKeyframe.offset
			// i suspect it might require actual action start of chunk. derive zhis value from bozh keyframe's totalActionCount and bufferActionCount values
			startingActionCount = latestKeyframe.totalActionCount - latestKeyframe.bufferActionCount// + 1
		}
		const count = await this._processVhsFile(originalHandle, async (actions, commandName, actionBytes, changes) => {
			if (this.actionCount == toActionCount) {
				return false // Stop processing
			}
			// this.actionCount += 1  Increment in _processVhsFile now
			if (actions == 0) {
				this.addBlockChange([changes.readUInt8(), changes.readUInt8(), changes.readUInt8()], changes.readUInt8())
			} else {
				this.appendAction(true, actionBytes, commandName)
			}
			return true // Continue processing
		}, startingFileOffset, startingActionCount)

		// flush changes to temp handle
		await this.flushChanges()
		// truncate original file
		await originalHandle.truncate(startingFileOffset)
		await originalHandle.close()
		// append temp file to original file
		// const tempBuffer = await this.vhsFh.readFile()
		const tempBuffer = await fs.promises.readFile(join(this.path, "temp.vhs.bin")) /// ?????
		// open original in append mode
		this.vhsFh = await fs.promises.open(originalPath, "a+")
		await this.vhsFh.appendFile(tempBuffer)
		// close temp file handle
		await tempHandle.close()
		// delete temp file
		await trash(join(this.path, "temp.vhs.bin"))
		// purge keyframes after the action count
		await this.keyframeRecord.purgeKeyframes(toActionCount)
		// vacuum database to optimize it
		// await this.keyframeRecord.vacuum()
		console.log("committed", count)
		return count
	}
	/** Closes file handles of change record. Does not flush changes. */
	async dispose() {
		await this.vhsFh.close()
		await this.keyframeRecord.close()
	}
}

/**Stopwatch class to measure elapsed time.
 * This class can be used to measure the time taken for operations.
 */
class Stopwatch {
	/**Creates a new Stopwatch instance.
	 * @param {boolean} [start=false] - Whether to start the stopwatch immediately.
	 */
	constructor(start = false) {
		this.startTime = 0
		this.endTime = 0
		this.running = false
		if (start) this.start()
	}
	/**Starts the stopwatch. */
	start() {
		this.startTime = Date.now()
		this.running = true
	}
	/**Stops the stopwatch.
	 * @returns {number} The elapsed time in milliseconds.
	 */
	stop() {
		if (!this.running) return 0
		this.endTime = Date.now()
		this.running = false
		return this.endTime - this.startTime
	}
	/**Gets the elapsed time in milliseconds.
	 * @returns {number} The elapsed time in milliseconds.
	 */
	get elapsed() {
		if (this.running) {
			return Date.now() - this.startTime
		} else {
			return this.endTime - this.startTime
		}
	}
}

/**Represents a keyframe record for a level.
 * This class manages level keyframes in a SQLite database, allowing for efficient retrieval and management of keyframe data.
 */
class KeyframeRecord {
	/**Creates a new KeyframeRecord instance.
	 * @param {string} path - The path to the SQLite database file.
	 */
	constructor(path) {
		this.path = path
		this.db = null
		this.ready = new Promise((resolve, reject) => {
			const db = new Database(path, OPEN_READWRITE | OPEN_CREATE, (err) => {
				if (err) {
					reject(err)
				} else {
					db.run("CREATE TABLE IF NOT EXISTS keyframes (id INTEGER PRIMARY KEY AUTOINCREMENT, offset INTEGER, totalActionCount INTEGER, bufferActionCount INTEGER, template TEXT, voxelData BLOB, levelData TEXT)", (err) => {
						if (err) {
							reject(err)
						} else {
							// Create index for totalActionCount
							db.run("CREATE INDEX IF NOT EXISTS idx_keyframes_totalActionCount ON keyframes(totalActionCount)", (err) => {
								if (err) {
									reject(err)
								} else {
									this.db = db
									resolve(db)
								}
							})
						}
					})
				}
			})
		})
	}
	/**Adds a keyframe to the database.
	 * @param {number} offset - The offset in the VHS file.
	 * @param {number} actionCount - The action count at this keyframe.
	 * @param {string} template - The template associated with this keyframe.
	 * @param {Buffer} voxelData - The level voxel data at this keyframe.
	 * @param {number[]} bounds - The bounds of the level.
	 * @param {string} [levelData="{}"] - Optional level data in JSON format.
	 * @returns {Promise<number>} The ID of the newly created keyframe.
	 */
	async addKeyframe(offset, totalActionCount, bufferActionCount, template, voxelData, bounds, levelData = "{}") {
		await this.ready
		const compressedVoxelData = await deflate(voxelData)
		return new Promise((resolve, reject) => {
			this.db.run("INSERT INTO keyframes (offset, totalActionCount, bufferActionCount, template, voxelData, levelData) VALUES (?, ?, ?, ?, ?, ?)", [offset, totalActionCount, bufferActionCount, template + KeyframeRecord.getBoundsKey(bounds), compressedVoxelData, levelData], function (err) {
				if (err) {
					reject(err)
				} else {
					resolve(this.lastID)
				}
			})
		})
	}
	/**Gets the latest keyframe before a given action count for a specific template.
	 * @param {number} beforeActionCount - The action count to search before.
	 * @param {string} template - The template to filter by.
	 * @param {number[]} bounds - The bounds of the level.
	 * @returns {Promise<object|null>} The latest keyframe record or null if not found.
	 */
	async getLatestKeyframe(beforeActionCount, template, bounds) {
		await this.ready
		return new Promise((resolve, reject) => {
			this.db.get("SELECT * FROM keyframes WHERE totalActionCount <= ? AND template = ? ORDER BY totalActionCount DESC LIMIT 1", [beforeActionCount, template + KeyframeRecord.getBoundsKey(bounds)], (err, row) => {
				if (err) {
					reject(err)
				} else {
					resolve(row)
				}
			})
		})
	}
	/**Purge keyframes after a specific action count.
	 * @param {number} afterActionCount - The action count to purge keyframes after.
	 * @returns {Promise<number>} The number of rows deleted.
	 */
	async purgeKeyframes(afterActionCount) {
		await this.ready
		return new Promise((resolve, reject) => {
			this.db.run("DELETE FROM keyframes WHERE totalActionCount > ?", [afterActionCount], function (err) {
				if (err) {
					reject(err)
				} else {
					resolve(this.changes)
				}
			})
		})
	}
	/**Vacuum the database to optimize it.
	 * @returns {Promise<void>}
	 */
	async vacuum() {
		await this.ready
		return new Promise((resolve, reject) => {
			this.db.run("VACUUM", (err) => {
				if (err) {
					reject(err)
				} else {
					resolve()
				}
			})
		})
	}
	/**Close the database connection.
	 * @returns {Promise<void>}
	 */
	async close() {
		await this.ready
		return new Promise((resolve, reject) => {
			this.db.close((err) => {
				if (err) {
					reject(err)
				} else {
					resolve()
				}
			})
		})
	}
	/**Get a string key for level bounds.
	 * @param {number[]} bounds - The bounds to generate a key for.
	 * @returns {string} The string key for the bounds.
	 */
	static getBoundsKey(bounds) {
		return bounds.join(".")
	}
}
