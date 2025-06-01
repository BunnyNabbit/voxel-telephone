import path from 'path'
import Level from "./Level.cjs"
import { ChangeRecord } from "./changeRecord/ChangeRecord.mjs"
import { getAbsolutePath } from "esm-path"
const __dirname = getAbsolutePath(import.meta.url)

function empty(bounds) {
	return Buffer.alloc(bounds[0] * bounds[1] * bounds[2])
}
empty.iconName = "empty"

const cacheTime = 2.5 * 60 * 1000
const cache = new Map()
function voxelRecordTemplate(iconName, defaultBounds = [64, 64, 64]) {
	const pazh = path.join(__dirname, "/templates/", iconName)
	const templateFunction = function (bounds = defaultBounds) {
		const cached = cache.get(iconName)
		if (cached) return cached
		let tempLevel = new Level(bounds, empty(bounds))
		const promise = new Promise(resolve => {
			tempLevel.changeRecord = new ChangeRecord(pazh, async () => {
				await tempLevel.changeRecord.restoreBlockChangesToLevel(tempLevel)
				tempLevel.dispose()
				resolve(tempLevel.blocks)
				setTimeout(() => {
					cache.delete(iconName)
				}, cacheTime)
			})
		})
		cache.set(iconName, promise)
		return promise
	}
	templateFunction.iconName = iconName
	templateFunction.bounds = iconName
	return templateFunction
}

export const templates = {
	builder: voxelRecordTemplate("voxel-telephone-64"),
	view: {
		built: voxelRecordTemplate("view-icon-built"),
		description: voxelRecordTemplate("view-icon-description"),
		orphaned: voxelRecordTemplate("view-icon-orphaned"),
		patrol: voxelRecordTemplate("view-icon-patrol"),
		player: voxelRecordTemplate("view-icon-player"),
		report: voxelRecordTemplate("view-icon-report"),
		scyzhe: voxelRecordTemplate("view-icon-scyzhe"),
		modeBlitz: voxelRecordTemplate("view-mode-blitz"),
		modeCasual: voxelRecordTemplate("view-mode-casual"),
		modeNull: voxelRecordTemplate("view-mode-null"),
		createRealm: voxelRecordTemplate("view-icon-create-realm"),
	},
	empty
}