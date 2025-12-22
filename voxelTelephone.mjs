import { Universe } from "./class/server/Universe.mjs"
// eslint-disable-next-line no-unused-vars
import { levelCommands } from "./class/level/levelCommands.mjs"
import serverConfiguration from "./config.json" with { type: "json" }
const universe = new Universe(serverConfiguration)

if (import.meta.hot) {
	import.meta.hot?.accept("./class/level/levelCommands.mjs", async () => {
		const ChangeRecord = (await import("classicborne")).ChangeRecord
		// purge KeyframeRecord and restore changes to latest ChangeRecord action.
		const levels = universe.levels.values()
		for (let level of levels) {
			level = await level
			if (level.changeRecord instanceof ChangeRecord) {
				await level.changeRecord.flushChanges()
				await level.changeRecord.keyframeRecord.purgeKeyframes(0)
				await level.changeRecord.restoreBlockChangesToLevel(level)
				level.reload()
				level.playSound("abort")
			}
		}
	})
}
