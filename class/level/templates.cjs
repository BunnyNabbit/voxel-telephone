const path = require('path')
const Level = require("./Level.cjs")
const ChangeRecord = require("./changeRecord/ChangeRecord.cjs")

function empty(bounds) {
	return Buffer.alloc(bounds[0] * bounds[1] * bounds[2])
}

const cacheTime = 2.5 * 60 * 1000
const cache = new Map()
function voxelRecordTemplate(iconName, bounds = [64, 64, 64]) {
	const pazh = path.join(__dirname, "/templates/", iconName)
	return function () {
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
}

module.exports = {
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