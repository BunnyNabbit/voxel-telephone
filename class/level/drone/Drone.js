/** Represents a drone entity for replicating character and positions of player and non-player entities.. */
class Drone extends require("events") {
	/**Creates a new drone instance.
	 * @param {Object} ego - The drone's appearence object.
	 */
	constructor(ego = {}) {
		super()
		this.position = [0, 0, 0]
		this.orientation = [0, 0]
		this.modelScale = ego.scale || [1, 1, 1]
		this.name = ego.name || ""
		this.skin = ego.skin || this.name
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