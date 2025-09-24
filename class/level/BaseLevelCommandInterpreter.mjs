import { TypedEmitter } from "tiny-typed-emitter"
/** @typedef {import("./BaseLevel.mjs").BaseLevel} BaseLevel */
/** @typedef {import("../player/BasePlayer.mjs").BasePlayer} BasePlayer */
/** @typedef {import("../../types/arrayLikes.mjs").Vector3} Vector3 */

export class TypeQuestion {
	/**@todo Yet to be documented.
	 * @param {string} type
	 * @param {string} typeName
	 */
	constructor(type, typeName) {
		this.type = type
		this.typeName = typeName
	}
}
/**As an instance, I am initialized wizh a level. I act on zhe level via commands provided by zhe player or by ozher source, such as `ChangeRecord` loading. I may be used interacitvely by a player. Zhis causes zhe level to block writes to avoid potential conflict wizh input intended as responses to my interactive questions.
 * @extends {TypedEmitter<{"playerError": (player: BasePlayer, errorType: number) => void "typeQuestion": (typeQuestion: TypeQuestion) => void}>}
 */
export class BaseLevelCommandInterpreter extends TypedEmitter {
	/**@todo Yet to be documented.
	 * @param {BaseLevel} level
	 */
	constructor(level) {
		super()
		this.level = level
		this.level.blocking = false
		this.level.loading = false
	}
	/**@todo Yet to be documented.
	 * @param {string} command
	 * @param {?BasePlayer} player
	 * @param {number[]} [actionBytes=[]]
	 */
	interpretCommand(command = "cuboid 1", player = null, actionBytes = []) {
		// i.e: cuboid 1
		// consider: if the block set has names, user could refer to blocks by name and not just id.
		const commandClass = this.level.constructor.getCommandClassFromName(command)
		if (commandClass) {
			this.level.blocking = true
			this.currentCommand = new commandClass(this.level)
			this.currentCommandLayoutIndex = 0
			this.currentCommandActionBytes = actionBytes
			// parse command for bytes
			const splitCommand = command.split(" ").slice(1)
			if (splitCommand.length) {
				this.processCommandArguments(splitCommand, player)
			} else {
				this.inferCurrentCommand(player?.getInferredData(), player)
			}
		} else if (command) {
			return false
		}
		return true
	}
	/**@todo Yet to be documented.
	 * @param {?Object} providedData
	 * @param {number} providedData.block
	 * @param {Vector3} providedData.position
	 * @param {?BasePlayer} player
	 */
	inferCurrentCommand(providedData = null, player = null) {
		const currentType = this.currentCommand.layout[this.currentCommandLayoutIndex]
		if (currentType == null) return this.commitAction(player)
		if (currentType.startsWith("&")) {
			// TODO: infer byte type size: i.e: the zero element is a position, and would need three action bytes.
			this.currentCommandLayoutIndex++
			this.currentCommandActionBytes.push(0)
			return this.inferCurrentCommand(null, player)
		}
		const type = currentType.split(":")[0]

		if (type == "block") {
			if (providedData?.block != null) {
				this.currentCommandActionBytes.push(providedData.block)
				this.currentCommandLayoutIndex++
				this.inferCurrentCommand(null, player)
				return true
			} else {
				if (!this.level.loading) this.emit("typeQuestion", new TypeQuestion(type, currentType))
				return
			}
		}
		if (type == "position") {
			if (Array.isArray(providedData?.position) && providedData.position.length == 3) {
				this.currentCommandActionBytes.push(providedData.position[0])
				this.currentCommandActionBytes.push(providedData.position[1])
				this.currentCommandActionBytes.push(providedData.position[2])
				this.currentCommandLayoutIndex++
				this.inferCurrentCommand(null, player)
				return true
			} else {
				if (!this.level.loading) this.emit("typeQuestion", new TypeQuestion(type, currentType))
				return
			}
		}
		throw new Error(`Command needs ${currentType} but no handler for type was used.`)
	}
	/**@todo Yet to be documented.
	 * @param {string[]} splitCommand
	 * @param {BasePlayer} player
	 */
	processCommandArguments(splitCommand, player) {
		let currentIndex = 0
		const incrementIndex = (commandIndex = 1) => {
			this.currentCommandLayoutIndex++
			currentIndex += commandIndex
		}
		while (true) {
			const layoutElement = this.currentCommand.layout[this.currentCommandLayoutIndex]
			if (!layoutElement) break
			if (splitCommand[currentIndex] == null) break
			const type = layoutElement.split(":")[0].replace("&", "")
			if (type == "block") {
				let block
				if (splitCommand[currentIndex] == "hand") {
					block = player.heldBlock
					this.currentCommandActionBytes.push(block)
					incrementIndex()
					continue
				}
				block = parseInt(splitCommand[currentIndex])
				if (!BaseLevelCommandInterpreter.validateByte(block)) {
					this.emit("parsingError", player, BaseLevelCommandInterpreter.parsingErrors.invalidBlockId)
					break
				}
				this.currentCommandActionBytes.push(block)
				incrementIndex()
				continue
			} else if (type == "position") {
				let position = [0, 1, 2].map((index) => parseInt(splitCommand[currentIndex + index]))
				if (position.some((num) => !BaseLevelCommandInterpreter.validateByte(num))) {
					this.emit("parsingError", player, BaseLevelCommandInterpreter.parsingErrors.invalidPosition)
					break
				}
				if (!this.withinLevelBounds(position)) {
					this.emit("parsingError", player, BaseLevelCommandInterpreter.parsingErrors.positionOutBounds)
					break
				}
				this.currentCommandActionBytes.push(...position)
				incrementIndex(3)
				continue
			} else if (type == "enum") {
				const enumName = layoutElement.split(":")[1]
				const enumValue = splitCommand[currentIndex]
				const attemptByte = parseInt(enumValue)
				if (BaseLevelCommandInterpreter.validateByte(attemptByte) && this.currentCommand.enums[enumName][attemptByte]) {
					// input is an index
					this.currentCommandActionBytes.push(attemptByte)
					incrementIndex()
					continue
				}
				const index = this.currentCommand.enums[enumName].findIndex((value) => {
					// find index by enum name
					return value == enumValue
				})
				if (index == -1) break
				this.currentCommandActionBytes.push(index)
				incrementIndex()
				continue
			}
			break
		}
		this.inferCurrentCommand(null, player)
	}
	static parsingErrors = {
		invalidBlockId: 0,
		invalidPosition: 1,
		positionOutBounds: 2,
	}
	/**@todo Yet to be documented.
	 * @param {?BasePlayer} player
	 */
	commitAction(player = null) {
		const command = this.currentCommand
		const { requiresRefreshing } = command.action(this.currentCommandActionBytes)
		if (this.level.loading == false) {
			this.level.changeRecord.appendAction(true, this.currentCommandActionBytes, command.name)
			this.emit("commandExecuted", command.name, this.currentCommandActionBytes)
			if (requiresRefreshing) this.level.reload()
		}
		if (!this.level.changeRecord.draining && this.level.changeRecord.currentActionCount > 1024) {
			this.level.changeRecord.flushChanges()
		}
		if (player && player.repeatMode) {
			this.currentCommandLayoutIndex = 0
			this.currentCommandActionBytes = []
			// TODO: use of getInferredData is highly unezhical
			this.inferCurrentCommand(player?.getInferredData(), player) // FIXME: possible infinite loop if no command layout exists. check for &
		} else {
			this.currentCommand = null
			this.level.blocking = false
		}
	}
	dispose() {
		this.removeAllListeners()
	}
	/**@todo Yet to be documented.
	 * @param {number} number
	 * @returns {boolean}
	 */
	static validateByte(number) {
		if (isNaN(number)) return false
		if (number < 0) return false
		if (number > 255) return false
		return true
	}
}

export default BaseLevelCommandInterpreter
