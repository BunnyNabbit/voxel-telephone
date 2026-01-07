import path from "path"
import { ChangeRecord } from "classicborne/class/level/changeRecord/ChangeRecord.mjs"
import { getAbsolutePath } from "esm-path"
import { BaseTemplate, EmptyTemplate } from "classicborne/class/level/BaseTemplate.mjs"
import { BaseLevel } from "classicborne/class/level/BaseLevel.mjs"
import { levelCommands } from "./levelCommands.mjs"
const __dirname = getAbsolutePath(import.meta.url)

class BaseCommandLevel extends BaseLevel {
	static commands = levelCommands
}

const emptyTemplate = new EmptyTemplate()

class VoxelRecordTemplate extends BaseTemplate {
	/**/
	constructor(iconName) {
		super(iconName)
	}

	async generate(bounds = this.defaultBounds) {
		const cacheKey = this.iconName + VoxelRecordTemplate.getBoundsKey(bounds)
		const cached = VoxelRecordTemplate.cache.get(cacheKey)
		if (cached) return cached
		let tempLevel = new BaseCommandLevel(bounds, emptyTemplate.generate(bounds))
		const promise = new Promise((resolve) => {
			tempLevel.changeRecord = new ChangeRecord(path.join(__dirname, "/templates/", this.iconName), async () => {
				await tempLevel.changeRecord.restoreBlockChangesToLevel(tempLevel)
				tempLevel.dispose()
				resolve(tempLevel.blocks)
				setTimeout(() => {
					VoxelRecordTemplate.cache.delete(cacheKey)
				}, VoxelRecordTemplate.cacheTime)
			})
		})
		VoxelRecordTemplate.cache.set(cacheKey, promise)
		return promise
	}
	/**Get a string key for level bounds.
	 *
	 * @param {number[]} bounds - The bounds to generate a key for.
	 * @returns {string} The string key for the bounds.
	 */
	static getBoundsKey(bounds) {
		return bounds.join(".")
	}
	static cache = new Map()
	static cacheTime = 2.5 * 60 * 1000 // 2.5 minutes
}

export const templates = {
	builder: new VoxelRecordTemplate("voxel-telephone-64"),
	view: {
		built: new VoxelRecordTemplate("view-icon-built"),
		description: new VoxelRecordTemplate("view-icon-description"),
		orphaned: new VoxelRecordTemplate("view-icon-orphaned"),
		patrol: new VoxelRecordTemplate("view-icon-patrol"),
		player: new VoxelRecordTemplate("view-icon-player"),
		report: new VoxelRecordTemplate("view-icon-report"),
		scyzhe: new VoxelRecordTemplate("view-icon-scyzhe"),
		modeBlitz: new VoxelRecordTemplate("view-mode-blitz"),
		modeCasual: new VoxelRecordTemplate("view-mode-casual"),
		modeNull: new VoxelRecordTemplate("view-mode-null"),
		createRealm: new VoxelRecordTemplate("view-icon-create-realm"),
	},
	tutorial: {
		languageSelection: new VoxelRecordTemplate("tutorial-language-selection"),
	},
	animation: new VoxelRecordTemplate("animation"),
	empty: emptyTemplate,
}
