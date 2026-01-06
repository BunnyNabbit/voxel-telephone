// TODO: Move to classicborne repository
import Drone from "classicborne/class/level/drone/Drone.mjs"
import { Ego } from "classicborne/class/level/drone/Ego.mjs"
import { jest } from "@jest/globals"

describe("Drone", () => {
	it("should initialize with default values", () => {
		const drone = new Drone()
		expect(drone.position).toEqual([0, 0, 0])
		expect(drone.orientation).toEqual([0, 0])
		expect(drone.ego).toBeInstanceOf(Ego)
		expect(drone.destroyed).toBe(false)
	})

	it("should set position and orientation and emit 'position' event", () => {
		const drone = new Drone()
		const position = { x: 1, y: 2, z: 3 }
		const orientation = { yaw: 45, pitch: 30 }
		const positionListener = jest.fn()
		drone.on("position", positionListener)
		drone.setPosition(position, orientation)
		expect(drone.position).toEqual([1, 2, 3])
		expect(drone.orientation).toEqual([45, 30])
		expect(positionListener).toHaveBeenCalledWith([1, 2, 3], [45, 30])
	})

	it("should emit 'destroy' event", () => {
		const drone = new Drone()
		const destroyListener = jest.fn()
		drone.on("destroy", destroyListener)
		drone.destroy()
		expect(drone.destroyed).toBe(true)
		expect(destroyListener).toHaveBeenCalled()
	})

	it("should not emit 'destroy' event if already destroyed", () => {
		const drone = new Drone()
		const destroyListener = jest.fn()
		drone.on("destroy", destroyListener)
		drone.destroy()
		destroyListener.mockClear()
		drone.destroy()
		expect(destroyListener).not.toHaveBeenCalled()
	})
})
