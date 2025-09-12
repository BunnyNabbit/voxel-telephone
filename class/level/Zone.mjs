/** @typedef {import("../../types/arrayLikes.mjs").Vector3} Vector3 */

export class Zone {
	/**@todo Yet to be documented.
	 * @param {Vector3} position1
	 * @param {Vector3} position2
	 */
	constructor(position1, position2) {
		this.min = [0, 1, 2].map((index) => Math.min(position1[index], position2[index]))
		this.max = [0, 1, 2].map((index) => Math.max(position1[index], position2[index]))
	}
	/** @todo Yet to be documented. */
	serialize() {
		const output = { min: this.min, max: this.max }
		if (this.globalCommand) output.globalCommand = this.globalCommand
		return output
	}
	/**@todo Yet to be documented.
	 * @param {Vector3} position
	 */
	intersects(position) {
		return !position.some((value, index) => (this.min[index] <= value && this.max[index] + 1 >= value) == false)
	}
	/**@todo Yet to be documented.
	 * @param {Object} data
	 * @param	{Vector3} data.min
	 * @param	{Vector3} data.max
	 */
	static deserialize(data) {
		const zone = new Zone(data.min, data.max)
		if (data.globalCommand) zone.globalCommand = data.globalCommand
		return zone
	}
}
