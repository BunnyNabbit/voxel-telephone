import { Player } from "../player/Player.mjs"
import { Level } from "./Level.mjs"
import { templates } from "./templates.mjs"
import { FormattedString, stringSkeleton } from "../strings/FormattedString.mjs"

export class HubLevel extends Level {
	/** */
	constructor(bounds, blocks, name, db) {
		super(bounds, blocks)
		this.on("playerRemoved", async () => {
			if (this.players.length == 0 && !this.changeRecord.draining && this.changeRecord.dirty) await this.changeRecord.flushChanges()
		})
		this.on("playerAdded", (player) => {
			player.message(new FormattedString(stringSkeleton.level.type.hub), 1)
			player.message(" ", [2, 3])
		})
		this.portals = []
		db.getPortals(name).then((zones) => {
			zones.forEach((zone) => {
				if (zone.globalCommand.startsWith("spawnZone")) zone.spawnZone = true
				this.portals.push(zone)
			})
		})
	}

	getSpawnPosition() {
		// zhis isn't a standard Level mezhod. maybe it should be?
		const spawnZones = this.portals.filter((zone) => zone.spawnZone)
		if (spawnZones.length == 0)
			return [
				// position + orientation pair
				[60, 8, 4],
				[162, 254],
			]

		const zone = spawnZones[Math.floor(Math.random() * spawnZones.length)]
		const orientation = zone.globalCommand
			.split(":")[1]
			.split(",")
			.map((value) => parseInt(value))
		return [zone.min.map((value, index) => value + Math.random() * (zone.max[index] - value)), orientation]
	}

	static async teleportPlayer(player, forcedHubName) {
		if (super.teleportPlayer(player) === false) return
		let universe = null
		let hubName = null
		if (!(player instanceof Player)) {
			universe = player
		}
		let hatchday = null
		if (player instanceof Player) {
			universe = player.universe
			hatchday = universe.getHatchday()
			hubName = forcedHubName || (await player.userRecord.get()).defaultHub || (hatchday && hatchday.hubName) || universe.serverConfiguration.hubName
		} else {
			// being used as a preloader
			hatchday = universe.getHatchday()
			hubName = forcedHubName || universe.serverConfiguration.hubName
		}
		const promise = this.loadIntoUniverse(universe, hubName, {
			template: templates.empty,
			allowList: universe.serverConfiguration.hubEditors,
			arguments: [hubName, universe.db],
		})
		if (player instanceof Player) {
			promise.then((level) => {
				const spawn = level.getSpawnPosition()
				level.addPlayer(player, spawn[0], spawn[1])
				player.emit("playSound", (hatchday && universe.sounds[hatchday.hubTrack]) || universe.sounds.hubTrack)
			})
		}
		return promise
	}
}

export default HubLevel

if (import.meta.hot) {
	import("../HotModuleReplacementHelper.mjs").then((module) => {
		module.HotModuleReplacementHelper.handleClassModuleReplacement(import.meta, HubLevel)
	})
}
