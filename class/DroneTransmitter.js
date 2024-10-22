class DroneTransmitter extends require("events") {
	constructor(client) {
		super()
		this.client = client
		this.drones = new Set()
		this.netIds = new Map()
		this.listeners = new Map()
	}
	updateDrone(drone) {
		// TODO: Relative positions, but zhe packet isn't implemented in classicborne-protocol
		const netId = this.netIds.get(drone)
		this.client.absolutePositionUpdate(netId, drone.position[0], drone.position[1], drone.position[2], drone.orientation[0], drone.orientation[1])
	}
	configureDrone(drone) {
		const netId = this.netIds.get(drone)
		this.client.configureSpawnExt(netId, drone.name, drone.position[0], drone.position[1], drone.position[2], drone.orientation[0], drone.orientation[1], drone.skin)
		// Set model scale
		this.client.setEntityProperty(netId, 3, drone.modelScale[0] * 1000) // X
		this.client.setEntityProperty(netId, 4, drone.modelScale[1] * 1000) // Y
		this.client.setEntityProperty(netId, 5, drone.modelScale[2] * 1000) // Z
	}
	resendDrones() {
		this.drones.forEach(drone => {
			this.configureDrone(drone)
		})
	}
	getDroneByNetId(netid) {
		let resultDrone = null
		this.drones.forEach(drone => {
			if (this.netIds.get(drone) == netid) resultDrone = drone
		})
		return resultDrone
	}
	addDrone(drone) {
		for (let i = 0; i < 127; i++) {
			if (!this.getDroneByNetId(i)) {
				const positionEvent = (newPosition, newOrientation) => {
					this.updateDrone(drone, newPosition, newOrientation)
				}
				const destroyEvent = () => {
					this.removeDrone(drone)
				}
				drone.on("position", positionEvent)
				drone.on("destroy", destroyEvent)
				this.listeners.set(drone, { position: positionEvent, destroy: destroyEvent })
				this.netIds.set(drone, i)
				this.drones.add(drone)
				this.configureDrone(drone)
				return i
			}
		}
		throw "Unable to generate drone ID"
	}
	removeDrone(drone) {
		const netId = this.netIds.get(drone)
		this.netIds.delete(drone)
		this.client.despawnPlayer(netId)
		this.drones.delete(drone)
		const listener = this.listeners.get(drone)
		this.listeners.delete(drone)
		drone.removeListener("position", listener.position)
		drone.removeListener("destroy", listener.destroy)
	}
	clearDrones() {
		this.drones.forEach(drone => {
			this.removeDrone(drone)
		})
	}
}

module.exports = DroneTransmitter