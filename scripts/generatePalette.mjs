// Generates JSON formatted block set palette
import fs from "fs"

import("nbt").then(module => {
	const nbt = module.default
	const palette = []
	nbt.parse(fs.readFileSync(`../voxel-telephone-64.cw`), async (error, data) => {
		if (error) return console.error("Error while decoding NBT data.", error)
		Object.values(data.value.Metadata.value.CPE.value.BlockDefinitions.value).reverse().forEach(blockDefinition => {
			const element = [1, 2, 3].map((value) => blockDefinition.value.Fog.value[value])
			element.push(blockDefinition.value.BlockDraw.value)
			palette.push(element)
		})
		fs.writeFileSync("./6-8-5-rgb.json", JSON.stringify(palette))
		console.log("Wrote palette")
	})
}).catch(error => {
	console.error("Unable to import nbt. Is nbt installed?", error)
})
