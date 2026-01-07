import { FormattedString, stringSkeleton } from "./strings/FormattedString.mjs"
import { Commands } from "./player/Commands.mjs"

export class GlobalCommandRegistry {
	/**/
	constructor() {
		this.commands = new Map()
	}

	registerCommand(commandNames, action, validate) {
		if (!Array.isArray(commandNames)) commandNames = [commandNames]
		if (Array.isArray(validate)) validate = Commands.makeMultiValidator(validate)
		const commandObject = { action, validate, commandNames }
		commandNames.forEach((commandName) => {
			this.commands.set(commandName.toLowerCase(), commandObject)
		})
	}

	async attemptCall(player, str) {
		const segments = str.split(" ")
		const commandName = segments[0].toLowerCase()
		segments.shift()
		const remainingString = segments.join(" ")
		const command = this.commands.get(commandName)
		try {
			if (command && (!command.validate || (await command.validate(player, remainingString)))) {
				try {
					await command.action(player, remainingString)
				} catch (err) {
					console.error("Failed to run command", str, err)
					player.message(new FormattedString(stringSkeleton.command.error.uncaught, { err }), 0, ">&c")
					player.emit("playSound", player.universe.sounds.invalid)
				}
				return true
			} else if (command) {
				// didn't pass validation, but a command was found.
				player.emit("playSound", player.universe.sounds.invalid)
				return true
			}
		} catch (error) {
			console.error("Failed to validate command", str, error)
			player.message(new FormattedString(stringSkeleton.command.error.uncaught, { err: error.message }), 0, ">&c")
			player.emit("playSound", player.universe.sounds.invalid)
			return true
		}
		return false
	}
}

export default GlobalCommandRegistry
