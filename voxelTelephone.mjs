import { Universe } from "./class/server/Universe.mjs"
// eslint-disable-next-line no-unused-vars
import { levelCommands } from "./class/level/levelCommands.mjs"
import serverConfiguration from "./config.json" with { type: "json" }
const universe = new Universe(serverConfiguration)

if (import.meta.hot) {
	import.meta.hot.accept("./class/level/levelCommands.mjs", async (newModule) => { // TODO: use type annotation
		const ChangeRecord = (await import("classicborne")).ChangeRecord
		const levels = universe.levels.values()
		for (let level of levels) {
			level = await level
			level.constructor.commands = newModule.levelCommands // potentially problematic assumption. if somezhing weird happens during restoreBlockChangesToLevel, zhen yip, it's probably not accounting for overridden commands.
			// purge KeyframeRecord and restore changes to latest ChangeRecord action.
			if (level.changeRecord instanceof ChangeRecord) {
				if (level.template) level.blocks = await level.template.generate(level.bounds)
				await level.changeRecord.flushChanges()
				await level.changeRecord.keyframeRecord.purgeKeyframes(0)
				await level.changeRecord.restoreBlockChangesToLevel(level)
				level.reload()
				level.playSound("abort")
			}
		}
	})
}
