class BaseElement {
	constructor() {
		this.type = "base"
		this.content = []
	}
	addElement(element) {
		if (element instanceof BaseElement) {
			this.content.push(element)
		} else {
			throw new Error("Invalid element type")
		}
	}
}

class Paragraph extends BaseElement {
	constructor() {
		super()
		this.type = "paragraph"
	}
}

class Heading extends BaseElement {
	constructor(level) {
		super()
		this.type = "heading"
		this.level = level
	}
}

class Text extends BaseElement {
	constructor(text = "") {
		super()
		this.type = "text"
		this.content = text
	}
}

class InlineCode extends BaseElement {
	constructor() {
		super()
		this.type = "inlineCode"
	}
}

/** Basic Markdown parser namespace */
class DragonMark {
	/**Parses the given text and returns a structure array.
	 * @param {string} text - The text to parse.
	 * @returns {Array} - The parsed structure array.
	 */
	static parse(text) {
		text = DragonMark.normalizeLineEndings(text)
		const structure = []
		const sections = text.split("---")
		if (sections.length < 3) {
			throw new Error("Input text does not contain the expected structure with '---'")
		}
		const lines = sections[2].split("\n")
		lines.forEach((line) => {
			line = line.trim()
			if (line.startsWith("#")) {
				const level = line.match(/^#+/)[0].length
				const heading = new Heading(level)
				const headingText = line.slice(level).trim()
				if (headingText) {
					heading.addElement(new Text(headingText))
				}
				structure.push(heading)
			} else if (line) {
				const paragraph = new Paragraph()
				let currentText = new Text()
				for (let i = 0; i < line.length; i++) {
					const char = line[i]
					if (char === "`") {
						if (currentText.content) {
							paragraph.addElement(currentText)
							currentText = new Text()
						}
						const codeBlock = new InlineCode()
						while (line[++i] !== "`" && i < line.length) {
							codeBlock.content += line[i]
						}
						paragraph.addElement(codeBlock)
					} else {
						currentText.content += char
					}
				}
				if (currentText.content) {
					paragraph.addElement(currentText)
				}
				structure.push(paragraph)
			}
		})
		return structure
	}
	/**Normalizes given text line endings to Unix-style (`\n`)
	 * @param {string} text - The text to normalize.
	 * @returns {string} - The normalized text.
	 */
	static normalizeLineEndings(text) {
		return text.replace(/\r\n/g, "\n")
	}
	/**Converts the given parsed structure to Minecraft classic text format.
	 * @param {Array} structure - The structure to convert.
	 * @param {string} defaultColorCode - The default color code to use.
	 * @returns {string} - The converted text.
	 */
	static convertStructureToClassicText(structure, defaultColorCode = "&f") {
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
					}
				})
				output.push(paragraph)
			}
		})
		return output
	}
}

module.exports = DragonMark