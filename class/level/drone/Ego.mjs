/** @typedef {import("../../../types/arrayLikes.mjs").Vector3} Vector3 */

/** Represents a drone's appearance. */
export class Ego {
	/** */
	constructor(ego = {}) {
		this.name = ego.name || ""
		this.scale = ego.scale || [1, 1, 1]
		this.skin = ego.skin || this.name
	}
	/**@todo Yet to be documented.
	 * @param {string} skin
	 * @returns
	 */
	setSkin(skin) {
		this.skin = skin
		return this
	}
	/**@todo Yet to be documented.
	 * @param {Vector3} scale
	 * @returns
	 */
	setScale(scale) {
		this.scale = scale
		return this
	}
	/**@todo Yet to be documented.
	 * @param {string} name
	 * @returns
	 */
	setName(name) {
		this.name = name
		return this
	}

	serialize() {
		return {
			name: this.name,
			skin: this.skin,
			scale: this.scale,
		}
	}
}

export default Ego
