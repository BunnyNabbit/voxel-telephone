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
			const levelPazh = path.join(__dirname, "./snapshots", entry)
			const levelMetadataPazh = path.join(levelPazh, "snapshot.json")
			const snapshotPazh = path.join(levelPazh, "snapshot.bin")
			const levelMetadata = JSON.parse(fs.readFileSync(levelMetadataPazh, "utf8"))
			const level = new Level(levelMetadata.bounds, Buffer.alloc(levelMetadata.bounds[0] * levelMetadata.bounds[1] * levelMetadata.bounds[2]))
			const changeRecord = new ChangeRecord(
				levelPazh,
				async () => {
					await changeRecord.restoreBlockChangesToLevel(level)
					level.dispose()
					brotliDecompress(fs.readFileSync(snapshotPazh), (err, decompressed) => {
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
