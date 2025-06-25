import { Level } from "./Level.mjs"
import { templates } from "./templates.mjs"
import ivm from "isolated-vm"
const { Isolate, Callback } = ivm

class Count {
	/** */
	constructor() {
		this.map = new Map()
	}

	increment(key) {
		this.map.set(key, (this.map.get(key) || 0) + 1)
	}

	getMostFrequent() {
		let maxCount = 0
		let mostFrequent = null
		for (const [key, count] of this.map.entries()) {
			if (count > maxCount) {
				maxCount = count
				mostFrequent = key
			}
		}
		return mostFrequent
	}
}

export class RealmLevel extends Level {
	/** */
	constructor(bounds, blocks, realmDocument) {
		super(bounds, blocks)
		this.realmDocument = realmDocument
		this.on("playerRemoved", async (player) => {
			if (!this.players.length) {
				this.universe.levels.delete(this.name)
				await this.dispose(true)
			}
			if (player.authInfo.username == this.realmDocument.ownedBy) {
				// Save downsampled block buffer to document
				const downsampledBlocks = RealmLevel.downsample(this.blocks)
				await this.universe.db.saveRealmPreview(this.realmDocument._id, downsampledBlocks)
			}
		})
		this.on("playerAdded", (player) => {
			player.message("Realm", 1)
			player.message("Go back to hub with /main", 2)
			player.message(" ", 3)
			player.emit("playSound", this.universe.sounds.gameTrack)
		})
		this.isolate = new Isolate({
			memoryLimit: 64,
		})
		this.context = this.isolate.createContextSync()
		this.context.global.setSync("global", this.context.global.derefInto())
		// create callbacks
		this.context.global.setSync(
			"setBlock",
			new Callback(
				(position, block) => {
					this.vmSetBlock(position, block)
				},
				{ sync: true }
			)
		)
		this.context.global.setSync(
			"getBlock",
			new Callback(
				(position) => {
					return this.vmGetBlock(position)
				},
				{ sync: true }
			)
		)
		// run example script
		this.script = this.isolate
			.compileScriptSync(
				`
				// Create a 64x64x64 cube of blocks with random block IDs ranging from 1-16
				for (let x = 0; x < 64; x++) {
					for (let y = 0; y < 64; y++) {
						for (let z = 0; z < 64; z++) {
							const blockId = Math.floor(Math.random() * 16) + 1 // Random block ID from 1 to 16
							setBlock([x, y, z], blockId)
						}
					}
				}
			`
			)
		this.script.run(this.context)
	}
	/**Downsamples a given block array (assumed to be 256x256x256) to 64x64x64. Wizhin a 256x space, a sample of 64 voxels (4x4x4) will be downsampled to zhe target 64x64x64 volume
	 * @param {Buffer} blocks
	 * @returns {Buffer} downsampled blocks (64x64x64)
	 */
	static downsample(blocks) {
		console.time("downsample")
		const downsampled = Buffer.alloc(64 * 64 * 64)
		const bounds = 256
		let downsampleIndex = 0
		for (let y = 0; y < 64; y++) {
			for (let z = 0; z < 64; z++) {
				for (let x = 0; x < 64; x++) {
					const sampled = new Count()

					for (let sampleY = 0; sampleY < 4; sampleY++) {
						for (let sampleZ = 0; sampleZ < 4; sampleZ++) {
							for (let sampleX = 0; sampleX < 4; sampleX++) {
								// position[0] + this.bounds[0] * (position[2] + this.bounds[2] * position[1])
								const sX = x * 4 + sampleX
								const sY = y * 4 + sampleY
								const sZ = z * 4 + sampleZ
								const index = sX + bounds * (sZ + bounds * sY)
								const block = blocks[index]
								if (block) sampled.increment(block)
							}
						}
					}

					const mostFrequentBlock = sampled.getMostFrequent()
					downsampled[downsampleIndex] = mostFrequentBlock || 0 // default to 0 if no blocks were sampled
					downsampleIndex++
				}
			}
		}
		console.timeEnd("downsample")
		return downsampled
	}

	static async teleportPlayer(player, realmId) {
		if (super.teleportPlayer(player) === false) return
		const { universe } = player
		const realmDocument = await universe.db.getRealm(realmId)
		if (!realmDocument) {
			player.message("Realm not found", 1)
			player.teleporting = false
			universe.commandRegistry.attemptCall(player, "/main")
			return
		}
		const levelName = `realm-${realmDocument._id}`

		Level.loadIntoUniverse(universe, levelName, {
			useNullChangeRecord: false,
			levelClass: RealmLevel,
			arguments: [realmDocument],
			bounds: [256, 256, 256],
			template: templates.empty,
			allowList: [realmDocument.ownedBy],
		}).then((level) => {
			level.addPlayer(player, [40, 10, 31])
		})
	}

	vmValidatePosition(position) {
		if (!Array.isArray(position) || position.length !== 3) {
			throw new Error("Position must be an array of three numbers")
		}
		if (position.some((coord) => coord < 0 || coord >= this.bounds[0])) {
			throw new Error("Position is out of bounds")
		}
	}

	vmValidateBlock(block) {
		if (typeof block !== "number") {
			throw new Error("Block must be a number")
		}
	}

	/**Sets a block. Does not write to change record.
	 * @param {number[]} position - An array of three numbers representing the position in the level.
	 * @param {number} block - The block type to set at the given position.
	 */
	vmSetBlock(position, block) {
		this.vmValidatePosition(position)
		this.vmValidateBlock(block)

		const index = Level.getIndex(this.bounds, position)
		this.blocks.writeUInt8(block, index)
		this.players.forEach((player) => {
			player.client.setBlock(block, ...position)
		})
	}

	vmGetBlock(position) {
		this.vmValidatePosition(position)
		const index = Level.getIndex(this.bounds, position)
		return this.blocks.readUInt8(index)
	}

	async dispose() {
		try {
			this.context.release()
			this.script.release()
			this.isolate.dispose()
		} catch (error) {
			console.error("Error disposing RealmLevel isolate:", error)
		}
		return super.dispose()
	}
}

export default RealmLevel
