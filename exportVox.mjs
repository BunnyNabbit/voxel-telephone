import { VoxelModelWriter } from "chunked-vox"
import fs from "fs"
/** @typedef {import("fs").PathLike} PathLike */

/**Export a level as a .vox file.
 * @param {Level} level - The level to export.
 * @param {PathLike} [writePath] - The path to write the .vox file to.
 * @return {Promise<void>} - A promise that resolves when the file is written.
 */
export async function exportLevelAsVox(level, writePath) {
	if (!writePath) writePath = level.changeRecord.path + "preview.vox"
	return new Promise((resolve) => {
		if (!level.changeRecord) throw new Error("Level is missing change record")
		// assuming exactly 255 entries in block set
		const palette = []
		level.blockset.forEach((element) => {
			palette.push(element)
		})
		palette.push([0, 0, 0]) // air
		const model = new VoxelModelWriter(palette, 64)
		for (let x = 0; x < level.bounds[0]; x++) {
			for (let y = 0; y < level.bounds[1]; y++) {
				for (let z = 0; z < level.bounds[2]; z++) {
					const voxel = level.getBlock([x, y, z])
					model.setBlock(x, level.bounds[1] - 1 - z, y, voxel) // z is gravity axis in MagicaVoxel. coordinate system has Y flipped
				}
			}
		}
		const voxData = model.writeVox()
		fs.writeFile(writePath, voxData, () => {
			resolve({ voxData, writePath })
		})
	})
}

export default exportLevelAsVox
