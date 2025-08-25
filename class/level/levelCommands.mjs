class LevelCommand {
	/** */
	constructor(layout, level, enums = {}) {
		this.level = level
		this.layout = layout
		this.enums = enums
		this.rawSet = level.loading
		this.blocksChanged = 0
	}

	setBlock(position, block) {
		try {
			if (this.rawSet) {
				this.level.rawSetBlock(position, block)
			} else {
				this.level.setBlock(position, block, [], false)
				this.blocksChanged++
				if (this.blocksChanged > LevelCommand.networkedBlockChanges) this.rawSet = true
			}
		} catch (err) {
			if (this.level.logErrors) console.error(`Error setting block at ${position}:`, err)
		}
	}

	parseBytes(actionBytes) {
		const data = {}
		let indexOffset = 0
		this.layout.forEach((layout, index) => {
			layout = layout.split(":")
			const name = layout[1]
			const type = layout[0]
			if (type.includes("enum")) {
				data[name] = this.enums[name][actionBytes[index + indexOffset]]
			} else if (type.includes("position")) {
				data[name] = [actionBytes[index + indexOffset], actionBytes[index + indexOffset + 1], actionBytes[index + indexOffset + 2]]

				indexOffset += 2
			} else {
				data[name] = actionBytes[index + indexOffset]
			}
		})
		return data
	}

	action() {
		const returnedObject = {
			requiresRefreshing: this.rawSet,
			blocksChanged: this.blocksChanged,
		}
		this.blocksChanged = 0
		this.rawSet = this.level.loading
		return returnedObject
	}

	clear() {
		this.blocksChanged = 0
	}
	static networkedBlockChanges = 4096
}

class Cuboid extends LevelCommand {
	name = "cuboid"
	static help = ["Makes a cuboid on two positions.", "If no arguments are added, block is inferred from your current hand and the server will ask for the block positions interactively."]
	static aliases = ["z"]
	/** */
	constructor(level) {
		super(["block:block", "&enum:mode", "position:position1", "position:position2"], level, {
			mode: ["solid", "hollow", "walls", "holes"],
		})
	}

	action(data) {
		data = this.parseBytes(data)
		const min = [0, 1, 2].map((index) => Math.min(data.position1[index], data.position2[index]))
		const max = [0, 1, 2].map((index) => Math.max(data.position1[index], data.position2[index]))
		const block = data.block
		const mode = data.mode
		for (let x = min[0]; x <= max[0]; x++) {
			for (let y = min[1]; y <= max[1]; y++) {
				for (let z = min[2]; z <= max[2]; z++) {
					switch (mode) {
						case "solid":
							this.setBlock([x, y, z], block)
							break
						case "hollow":
							if (x === min[0] || x === max[0] || y === min[1] || y === max[1] || z === min[2] || z === max[2]) this.setBlock([x, y, z], block)
							break
						case "walls":
							if (x === min[0] || x === max[0] || z === min[2] || z === max[2]) this.setBlock([x, y, z], block)
							break
						case "holes":
							if ((x + y + z) % 2 === 0) this.setBlock([x, y, z], block)
							break
					}
				}
			}
		}
		return super.action()
	}
}

class Line extends LevelCommand {
	name = "Line"
	static help = ["Makes a line between two points.", "If no arguments are added, block is inferred from your current hand and the server will ask for the block positions interactively."]
	static aliases = ["l", "ln"]
	/** */
	constructor(level) {
		super(["block:block", "position:start", "position:end"], level)
	}

	action(data) {
		// Parse the data using the command's layout.
		data = this.parseBytes(data)
		// Get the block ID from the parsed data.
		const block = data.block
		Line.process(data.start, data.end).forEach((position) => {
			this.setBlock(position, block)
		})
		return super.action()
	}

	static process(start, end) {
		const output = []
		// Calculate the differences between the start and end positions.
		let dx = end[0] - start[0]
		let dy = end[1] - start[1]
		let dz = end[2] - start[2]
		// Calculate the number of steps needed to draw the line.
		let steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz))
		// Iterate over the number of steps, calculating the position of each block in the line.
		for (let i = 0; i <= steps; i++) {
			const x = start[0] + (dx * i) / steps
			const y = start[1] + (dy * i) / steps
			const z = start[2] + (dz * i) / steps
			// Set the block at the calculated position.
			output.push([x, y, z].map((value) => Math.floor(value)))
		}
		return output
	}
}

class AbnormalTriangle extends LevelCommand {
	name = "AbnormalTriangle"
	static help = ["Makes a triangle from three points. The resulting triangle may have holes", "If no arguments are added, block is inferred from your current hand and the server will ask for the block positions interactively."]
	static aliases = ["triangle", "tri"]
	/** */
	constructor(level) {
		super(["block:block", "position:position1", "position:position2", "position:position3"], level)
	}

	action(data) {
		data = this.parseBytes(data)
		const block = data.block
		const positions = [data.position1, data.position2, data.position3]
		function lineProcess(start, end) {
			return {
				positions: Line.process(start, end),
				start,
				end,
			}
		}
		const lines = [lineProcess(data.position1, data.position2), lineProcess(data.position2, data.position3), lineProcess(data.position3, data.position1)]

		// Find longest line to fill the triangle from
		const longestLine = lines.slice().sort((a, b) => b.positions.length - a.positions.length)[0]
		// Find end point, which is a point not used by the longest line
		const triangleEndPoint = positions.find((position) => !(longestLine.start == position || longestLine.end == position))
		// Draw from longest line to end point
		longestLine.positions.forEach((position) => {
			Line.process(position, triangleEndPoint).forEach((position) => {
				this.setBlock(position, block)
			})
		})
		return super.action()
	}
}

class SphereSlow extends LevelCommand {
	name = "SphereSlow"
	static help = ["Makes a sphere from a center point and a radius.", "If no arguments are added, block is inferred from your current hand and the server will ask for the block positions interactively."]
	static aliases = ["sphere", "sp"]
	/** */
	constructor(level) {
		super(["block:block", "&enum:mode", "position:center", "position:offset"], level, {
			mode: ["solid"],
		})
	}

	action(data) {
		data = this.parseBytes(data)
		const block = data.block
		const center = data.center
		const radius = Math.min(center.map((value, index) => Math.abs(data.offset[index] - value)).sort((a, b) => b - a)[0], 32) // i limit zhis number because large spheres are very taxing. however, if i am able to remove zhis limitation, it would need to be an entirely different function for format compatibility.
		for (let x = -radius; x <= radius; x++) {
			for (let y = -radius; y <= radius; y++) {
				for (let z = -radius; z <= radius; z++) {
					// check if within this.level.bounds
					if (!this.level.withinLevelBounds([center[0] + x, center[1] + y, center[2] + z])) continue
					if (x * x + y * y + z * z <= radius * radius) this.setBlock([center[0] + x, center[1] + y, center[2] + z], block)
				}
			}
		}
		return super.action()
	}
}

class Replace extends LevelCommand {
	name = "Replace"
	static aliases = ["r"]
	/** */
	constructor(level) {
		super(["block:findBlock", "position:position1", "position:position2", "block:replacementBlock"], level)
	}

	action(data) {
		data = this.parseBytes(data)
		const min = [0, 1, 2].map((index) => Math.min(data.position1[index], data.position2[index]))
		const max = [0, 1, 2].map((index) => Math.max(data.position1[index], data.position2[index]))
		const replacementBlock = data.replacementBlock
		for (let x = min[0]; x <= max[0]; x++) {
			for (let y = min[1]; y <= max[1]; y++) {
				for (let z = min[2]; z <= max[2]; z++) {
					const currentBlock = this.level.getBlock([x, y, z])
					if (currentBlock === data.findBlock) this.setBlock([x, y, z], replacementBlock)
				}
			}
		}
		return super.action()
	}
}

class PositionalTransform extends LevelCommand {
	name = "PositionalTransform "
	static aliases = ["move"]
	/** */
	constructor(level) {
		super(["&enum:mode", "&enum:rotation", "&enum:flipAxis", "position:positionStart", "position:positionEnd", "position:offsetPosition", "position:pastePosition"], level, {
			mode: ["move", "copy", "moveAir", "copyAir"],
			rotation: ["none", "clockwise", "counterclockwise"],
			flipAxis: ["none", "x", "y", "z"],
		})
	}

	action(data) {
		const { mode, rotation, flipAxis, positionStart, positionEnd, offsetPosition, pastePosition } = this.parseBytes(data)
		const min = [0, 1, 2].map((index) => Math.min(positionStart[index], positionEnd[index]))
		const max = [0, 1, 2].map((index) => Math.max(positionStart[index], positionEnd[index]))
		const bounds = [max[0] - min[0] + 1, max[1] - min[1] + 1, max[2] - min[2] + 1]
		const copyBuffer = Buffer.alloc(bounds[0] * bounds[1] * bounds[2])
		for (let x = min[0]; x <= max[0]; x++) {
			for (let y = min[1]; y <= max[1]; y++) {
				for (let z = min[2]; z <= max[2]; z++) {
					const block = this.level.getBlock([x, y, z])
					copyBuffer.writeUint8(block, (x - min[0]) * bounds[1] * bounds[2] + (y - min[1]) * bounds[2] + (z - min[2]))
					if (mode == "move") this.setBlock([x, y, z], 0) // Clear the block if moving
				}
			}
		}
		const placeAir = mode.endsWith("Air")
		const pasteOffsetFromStart = [pastePosition[0] - positionStart[0], pastePosition[1] - positionStart[1], pastePosition[2] - positionStart[2]]
		const offsetDifference = [positionStart[0] - offsetPosition[0], positionStart[1] - offsetPosition[1], positionStart[2] - offsetPosition[2]]

		for (let x = 0; x < bounds[0]; x++) {
			for (let y = 0; y < bounds[1]; y++) {
				for (let z = 0; z < bounds[2]; z++) {
					let newX = min[0] + x + pasteOffsetFromStart[0] + offsetDifference[0]
					let newY = min[1] + y + pasteOffsetFromStart[1] + offsetDifference[1]
					let newZ = min[2] + z + pasteOffsetFromStart[2] + offsetDifference[2]

					if (rotation === "counterclockwise") {
						const oldX = newX - pastePosition[0]
						const oldZ = newZ - pastePosition[2]
						newX = pastePosition[0] + oldZ
						newZ = pastePosition[2] - oldX
					} else if (rotation === "clockwise") {
						const oldX = newX - pastePosition[0]
						const oldZ = newZ - pastePosition[2]
						newX = pastePosition[0] - oldZ
						newZ = pastePosition[2] + oldX
					}

					if (flipAxis === "x") {
						newX = pastePosition[0] - (newX - pastePosition[0])
					} else if (flipAxis === "y") {
						newY = pastePosition[1] - (newY - pastePosition[1])
					} else if (flipAxis === "z") {
						newZ = pastePosition[2] - (newZ - pastePosition[2])
					}

					const block = copyBuffer.readUint8(x * bounds[1] * bounds[2] + y * bounds[2] + z)
					if (block === PositionalTransform.airBlockId && !placeAir) continue // Skip placing air blocks unless allowed
					this.setBlock([newX, newY, newZ], block)
				}
			}
		}
		return super.action()
	}
	static airBlockId = 0
}

export const levelCommands = [Cuboid, Line, AbnormalTriangle, SphereSlow, Replace, PositionalTransform]

export default levelCommands
