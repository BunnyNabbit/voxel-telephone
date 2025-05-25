export class Zone {
	constructor(position1, position2) {
		this.min = [0, 1, 2].map(index => Math.min(position1[index], position2[index]))
		this.max = [0, 1, 2].map(index => Math.max(position1[index], position2[index]))
	}
	serialize() {
		const output = { min: this.min, max: this.max }
		if (this.globalCommand) output.globalCommand = this.globalCommand
		return output
	}
	intersects(position) {
		return !position.some((value, index) => (this.min[index] <= value && this.max[index] + 1 >= value) == false)
	}
	static deserialize(data) {
		const zone = new Zone(data.min, data.max)
		if (data.globalCommand) {
			zone.globalCommand = data.globalCommand
		}
		return zone
	}
}
