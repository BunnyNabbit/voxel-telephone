// Generates JSON formatted blockset palette

import("nbt").then(module => {
   const nbt = module.default
   const palette = []
   nbt.parse(fs.readFileSync(`../voxel-telephone-64.cw`), async (error, data) => {
      if (error) {
         return console.error("Error while decoding nbt data.", error)
      }
      Object.values(data.value.Metadata.value.CPE.value.BlockDefinitions.value).reverse().forEach(blockDefinition => {
         // console.log(blockDefinition.value.ID2.value)
         const element = [1, 2, 3].map((value) => blockDefinition.value.Fog.value[value])
         element.push(blockDefinition.value.BlockDraw.value)
         palette.push(element)
         // palette.push("#" + blockDefinition.value.Fog.value[1].toString(16).padStart(2,0) + blockDefinition.value.Fog.value[2].toString(16).padStart(2,0) + blockDefinition.value.Fog.value[3].toString(16).padStart(2,0))
      })
      fs.writeFileSync("./6-8-5-rgb.json", JSON.stringify(palette))
      console.log("Wrote palette")
   })
}).catch(error => {
   console.error("Unable to import nbt. Is nbt installed?", error)
})