import fs from "fs"
import path from "path"
import { DragonMark, Heading, Paragraph, Text, InlineCode, Image } from "./DragonMark.mjs"
import { Level } from "./level/Level.mjs"
import { getAbsolutePath } from "esm-path"
const __dirname = getAbsolutePath(import.meta.url)

export class Category {

	constructor(name) {
		this.name = name
		this.documents = []
	}
	displayHelpToPlayer(player) {
		player.message(`&cCategory&f: ${this.name}`)
		if (this.documents.length) player.message(`${this.documents.join(", ")}`)
	}
}

export class TopicHelp {

	constructor(name, title, help, category) {
		this.type = "topic"
		this.name = name
		this.title = title
		this.help = help
		this.category = category
	}
	displayHelpToPlayer(player) {
		this.help.forEach(message => {
			player.message(message)
		})
	}
}

export class CommandHelp extends TopicHelp {

	constructor(name, title, help, category) {
		super(name, title, help, category)
		this.type = "command"
	}
}

export class Help {
	/**Creates an instance of the Help class.
	 * @param {Universe} universe - The universe object to interact with.
	 */
	constructor(universe) {
		this.universe = universe
		this.data = Help.loadHelpDocs(path.join(__dirname, "../astro-website/src/help"), path.join(__dirname, "../astro-website/dist/client/_astro"), universe.serverConfiguration.website.baseURL).then(data => {
			this.data = data
		})
	}
	/**Displays help information to the player based on the provided argument.
	 * @param {Player} player - The player to display help information to.
	 * @param {String} argument - The argument provided by the player.
	 */
	async callPlayer(player, argument) {
		await this.data
		const universe = this.universe
		let displayLink = false
		if (!argument) {
			player.message(`&cCategories&f: ${Array.from(this.data.categories).map(([key]) => this.data.categories.get(key).name).join(", ")}`)
			argument = "help"
			displayLink = true
		}
		argument = argument.toLowerCase().split(" ")[0]
		const topic = this.data.topics.get(argument)
		if (topic) return topic.displayHelpToPlayer(player)
		const command = universe.commandRegistry.commands.get("/" + argument) || universe.commandRegistry.commands.get(argument) || Level.getCommandClassFromName(argument.replace("/", ""))
		if (command) {
			const commandHelp = this.data.commands.get((command.name && "/" + command.name.toLowerCase()) || command.commandNames[0])
			if (!commandHelp) return player.message(`Command exists but unable to find help document for it.`)
			commandHelp.displayHelpToPlayer(player)
			if (displayLink) player.message(`&eHelp documentation is available on the web. ${universe.serverConfiguration.website.baseURL}help`)
			return
		}
		const category = this.data.categories.get(argument)
		if (category) return category.displayHelpToPlayer(player)
		player.message(`Unable to find help document for ${argument}.`)
	}
	/**Parses the markdown content into Minecraft classic text format.
	 * @param {String} markdown - The markdown content to parse.
	 * @returns {Object} - An object containing the parsed text and heading.
	 */
	static parseMarkdownToClassicText(markdown, config) {
		const structure = DragonMark.parse(markdown)
		const firstHeading = structure.find(element => element.type === "heading").content[0].content
		return {
			text: Help.convertStructureToClassicText(structure, "&f", config),
			heading: firstHeading
		}
	}
	/**Loads the help documents from the specified directory.
	 * @param {String} directory - The directory to load help documents from.
	 * @returns {Promise<Object>} - A promise that resolves to an object containing topics, commands, and categories.
	 */
	static async loadHelpDocs(directory, astroAssetCache, baseURL) {
		const topics = new Map()
		const commands = new Map()
		const categories = new Map()
		const fullImageURLs = new Map()
		await fs.promises.readdir(astroAssetCache).then(files => {
			files.forEach(file => {
				if (file.endsWith(".webp")) {
					const [name, hash] = path.basename(file).split(".")
					const key = `./${name}.webp`
					const existing = fullImageURLs.get(fullImageURLs)
					const fullURL = `${baseURL}_astro/${name}.${hash}.webp`
					if (!existing) {
						fullImageURLs.set(key, fullURL)
					} else { // replace if shorter
						if (existing.length > name.length) {
							fullImageURLs.set(key, fullURL)
						}
					}
				}
			})
		}).catch(err => {
			console.warn(`Unable to read astro asset cache: ${err}`)
		})
		const files = await Help.fileWalker(directory, 1)

		for (const file of files) {
			if (path.extname(file) === ".md") {
				const name = path.basename(file, ".md")
				if (name == "index") continue // category
				const content = await fs.promises.readFile(file, "utf-8")
				const parsed = Help.parseMarkdownToClassicText(content, {
					fullImageURLs,
					baseURL
				})
				let category = path.basename(path.dirname(file))
				if (category == "help") category = null

				if (name.startsWith("cmd-") || name.startsWith("build-cmd-")) {
					const commandName = "/" + name.replace("cmd-", "").replace("build-", "")
					commands.set(commandName, new CommandHelp(commandName, parsed.heading, parsed.text, category))
				} else {
					topics.set(name, new TopicHelp(name, parsed.heading, parsed.text, category))
				}

				if (category) {
					if (!categories.has(category)) categories.set(category, new Category(category[0].toUpperCase() + category.slice(1)))
					categories.get(category).documents.push(parsed.heading)
				}
			}
		}

		return { topics, commands, categories }
	}
	/**Converts the given parsed DragonMark structure to Minecraft classic text format.
	* @param {Array} structure - The structure to convert.
	* @param {string} defaultColorCode - The default color code to use.
	* @returns {string} - The converted text.
	*/
	static convertStructureToClassicText(structure, defaultColorCode = "&f", imageConfig) {
		let output = []
		structure.forEach((element) => {
			if (element instanceof Heading) {
				let headingText = element.content.map((e) => (e instanceof Text ? e.content : "")).join("")
				let invertedLevel = 7 - element.level
				output.push(`${"=".repeat(invertedLevel)} &c${headingText}${defaultColorCode} ${"=".repeat(invertedLevel)}`)
			} else if (element instanceof Paragraph) {
				let paragraph = ""
				element.content.forEach((e) => {
					if (e instanceof Text) {
						paragraph += e.content
					} else if (e instanceof InlineCode) {
						paragraph += `&a${e.content}${defaultColorCode}`
					} else if (e instanceof Image) {
						paragraph += `${imageConfig.fullImageURLs.get(e.content.url)} (${e.content.altText})`
					}
				})
				output.push(paragraph)
			}
		})
		return output
	}
	/**Explores recursively a directory and returns all the file paths and folder paths.
	 * @see http://stackoverflow.com/a/5827895/4241030
	 * @param {String} dir - The directory to explore
	 * @param {Number} [limit] - The maximum depth to explore
	 * @returns {Promise<string[]>} - A promise that resolves to an array of file paths and folder paths
	 */
	static async fileWalker(dir, limit = Infinity) {
		if (limit && limit <= 0) return []
		let results = []
		const list = await fs.promises.readdir(dir)
		let pending = list.length

		if (!pending) return results

		for (let file of list) {
			file = path.resolve(dir, file)
			const stat = await fs.promises.stat(file)
			// If directory, execute a recursive call
			if (stat && stat.isDirectory()) {
				const res = await Help.fileWalker(file, limit - 1)
				results = results.concat(res)
				if (!--pending) return results
			} else {
				results.push(file)
				if (!--pending) return results
			}
		}
	}
	/**Registers the help command with the universe.
	 * @param {Universe} universe - The universe instance to register the command with.
	 */
	static register(universe) {
		const help = new Help(universe)

		universe.registerCommand(["/help", "/cmdhelp"], (player, argument) => {
			help.callPlayer(player, argument)
		})
	}
}

export default Help
