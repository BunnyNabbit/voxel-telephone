const Level = require("./Level.cjs")

class Count {

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

class RealmLevel extends Level {

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
								const sX = (x * 4) + sampleX
								const sY = (y * 4) + sampleY
								const sZ = (z * 4) + sampleZ
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
}

module.exports = RealmLevel
