const promisify = require("node:util").promisify
const fs = require("fs")
const SmartBuffer = require("smart-buffer").SmartBuffer
const zlib = require("zlib")
const deflate = promisify(zlib.deflate)
const inflate = promisify(zlib.inflate)
const trash = import("trash")
const { join } = require('path')
/** Represents a change record for a level. */
class ChangeRecord {
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
		if (!fs.existsSync(path)) {
			fs.mkdirSync(path)
		}
		Promise.all([fs.promises.open(join(path + "/vhs.bin"), "a+")]).then((values) => {
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
	 * @returns {Promise<number>} The total number of actions processed.
	 * @private
	 */
	async _processVhsFile(vhsFh, processor) {
		let currentPosition = 0
		this.actionCount = 0
		while (true) {
			let bufferLength = Buffer.alloc(4)
			await vhsFh.read(bufferLength, 0, bufferLength.length, currentPosition)
			bufferLength = bufferLength.readUint32LE(0)
			if (bufferLength == 0) break

			const deflateBuffer = Buffer.alloc(bufferLength)
			await vhsFh.read(deflateBuffer, 0, deflateBuffer.length, currentPosition + 4)
			let changes = await inflate(deflateBuffer)
			changes = SmartBuffer.fromBuffer(changes)

			while (changes.remaining()) {
				const actions = changes.readUInt8()
				const actionBytes = []
				let commandName = null

				if (actions > 0) {
					commandName = changes.readStringNT()
					for (let i = 0; i < actions; i++) {
						actionBytes.push(changes.readUInt8())
					}
				}

				const exit = await processor(actions, commandName, actionBytes, changes)
				if (!exit) {
					return this.actionCount // Allow early exit
				}
			}

			currentPosition += bufferLength + 4
		}
		return this.actionCount
	}
	/**Restore block changes to a level.
	 * @param {Level} level - The level to restore changes to.
	 * @param {number} [maxActions] - The maximum number of actions to restore.
	 * @param {function} [staller] - The function to call to stall the restore process.
	 * @returns {Promise<number>} The total number of actions restored.
	 */
	async restoreBlockChangesToLevel(level, maxActions, staller) {
		level.loading = true
		const count = await this._processVhsFile(this.vhsFh, async (actions, commandName, actionBytes, changes) => {
			if (staller) {
				await staller()
			}
			if (maxActions && this.actionCount == maxActions) {
				level.loading = false
				return false // Stop processing
			}
			this.actionCount += 1
			if (actions == 0) {
				level.rawSetBlock([changes.readUInt8(), changes.readUInt8(), changes.readUInt8()], changes.readUInt8())
			} else {
				level.interpretCommand(commandName)
				level.currentCommandActionBytes = actionBytes
				level.commitAction()
			}
			return true // Continue processing
		})
		level.loading = false
		console.log("loaded", count)
		return count
	}
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
	async commit(toActionCount) {
		if (this.dirty) await this.flushChanges()
		await this.vhsFh.close()

		const oldPath = this.path + ".vhs.bin" + ".old"
		const newPath = this.path + "vhs.bin"
		fs.renameSync(newPath, oldPath)
		this.vhsFh = await fs.promises.open(newPath, "a+")
		const oldVhsFh = await fs.promises.open(oldPath, "a+")

		const count = await this._processVhsFile(oldVhsFh, (actions, commandName, actionBytes, changes) => {
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
		})

		await this.flushChanges()
		await oldVhsFh.close()
		await (await trash).default(oldPath)
		console.log("committed", count)
		return count

	}
	/** Closes file handles of change record. Does not flush changes. */
	async dispose() {
		await this.vhsFh.close()
	}
}

module.exports = ChangeRecord