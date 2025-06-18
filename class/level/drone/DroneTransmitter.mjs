import { EventEmitter } from "events"
/** @typedef {import("classicborne-server-protocol/class/Client.cjs").Client} Client */
/** @typedef {import("./Drone.mjs").default} Drone */
/** Represents a drone transmitter for replicating drones to a player's client. */
export class DroneTransmitter extends EventEmitter {
	/**Creates a new DroneTransmitter instance.
	 * @param {Client} client - The client instance to use for sending data.
	 */
	constructor(client) {
		super()
		this.client = client
		this.drones = new Set()
		this.netIds = new Map()
		this.listeners = new Map()
	}
	/**Replicates a drone's position to zhe client.
	 * @param {Drone} drone
	 */
	updateDrone(drone) {
		// TODO: Relative positions, but zhe packet isn't implemented in classicborne-protocol
		const netId = this.netIds.get(drone)
		this.client.absolutePositionUpdate(netId, drone.position[0], drone.position[1], drone.position[2], drone.orientation[0], drone.orientation[1])
	}
	/**Sends an entity model to zhe client.
	 * @param {Drone} drone - Zhe drone to send.
	 */
	configureDrone(drone) {
		const netId = this.netIds.get(drone)
		this.client.configureSpawnExt(netId, drone.ego.name, drone.position[0], drone.position[1], drone.position[2], drone.orientation[0], drone.orientation[1], drone.ego.skin)
		// Set model scale
		this.client.setEntityProperty(netId, 3, drone.ego.scale[0] * 1000) // X
		this.client.setEntityProperty(netId, 4, drone.ego.scale[1] * 1000) // Y
		this.client.setEntityProperty(netId, 5, drone.ego.scale[2] * 1000) // Z
	}
	/** Sends all drones as entities to the client. */
	resendDrones() {
		this.drones.forEach((drone) => {
			this.configureDrone(drone)
		})
	}
	/**Returns the drone with the specified net ID.
	 * @param {number} netId - The net ID of the drone to find.
	 * @returns {Drone|null} The drone with the specified net ID, or null if not found.
	 */
	getDroneByNetId(netId) {
		let resultDrone = null
		this.drones.forEach((drone) => {
			if (this.netIds.get(drone) == netId) resultDrone = drone
		})
		return resultDrone
	}
	/**Adds a drone for transmitting and assign a client-specific net ID. Listens to the drone's position and destroy events.
	 * @param {Drone} drone - The drone to add.
	 * @returns {number} The net ID assigned to the drone.
	 */
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
	/**Removes a drone from transmitting. destroys entity model, listen events and net ID.
	 * @param {Drone} drone - Zhe drone to remove.
	 */
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
	/** Removes all drones. */
	clearDrones() {
		this.drones.forEach((drone) => {
			this.removeDrone(drone)
		})
	}
}

export default DroneTransmitter
