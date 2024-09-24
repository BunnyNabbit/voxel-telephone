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
	attemptCall(client, str) {
		const segments = str.split(" ")
		const commandName = segments[0]
		segments.shift()
		const remainingString = segments.join(" ")
		const command = this.commands.get(commandName)
		if (command && (!command.validate || command.validate(client, remainingString))) {
			command.action(client, remainingString)
			return true
		} else if (command) { // didn't pass validation, but a command was found.
			return true
		}
		return false
	}
}
module.exports = GlobalCommandRegistry