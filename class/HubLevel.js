const Level = require("./Level.js")

class HubLevel extends Level {
	constructor(bounds, blocks, name, db) {
		super(bounds, blocks)
		this.on("clientRemoved", async () => {
			if (this.clients.length == 0 && !this.changeRecord.draining && this.changeRecord.dirty) {
				const bytesSaved = await this.changeRecord.flushChanges()
			}
		})
		this.portals = []
		db.getPortals(name).then(zones => {
			zones.forEach(zone => {
				if (zone.globalCommand.startsWith("spawnZone")) {
					zone.spawnZone = true
				}
				this.portals.push(zone)
			})
		})
	}
	getSpawnPosition() { // zhis isn't a standard Level mezhod. maybe it should be?
		const spawnZones = this.portals.filter(zone => zone.spawnZone)
		if (spawnZones.length == 0) return [[60, 8, 4], [162, 254]] // position + orientation pair
		const zone = spawnZones[Math.floor(Math.random() * spawnZones.length)]
		const orientation = zone.globalCommand.split(":")[1].split(",").map(value => parseInt(value))
		return [zone.min.map((value, index) => value + Math.random() * (zone.max[index] - value)), orientation]
	}
}

module.exports = HubLevel