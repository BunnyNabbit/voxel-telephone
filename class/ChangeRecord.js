const promisify = require("node:util").promisify
const fs = require("fs")
const SmartBuffer = require("smart-buffer").SmartBuffer
const zlib = require("zlib")
const deflate = promisify(zlib.deflate)
const inflate = promisify(zlib.inflate)
const trash = import("trash")
const { join } = require('path')
class ChangeRecord {
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
	addBlockChange(position, block) {
		this.appendAction(false, position.concat(block))
	}
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

				if (!processor(actions, commandName, actionBytes, changes)) {
					return this.actionCount // Allow early exit
				}
			}

			currentPosition += bufferLength + 4
		}
		return this.actionCount
	}
	async restoreBlockChangesToLevel(level, maxActions) {
		level.loading = true
		const count = await this._processVhsFile(this.vhsFh, (actions, commandName, actionBytes, changes) => {
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
		console.log("commited", count)
		return count

	}
	async dispose() {
		await this.vhsFh.close()
	}
}

module.exports = ChangeRecord