const Level = require("./Level.js")

class HubLevel extends Level {
   constructor(bounds, blocks, name, db) {
		super(bounds, blocks)
      this.on("clientRemoved", async () => {
         if (this.clients.length == 0 && !this.changeRecord.draining && this.changeRecord.dirty) {
            const bytesSaved = await this.changeRecord.flushChanges()
         }
      })
		db.getPortals(name).then(portals => {
         this.portals = portals
      })
   }
}

module.exports = HubLevel