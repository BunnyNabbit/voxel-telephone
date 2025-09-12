/** @typedef {import("../player/Player.mjs").Player} Player */

export class Watchdog {
	/**@todo Yet to be documented.
	 * @param {Player} player 
	 */
	constructor(player) {
		this.interval = setInterval(() => {
			this.currentRate = 0
		}, 1000)
		this.currentRate = 0
		this.limit = 382
		this.player = player
	}

	rateOperation(amount = 1) {
		this.currentRate += amount
		if (this.currentRate > this.limit) {
			this.player.client.disconnect("Sanctioned: Watchdog triggered")
			return true
		}
		return false
	}

	destroy() {
		clearInterval(this.interval)
	}
}

export default Watchdog
