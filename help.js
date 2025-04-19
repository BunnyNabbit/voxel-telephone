function toArray(iterator) {
	const array = []
	for (const element of iterator) {
		array.push(element)
	}
	return array
}

const Level = require("./class/level/Level.js")

function register(universe) {
	class Help {
		constructor(universe) {
			this.topics = new Map()
			this.commands = new Map()
			this.universe = universe
		}
		register(help) {
			if (help instanceof CommandHelp) return this.commands.set(help.name, help)
			if (help instanceof TopicHelp) return this.topics.set(help.name, help)
			throw new Error("Unknown help type")
		}
		callPlayer(player, argument) {
			if (!argument) {
				player.message(`${highlight("Categories")}: ${Object.values(categories).join(", ")}`)
				argument = "help"
			}
			argument = argument.toLowerCase().split(" ")[0]
			const topic = this.topics.get(argument)
			if (topic) return topic.displayHelpToPlayer(player)
			const command = universe.commandRegistry.commands.get("/" + argument) || universe.commandRegistry.commands.get(argument) || Level.getCommandClassFromName(argument.replace("/", ""))
			if (command) {
				const commandHelp = this.commands.get((command.name && "/" + command.name) || command.commandNames[0])
				if (!commandHelp) {
					player.message(`Command exists but unable to find help document for it.`)
					return
				}
				let aliases
				if (command.commandNames) {
					aliases = command.commandNames.filter(name => name !== command.commandNames[0]).join(", ")
				} else {
					aliases = command.aliases.map(alias => "/" + alias).join(", ")
				}
				if (aliases) player.message(`${highlight("Aliases")}: ${aliases}`)
				commandHelp.displayHelpToPlayer(player)
				return
			}
			const category = categories[argument]
			if (category) {
				player.message(category)
				player.message(`${highlight("Topics")}: ${toArray(this.topics.values()).filter(help => help.category == category).map(help => help.name).join(", ")}`)
				player.message(`${highlight("Commands")}: ${toArray(this.commands.values()).filter(help => help.category == category).map(help => help.name).join(", ")}`)
				return
			}
			player.message(`Unable to find help document for ${argument}.`)
		}
	}

	const help = new Help(universe)

	const categories = {
		// misc: "Misc",
		moderation: "Moderation",
		safety: "Safety",
		building: "Building",
		information: "Information",
		gameplay: "Gameplay"
	}

	class TopicHelp {
		constructor(name, help, category = categories.misc) {
			this.type = "topic"
			this.name = name
			this.help = help
			this.category = category
		}
		displayHelpToPlayer(player) {
			this.help.forEach(message => {
				player.message(message)
			})
		}
	}
	class CommandHelp extends TopicHelp {
		constructor(name, help, category) {
			super(name, help, category)
			this.type = "command"
		}
	}

	function highlight(string) {
		return `&a${string}&f`
	}

	help.register(new TopicHelp("game", [
		`Voxel Telephone is a telephone game which players build a given prompt and describe builds.`,
		`Each game begins with a prompt which players repeatedly build and describe until the 16th turn. When a game's 16th turn has been complete, the final sequence of descriptions and builds can be seen in the view level.`,
		`There is no time limit for games, and a player may take their time building or describing. If a player leaves while building, their game will be reserved for 1 hour before it is released back to other players.`
	], categories.information))

	help.register(new CommandHelp("/rules", [
		`Displays rules of the server and game. It is important to follow these rules as they are for maintaining both safety and gameplay integrity.`
	], categories.information))

	help.register(new CommandHelp("/vcr", [
		`Enables VCR mode in a level, allowing for previous level states to be viewed and switched to.`,
		`Block changes and commands are always saved and may be reverted if needed.`,
		`If VCR is enabled, the commands for rewinding (${highlight("/rewind <actions>")}) and fast-forwarding (${highlight("/fastforward <actions>")}) become usable. Rewinding and fast-forwarding only affects the preview and does not affect the level state until it has been commited with the ${highlight("/commit")} command.`
	], categories.building))

	help.register(new CommandHelp("/commit", [
		`Usable if VCR is currently enabled with ${highlight("/vcr")}.`,
		`Saves the state seen in VCR as the current level state and disables VCR mode, allowing for the level to be edited. Actions that were rewinded cannot be restored after a level state has been commited.`,
		`To cancel VCR without commiting a state, use ${highlight("/abort")}.`
	], categories.building))

	help.register(new CommandHelp("/rewind", [
		`Usage: ${highlight("/fastforward <actions>")}`,
		`Usable if VCR is currently enabled with ${highlight("/vcr")}.`,
		`Reverts a number of actions done to a level. If no argument is given, only one action will be reverted.`
	], categories.building))

	help.register(new CommandHelp("/fastforward", [
		`Usage: ${highlight("/fastforward <actions>")}`,
		`Usable if VCR is currently enabled with ${highlight("/vcr")}.`,
		`Restores a number of actions reverted by ${highlight("/rewind")}. If no argument is given, only one action will be restored.`
	], categories.building))


	help.register(new CommandHelp("/paint", [
		`Toggles paint mode. Attempting to destroy blocks will instead replace that block with the block on hand.`
	], categories.building))

	help.register(new CommandHelp("/abort", [
		`Used for canceling interactive operations, such as building commands or disabling VCR mode.`,
		`When used to cancel VCR. The level will revert to the state before VCR was enabled. No state will be commited in this case and may be used to safely check out a level's previous state.`
	], categories.building))

	help.register(new CommandHelp("/place", [
		`Places a block at your player position. The block you are holding will be placed.`
	], categories.building))

	help.register(new CommandHelp("/mark", [
		`Marks your player position for interactive commands.`,
		`For example, ${highlight("/cuboid")} will ask for two positions. You can use ${highlight("/mark")} to set one of them.`
	], categories.building))

	help.register(new TopicHelp("templates", [
		`builder - Used as the default template for building which includes a palette and axis lines.`,
		`empty - An empty template. Used by describe turns and the hub level.`,
	], categories.building))

	help.register(new CommandHelp("/template", [
		`Switches the level's template. For a list of templates, see ${highlight("/help templates")}.`,
		`Because of how Voxel Telephone stores block changes of a level, it may be possible that the level will look different after switching to another template.`,
		`Issues may become apparent if commands which read the level's state are used. ${highlight("/template empty")} may be useful for seeing how a level looks in the perspective of a describer.`,
		`Switching the template is a non-destructive action in terms of the block change timeline. Using this command does not affect how the level will look to a describer and will always be viewed with an empty template.`
	], categories.building))

	help.register(new CommandHelp("/clients", [
		`Lists active players and the clients they are using.`
	], categories.information))

	help.register(new CommandHelp("/finish", [
		`Marks a turn as finished and exits back to hub. Turn assignment will also avoid from giving turns to you from its associated game.`,
		`To avoid submitting your work as final, use ${highlight("/skip")} to pass your turn.`
	], categories.gameplay))

	help.register(new CommandHelp("/skip", [
		`Skips the current turn. Turn assignment will avoid giving you that turn.`,
	], categories.gameplay))

	help.register(new CommandHelp("/main", [
		`Enters the hub level.`,
	], categories.gameplay))

	help.register(new CommandHelp("/view", [
		`Usage: ${highlight("/view <mode>")}`,
		`Enters the view level where you can see finished and ongoing games.`,
		`When issued without a mode (${highlight("/view")}), each game will be represented by a column with pairs of turns in each grid. If a game has not been finished, only icons representing the state of a turn will be visualized. If a game has been finished then the entire game sequence with builds and descriptions are visible.`,
		`${highlight("/view user")} shows you all of your own builds, even if the game it is associated with isn't completed.`,
		`Players with moderation permission may use ${highlight("/view mod")} to enter a variant of the level to see builds for all games, even if they aren't complete.`
	], categories.gameplay))

	help.register(new CommandHelp("/play", [
		`Enters a new game. Games are picked randomly. If a game cannot be found, the system will prompt for you to create a new game by initializing its prompt.`,
		`If you abruptly leave a building turn, your game will be reserved for a hour. During the reservation period, you may re-enter the game by using the command. After that time has passed, the game will be released to other players.`
	], categories.gameplay))

	help.register(new CommandHelp("/report", [
		`Reports the current turn for moderation review. Additionally, the associated game will stop being played until the report has been acknowledged.`,
		`Abuse of this command may result in moderation punishment. Please review ${highlight("/rules")} to see which content isn't allowed.`,
	], categories.safety))

	help.register(new CommandHelp("/purge", [
		`Usage: ${highlight("/purge <reason>")}`,
		`Purges the latest turn of a highlighted game in ${highlight("/view")}. ${highlight("<reason>")} is an optional reason for purging.`,
		`This command is only available for moderators.`
	], categories.moderation))

	help.register(new CommandHelp("/diverge", [
		`Creates a new game timeline branching off from the highlighted turn in ${highlight("/view")}.`,
		`This command is only available for moderators.`
	], categories.moderation))
	
	help.register(new CommandHelp("/playback", [
		`Replay a set of turns in ${highlight("/view")}.`,
	], categories.gameplay))

	help.register(new CommandHelp("/setting", [
		`Usage: ${highlight("/setting [setting name] [value (on/off)]")}`,
		`Allows for setting preferences.`,
		`music - Should music play?`,
		`sounds - Should sounds play?`
	], categories.gameplay))

	const colorNames = {
		"0": "Black",
		"1": "Navy",
		"2": "Green",
		"3": "Teal",
		"4": "Maroon",
		"5": "Purple",
		"6": "Gold",
		"7": "Silver",
		"8": "Gray",
		"9": "Blue",
		"a": "Lime",
		"b": "Aqua",
		"c": "Red",
		"d": "Pink",
		"e": "Yellow",
		"f": "White",
	}

	help.register(new TopicHelp("colors", Object.entries(colorNames).map((entry) => `${entry[0]} - &${entry[0]}${entry[1]}`), categories.information))

	help.register(new TopicHelp("crazy", [
		`Crazy? I was crazy once. They locked me in a room. A rubber room. A rubber room with rats. A rubber room with rubber rats. And rubber rats make me crazy.`
	]))

	Level.commands.forEach((command) => {
		help.register(new CommandHelp(`/${command.name}`, command.help, categories.building))
	})

	universe.registerCommand(["/help", "/cmdhelp"], (player, argument) => {
		help.callPlayer(player, argument)
	})

	help.register(new CommandHelp("/help", [
		`Usage: ${highlight("/help <a command, topic or category>")}`,
		`Lists help documentation and aliases (shortcuts) for a command, topic or category. If used without an argument provided, a list of command categories and topics is listed along with a few featured commands.`,
		`For example, ${highlight("/help vcr")} will bring up the help documentation for the ${highlight("/vcr")} command.`,
		`Throughout help documentation, you may notice ${highlight("<angled brackets>")} and ${highlight("[square brackets]")}. This annotation helps describe a command's argument and if that argument is optional or not. ${highlight("<angled brackets>")} describe an optional argument, while ${highlight("[square brackets]")} are required arguments.`
	]), categories.information)

	// misc topics for attempting to run commands from ozher server software
	help.register(new TopicHelp("where-are-levels", [
		`Voxel Telephone does not have a list of levels. Instead, all game modes are in the ${highlight("/main")} level hub as portals.`,
		`Walk into the portals located in the hub to enter its game mode.`,
		`Alternatively, use the following commands to enter a game mode.`,
		`- ${highlight("/play")} - Enter a random game.`,
		`- ${highlight("/view")} - Enter the view gallery.`,
		`- ${highlight("/main")} - Enter the hub.`
	]))
	
	help.register(new TopicHelp("where-are-ranks", [
		`Voxel Telephone does not have a list of ranks.`
	]))

	help.register(new TopicHelp("where-are-realms", [
		`Voxel Telephone currently does not have personal realms/overseer.`,
		`If this is in your interests, please give attention to the following GitHub issue.`,
		`https://github.com/BunnyNabbit/voxel-telephone/issues/17`
	]))
}

module.exports = {
	register
}