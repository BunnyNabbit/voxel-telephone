class Drone extends require("events") {
	constructor(ego = {}) {
		super()
		this.position = [0, 0, 0]
		this.orientation = [0, 0]
		this.modelScale = ego.scale || [1, 1, 1]
		this.name = ego.name || ""
		this.skin = ego.skin || this.name
		this.destroyed = false
	}
	setPosition(position, orientation) {
		this.position = [position.x, position.y, position.z]
		this.orientation = [orientation.yaw, orientation.pitch]
		this.emit("position", this.position, this.orientation)
	}
	destroy() {
		if (this.destroyed) return
		this.destroyed = true
		this.emit("destroy")
		this.removeAllListeners()
	}
}

module.exports = Drone