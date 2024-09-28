const fs = require("fs")
const nbt = require("nbt")
const path = require('path')

function createVoxelBufferTemplate(fileName) {
   let template = null
   nbt.parse(fs.readFileSync(path.join(__dirname, fileName)), async (error, data) => {
      if (error) throw error
      template = Buffer.from(data.value.BlockArray.value)
   })
   return function (bounds) {
      if (!template) throw "Builder template not found"
      return template
   }
}

module.exports = {
   builder: createVoxelBufferTemplate("voxel-telephone-64.cw"),
   view: {
      level: createVoxelBufferTemplate("view.cw"),
      built: createVoxelBufferTemplate("view-icon-built.cw"),
      description: createVoxelBufferTemplate("view-icon-description.cw"),
      orphaned: createVoxelBufferTemplate("view-icon-orphaned.cw"),
      patrol: createVoxelBufferTemplate("view-icon-patrol.cw"),
      player: createVoxelBufferTemplate("view-icon-player.cw"),
      report: createVoxelBufferTemplate("view-icon-report.cw"),
      scyzhe: createVoxelBufferTemplate("view-icon-scyzhe.cw"),
      modeBlitz: createVoxelBufferTemplate("view-mode-blitz.cw"),
      modeCasual: createVoxelBufferTemplate("view-mode-casual.cw"),
   },
   empty: (bounds) => {
      return Buffer.alloc(bounds[0] * bounds[1] * bounds[2])
   }
}