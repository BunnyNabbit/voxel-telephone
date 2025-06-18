/** Represents a drone's appearance. */
export class Ego {
	/** */
	constructor(ego = {}) {
		this.name = ego.name || ""
		this.scale = ego.scale || [1, 1, 1]
		this.skin = ego.skin || this.name
	}

	setSkin(skin) {
		this.skin = skin
		return this
	}

	setScale(scale) {
		this.scale = scale
		return this
	}

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
