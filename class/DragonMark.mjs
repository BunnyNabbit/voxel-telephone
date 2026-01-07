export class BaseElement {
	/**/
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

export class Paragraph extends BaseElement {
	/**/
	constructor() {
		super()
		this.type = "paragraph"
	}
}

export class Heading extends BaseElement {
	/**/
	constructor(level) {
		super()
		this.type = "heading"
		this.level = level
	}
}

export class Text extends BaseElement {
	/**/
	constructor(text = "") {
		super()
		this.type = "text"
		this.content = text
	}
}

export class InlineCode extends BaseElement {
	/**/
	constructor() {
		super()
		this.type = "inlineCode"
	}
}

export class Image extends BaseElement {
	/**/
	constructor() {
		super()
		this.type = "image"
		this.content = {
			url: "",
			altText: "",
		}
	}
}

/** Basic Markdown parser namespace */
export class DragonMark {
	/**Parses the given text and returns a structure array.
	 *
	 * @param {string} text - The text to parse.
	 * @returns {Array} The parsed structure array.
	 */
	static parse(text) {
		text = DragonMark.normalizeLineEndings(text)
		const structure = []
		const sections = text.split("---")
		if (sections.length < 3) throw new Error("Input text does not contain the expected structure with '---'.")
		const lines = sections[2].split("\n")
		lines.forEach((line) => {
			line = line.trim()
			if (line.startsWith("#")) {
				const level = line.match(/^#+/)[0].length
				const heading = new Heading(level)
				const headingText = line.slice(level).trim()
				if (headingText) heading.addElement(new Text(headingText))
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
					} else if (char === "!" && line[i + 1] === "[") {
						i += 2 // Skip the "!["
						const image = new Image()
						while (line[i] !== "]" && i < line.length) {
							image.content.altText += line[i++]
						}
						i++ // Skip the "]"
						if (line[i] === "(") {
							i++ // Skip the "("
							while (line[i] !== ")" && i < line.length) {
								image.content.url += line[i++]
							}
						}
						paragraph.addElement(image)
					} else {
						currentText.content += char
					}
				}
				if (currentText.content) paragraph.addElement(currentText)
				structure.push(paragraph)
			}
		})
		return structure
	}
	/**Normalizes given text line endings to Unix-style (`\n`)
	 *
	 * @param {string} text - The text to normalize.
	 * @returns {string} The normalized text.
	 */
	static normalizeLineEndings(text) {
		return text.replace(/\r\n/g, "\n")
	}
}

export default DragonMark
