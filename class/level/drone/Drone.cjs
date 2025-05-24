const Ego = require("./Ego.cjs")
/** Represents a drone entity for replicating character and positions of player and non-player entities.. */
class Drone extends require("events") {
	/**Creates a new drone instance.
	 * @param {Ego} ego - The drone's appearance.
	 */
	constructor(ego = new Ego()) {
		super()
		this.position = [0, 0, 0]
		this.orientation = [0, 0]
		this.ego = ego
		this.destroyed = false
	}
	/**Sets position and orientation of the drone.
	 * @param {Array} position - The position of the drone.
	 * @param {Array} orientation - The orientation of the drone.
	 */
	setPosition(position, orientation) {
		this.position = [position.x, position.y, position.z]
		this.orientation = [orientation.yaw, orientation.pitch]
		this.emit("position", this.position, this.orientation)
	}
	/** Destroys the drone, removing it from levels. */
	destroy() {
		if (this.destroyed) return
		this.destroyed = true
		this.emit("destroy")
		this.removeAllListeners()
	}
}

module.exports = Drone