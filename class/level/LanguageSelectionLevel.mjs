import { Drone } from "./drone/Drone.mjs"
import { Ego } from "./drone/Ego.mjs"
import { TutorialLevel } from "./TutorialLevel.mjs"
import { templates } from "./templates.mjs"

class BaseLanguageDrone extends Drone {
	/** */
	constructor(data, languageDroneBaseUrl) {
		super(
			new Ego({
				skin: `${languageDroneBaseUrl}/drone-${data.locale}.png`,
				name: data.name,
			})
		)
		this.locale = data.locale
		this.name = data.name
		this.radius = 2
	}
	/**Checks if a given position is within interaction range of the drone.
	 * @param {Object} position - The position to check, with x, y, z properties.
	 * @returns {boolean} True if the position is within range, false otherwise.
	 */
	isTouching(position) {
		const dx = position.x - this.position[0]
		const dy = position.y - this.position[1]
		const dz = position.z - this.position[2]
		const distanceSquared = dx * dx + dy * dy + dz * dz
		return distanceSquared <= this.radius * this.radius
	}
}

class EnglishDrone extends BaseLanguageDrone {
	constructor(languageDroneBaseUrl) {
		super(
			{
				locale: "en",
				name: "English",
			},
			languageDroneBaseUrl
		)
	}
}

class SpanishDrone extends BaseLanguageDrone {
	constructor(languageDroneBaseUrl) {
		super(
			{
				locale: "es",
				name: "Español",
			},
			languageDroneBaseUrl
		)
	}
}

export class LanguageSelectionLevel extends TutorialLevel {
	/** */
	constructor(bounds, blocks) {
		super(bounds, blocks)

		this.on("loaded", () => {
			this.createDroneArrangement()
		})
		this.positionEventListeners = new Map()
		this.on("playerRemoved", async (player) => {
			const positionEventListener = this.positionEventListeners.get(player)
			player.client.removeListener("position", positionEventListener)
		})
		this.on("playerAdded", async (player) => {
			const onPosition = (position) => {
				// interact with drones
				for (const drone of this.drones) {
					if (drone instanceof BaseLanguageDrone && drone.isTouching(position)) drone.emit("interact", player)
				}
			}
			player.client.on("position", onPosition)
			this.positionEventListeners.set(player, onPosition)
			player.emit("playSound", this.universe.sounds.playbackTrack)
		})
	}
	/** Creates an arrangement of drones in a circle, each representing a language option. When a player interacts with a drone, they are set to that language and progressed to the next tutorial step. */
	createDroneArrangement() {
		const count = LanguageSelectionLevel.droneClasses.length
		const radius = 5
		const centerX = this.bounds[0] / 2
		const centerZ = this.bounds[2] / 2
		const y = 3.8
		LanguageSelectionLevel.droneClasses.forEach((droneClass, index) => {
			const angle = (index / count) * 2 * Math.PI - Math.PI / 2 // start at top
			const x = centerX + radius * Math.cos(angle)
			const z = centerZ + radius * Math.sin(angle)
			const drone = new droneClass(`${this.universe.serverConfiguration.sounds.audioPlayerBaseURL}game/`)
			this.addDrone(drone)
			drone.setPosition({ x, y, z }, { yaw: 0, pitch: 0 })
			drone.on("interact", (player) => {
				if (drone.spinning) return
				drone.spinning = true
				player.universe.commandRegistry.attemptCall(player, `/setting language ${drone.locale}`)
				if (this.complete(player, `Language set to ${drone.name}.`)) {
					for (let animationStep = 0; animationStep < 60; animationStep++) {
						setTimeout(() => {
							drone.setPosition(
								{
									x,
									y: y + animationStep * 0.1,
									z,
								},
								{ yaw: (animationStep * 15) % 256, pitch: 0 }
							)
						}, animationStep * 50)
					}
				}
			})
		})
	}

	async getSpawnPosition() {
		return [
			[32, 8, 32], // centered
			[0, 0], // facing norzh, level. should be facing English.
		]
	}

	static droneClasses = [EnglishDrone, SpanishDrone]
	static template = templates.tutorial.languageSelection
}

export default LanguageSelectionLevel
