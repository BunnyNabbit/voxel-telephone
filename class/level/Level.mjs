import { levelCommands } from "./levelCommands.mjs"
import { textSymbols } from "../../constants.mjs"
import defaultBlockset from "../../6-8-5-rgb.json" with { type: "json" }
import { BaseLevel } from "classicborne/class/level/BaseLevel.mjs"
import { LevelCommandInterpreter } from "./LevelCommandInterpreter.mjs"
/** @import { Player } from "../player/Player.mjs").Player} Player */
/** @import { Vector3 } from "../../types/arrayLikes.mjs" */
/** @import { clickData } from "../../types/eventData.mts" */

/**@todo Yet to be documented.
 * @extends {BaseLevel<{"playerAdded": (player: Player) => void; "playerRemoved": (player: Player) => void; "loaded": () => void; "unloaded": () => void; "levelLoaded": () => void; "click": (player: Player, click: clickData) => void}>}
 */
export class Level extends BaseLevel {
	/**@todo Yet to be documented.
	 * @param {Vector3} bounds
	 * @param {Buffer} blocks
	 */
	constructor(bounds, blocks) {
		super(bounds, blocks)
		this.loading = false
		this.inVcr = false
		this.portals = []
		this.blocking = false
		this.addListener("click", (player, click) => {
			if (click.type == "double") {
				player.emit("playSound", player.universe.sounds.abort)
			} else {
				player.emit("playSound", player.universe.sounds.click)
			}
		})
	}
	/**@todo Yet to be documented.
	 * @param {string|FormattedString} message
	 * @param {number[]} [types=[0]]
	 */
	messageAll(message, types = [0]) {
		this.players.forEach((player) => {
			player.message(message, types)
		})
		this.playSound("toggle")
	}
	toggleVcr() {
		this.inVcr = true
		this.playSound("gameTrackDrone")
		this.setBlinkText(textSymbols.pause)
	}
	/**@todo Yet to be documented.
	 * @param {string} username
	 * @returns {boolean}
	 */
	userHasPermission(username) {
		if (this.allowList.length == 0) return true
		if (this.allowList.includes(username)) return true
		return false
	}
	/**@todo Yet to be documented.
	 * @param {string} soundName
	 */
	playSound(soundName) {
		this.players.forEach((player) => {
			player.emit("playSound", player.universe.sounds[soundName])
		})
	}
	/**Sets the text that will blink in the level, or stops blinking if `blinkText` is false.
	 * @param {string|boolean} blinkText - The text to blink, or `false` to stop blinking.
	 * @param {?string} [subliminalText] - Optional subliminal text to display when blinking.
	 */
	setBlinkText(blinkText = false, subliminalText) {
		clearInterval(this.blinkInterval)
		if (blinkText === false) {
			this.players.forEach((player) => {
				player.message(" ", 100)
			})
			return (this.blinkText = null)
		}
		let toggle = false
		this.blinkText = subliminalText || blinkText
		const blink = () => {
			toggle = !toggle
			let text = " "
			if (toggle) text = this.blinkText
			this.players.forEach((player) => {
				player.message(text, 100)
			})
			this.blinkText = blinkText
		}
		this.blinkInterval = setInterval(blink, 500)
		blink()
	}
	static blockset = defaultBlockset
	static commandInterpreterClass = LevelCommandInterpreter
	static commands = levelCommands
}

export default Level

if (import.meta.hot) {
	import("../HotModuleReplacementHelper.mjs").then((module) => {
		module.HotModuleReplacementHelper.handleClassModuleReplacement(import.meta, Level)
	})
}
