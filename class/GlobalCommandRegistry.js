class GlobalCommandRegistry {
	constructor() {
		this.commands = new Map()
	}
	registerCommand(commandNames, action, validate) {
		if (!Array.isArray(commandNames)) commandNames = [commandNames]
		commandNames.forEach(commandName => {
			this.commands.set(commandName, { action, validate })
		})
	}
	async attemptCall(client, str) {
		const segments = str.split(" ")
		const commandName = segments[0]
		segments.shift()
		const remainingString = segments.join(" ")
		const command = this.commands.get(commandName)
		if (command && (!command.validate || await command.validate(client, remainingString))) {
			try {
				await command.action(client, remainingString)
			} catch (err) {
				console.error("Failed to run command", str, err)
				client.message(`&cAn error occured while running the command. ${err}`, 0, ">&c")
				client.emit("playSound", client.universe.sounds.invalid)
			}
			return true
		} else if (command) { // didn't pass validation, but a command was found.
			client.emit("playSound", client.universe.sounds.invalid)
			return true
		}
		return false
	}
}
module.exports = GlobalCommandRegistry