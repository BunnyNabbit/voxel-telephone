import { BaseLevelCommandInterpreter } from "classicborne/class/level/BaseLevelCommandInterpreter.mjs"
import { FormattedString, stringSkeleton } from "../strings/FormattedString.mjs"
/** @typedef {import("./BaseLevel.mjs").BaseLevel} BaseLevel */

export class LevelCommandInterpreter extends BaseLevelCommandInterpreter {
	/**
	 * @param {Level} level
	 */
	constructor(level) {
		super(level)
		this.on("playerError", (player, errorType) => {
			const errorMessage = LevelCommandInterpreter.parsingErrorFormattedStringMapping[errorType]
			player.message(new FormattedString(errorMessage, {}))
		})
		this.on("commandExecuted", () => {
			this.level.playSound("poof")
		})
		this.on("typeQuestion", (typeQuestion) => {
			this.level.messageAll(new FormattedString(stringSkeleton.level.commandQuestion[typeQuestion.type], { currentType: typeQuestion.typeName }))
		})
	}

	static parsingErrorFormattedStringMapping = {
		[BaseLevelCommandInterpreter.parsingErrors.invalidBlockId]: stringSkeleton.level.error.parsing.invalidBlockId,
		[BaseLevelCommandInterpreter.parsingErrors.invalidPosition]: stringSkeleton.level.error.parsing.invalidPosition,
		[BaseLevelCommandInterpreter.parsingErrors.positionOutBounds]: stringSkeleton.level.error.parsing.positionOutBounds,
	}

	interpretCommand(command, ...args) {
		const result = super.interpretCommand(command, ...args)
		if (!result) {
			const commandName = command
			this.level.messageAll(new FormattedString(stringSkeleton.level.error.commandNotFound, { commandName, levelName: this.level.name }))
		}
		return result
	}
}

export default LevelCommandInterpreter

if (import.meta.hot) {
	import("../HotModuleReplacementHelper.mjs").then((module) => {
		module.HotModuleReplacementHelper.handleClassModuleReplacement(import.meta, LevelCommandInterpreter)
	})
}
