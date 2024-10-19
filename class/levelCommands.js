class Command {
	constructor(layout, level, enums = {}) {
		this.level = level
		this.layout = layout
		this.enums = enums
	}
	setBlock(position, block) {
		if (this.level.loading) {
			this.level.rawSetBlock(position, block)
		} else {
			this.level.setBlock(position, block, [], false)
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
				data[name] = [
					actionBytes[index + indexOffset],
					actionBytes[index + indexOffset + 1],
					actionBytes[index + indexOffset + 2]
				]
				indexOffset += 2
			} else {
				data[name] = actionBytes[index + indexOffset]
			}
		})
		return data
	}
}

class Cuboid extends Command {
	name = "cuboid"
	static help = ["Makes a cuboid on two positions.", "If no arguments are added, block is inferred from your current hand and the server will ask for the block positions interactively."]
	static aliases = ["z"]
	constructor(level) {
		super(["block:block", "&enum:mode", "position:position1", "position:position2"], level, {
			mode: ["soild", "hollow", "walls", "holes"]
		})
	}
	action(data) {
		data = this.parseBytes(data)
		const min = [0, 1, 2].map(index => Math.min(data.position1[index], data.position2[index]))
		const max = [0, 1, 2].map(index => Math.max(data.position1[index], data.position2[index]))
		const block = data.block
		const mode = data.mode
		for (let x = min[0]; x <= max[0]; x++) {
			for (let y = min[1]; y <= max[1]; y++) {
				for (let z = min[2]; z <= max[2]; z++) {
					switch (mode) {
						case "soild":
							this.setBlock([x, y, z], block)
							break
						case "hollow":
							if (x === min[0] || x === max[0] || y === min[1] || y === max[1] || z === min[2] || z === max[2]) {
								this.setBlock([x, y, z], block)
							}
							break
						case "walls":
							if (x === min[0] || x === max[0] || z === min[2] || z === max[2]) {
								this.setBlock([x, y, z], block)
							}
							break
						case "holes":
							if ((x + y + z) % 2 === 0) {
								this.setBlock([x, y, z], block)
							}
							break
					}
				}
			}
		}
	}
}

class Line extends Command {
	name = "Line"
	static help = ["Makes a line between two points.", "If no arguments are added, block is inferred from your current hand and the server will ask for the block positions interactively."]
	static aliases = ["t"]
	constructor(level) {
		super(["block:block", "position:start", "position:end"], level)
	}
	action(data) {
		// Parse the data using the command's layout.
		data = this.parseBytes(data)
		// Get the block ID from the parsed data.
		const block = data.block
		// Get the start and end positions from the parsed data.
		const start = data.start
		const end = data.end
		// Calculate the differences between the start and end positions.
		let dx = end[0] - start[0]
		let dy = end[1] - start[1]
		let dz = end[2] - start[2]
		// Calculate the number of steps needed to draw the line.
		let steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz))
		// Iterate over the number of steps, calculating the position of each block in the line.
		for (let i = 0; i <= steps; i++) {
			const x = start[0] + dx * i / steps
			const y = start[1] + dy * i / steps
			const z = start[2] + dz * i / steps
			// Set the block at the calculated position.
			this.setBlock([x, y, z].map(value => Math.floor(value)), block)
		}
	}
}

module.exports = {
	commands: [Cuboid, Line]
}