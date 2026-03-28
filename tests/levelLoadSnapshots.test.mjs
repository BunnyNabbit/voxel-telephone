import { Level } from "../class/level/Level.mjs"
import { ChangeRecord } from "classicborne/class/level/changeRecord/ChangeRecord.mjs"
import path from "path"
import fs from "node:fs"
import { getAbsolutePath } from "esm-path"
import { brotliDecompress } from "node:zlib"
const __dirname = getAbsolutePath(import.meta.url)

const entries = []
fs.readdirSync(path.join(__dirname, "./snapshots")).forEach((entry) => {
	// filter for directories
	if (fs.statSync(path.join(__dirname, "./snapshots", entry)).isDirectory()) {
		entries.push([entry])
	}
})

describe("Level load", () => {
	test.each(entries)("%s", (entry) => {
		return new Promise((resolve) => {
			const levelPath = path.join(__dirname, "./snapshots", entry)
			const levelMetadataPath = path.join(levelPath, "snapshot.json")
			const snapshotPath = path.join(levelPath, "snapshot.bin")
			const levelMetadata = JSON.parse(fs.readFileSync(levelMetadataPath, "utf8"))
			const level = new Level(levelMetadata.bounds, Buffer.alloc(levelMetadata.bounds[0] * levelMetadata.bounds[1] * levelMetadata.bounds[2]))
			const changeRecord = new ChangeRecord(
				levelPath,
				async () => {
					await changeRecord.restoreBlockChangesToLevel(level)
					level.dispose()
					brotliDecompress(fs.readFileSync(snapshotPath), (err, decompressed) => {
						if (err) throw err
						expect(decompressed).toEqual(level.blocks)
						resolve()
					})
				},
				{ useKeyframeRecord: false }
			)
			level.changeRecord = changeRecord
		})
	})
})
