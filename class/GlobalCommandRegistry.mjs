export class GlobalCommandRegistry {
	/** */
	constructor() {
		this.commands = new Map()
	}

	registerCommand(commandNames, action, validate) {
		if (!Array.isArray(commandNames)) commandNames = [commandNames]
		const commandObject = { action, validate, commandNames }
		commandNames.forEach((commandName) => {
			this.commands.set(commandName, commandObject)
		})
	}

	async attemptCall(player, str) {
		const segments = str.split(" ")
		const commandName = segments[0]
		segments.shift()
		const remainingString = segments.join(" ")
		const command = this.commands.get(commandName)
		if (command && (!command.validate || (await command.validate(player, remainingString)))) {
			try {
				await command.action(player, remainingString)
			} catch (err) {
				console.error("Failed to run command", str, err)
				player.message(`&cAn error occured while running the command. ${err}`, 0, ">&c")
				player.emit("playSound", player.universe.sounds.invalid)
			}
			return true
		} else if (command) {
			// didn't pass validation, but a command was found.
			player.emit("playSound", player.universe.sounds.invalid)
			return true
		}
		return false
	}
}

export default GlobalCommandRegistry
