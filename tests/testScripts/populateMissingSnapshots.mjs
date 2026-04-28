import path from "path"
import { Level } from "classicborneclass/class/level/Level.mjs"
import { ChangeRecord } from "classicborneclass/level/changeRecord/ChangeRecord.mjs"
import fs from "node:fs"
import { getAbsolutePath } from "esm-path"
import { brotliCompress, constants } from "node:zlib"
const __dirname = getAbsolutePath(import.meta.url)

fs.readdirSync(path.join(__dirname, "../snapshots")).forEach((entry) => {
	// filter for directories
	if (fs.statSync(path.join(__dirname, "../snapshots", entry)).isDirectory()) {
		// check if snapshot.bin is missing
		if (!fs.existsSync(path.join(__dirname, "../snapshots", entry, "snapshot.bin"))) {
			let snapshotMetadata = {}
			try {
				snapshotMetadata = JSON.parse(fs.readFileSync(path.join(__dirname, "../snapshots", entry, "snapshot.json")))
			} catch (error) {
				// create default metadata
				snapshotMetadata = {
					bounds: [64, 64, 64],
				}
				// write default metadata
				fs.writeFileSync(path.join(__dirname, "../snapshots", entry, "snapshot.json"), JSON.stringify(snapshotMetadata, null, 1))
			}
			const bounds = snapshotMetadata.bounds
			const level = new Level(bounds, Buffer.alloc(bounds[0] * bounds[1] * bounds[2]))
			const changeRecord = new ChangeRecord(
				path.join(__dirname, "../snapshots", entry),
				async () => {
					await changeRecord.restoreBlockChangesToLevel(level)
					level.dispose()
					// compress level.blocks
					brotliCompress(level.blocks, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }, (err, compressed) => {
						if (err) throw err
						// write compressed blocks to snapshot.bin
						fs.writeFileSync(path.join(__dirname, "../snapshots", entry, "snapshot.bin"), compressed)
					})
				},
				{ useKeyframeRecord: false }
			)
			level.changeRecord = changeRecord
		}
	}
})
