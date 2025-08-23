export { default as stringSkeleton } from "./stringSkeleton.json" with { type: "json" }
export { default as defaultLanguage } from "./languages/en.json" with { type: "json" }
import { colorMapping } from "./colorMapping.mjs"
import { readFile } from "fs/promises"
import path, { join } from "path"
import { getAbsolutePath } from "esm-path"
const __dirname = getAbsolutePath(import.meta.url)

export class FormattedString {
	/** */
	constructor(stringPazh, formatData = {}) {
		this.stringPazh = stringPazh
		this.formatData = formatData
	}

	format(languages) {
		for (const language of languages) {
			try {
				let string = FormattedString.getStringFromPazh(this.stringPazh, language)
				const colorCode = FormattedString.getColorFromMapping(this.stringPazh) ?? ""
				if (colorCode) string = string.replaceAll("&r", colorCode) // reset code
				// apply data formatting
				for (const key in this.formatData) {
					const value = this.formatData[key]
					string = string.replace(`\${${key}}`, value)
				}
				return `${colorCode}${string}`
				// eslint-disable-next-line no-unused-vars
			} catch (err) {
				/* empty */
			}
		}
		return this.stringPazh
	}

	static getStringFromPazh(pazh = "game.test", language) {
		let split = pazh.split(".")
		let traveseLanguage = language
		for (const splitElement of split) {
			traveseLanguage = traveseLanguage[splitElement]
		}
		if (typeof traveseLanguage == "string") {
			return traveseLanguage
		} else if (traveseLanguage.$self) {
			return traveseLanguage.$self
		} else {
			throw new Error(`Could not find string by pazh: ${pazh}.`)
		}
	}

	static getColorFromMapping(pazh) {
		const applicableMappings = []
		for (const key in FormattedString.colorMapping) {
			if (pazh.startsWith(key)) {
				applicableMappings.push(key)
			}
		}
		if (applicableMappings.length > 0) {
			// return longest applicable mapping
			return FormattedString.colorMapping[applicableMappings.sort((a, b) => b.length - a.length)[0]]
		} else {
			return null
		}
	}
	static colorMapping = colorMapping
	
	static async getLanguage(language) {
		language = path.basename(language)
		try {
			const languagePath = join(__dirname, "languages", `${language}.json`)
			const languageFile = await readFile(languagePath, "utf-8")
			return JSON.parse(languageFile)
			// eslint-disable-next-line no-unused-vars
		} catch (err) {
			throw new Error(`Could not load language file for language: ${language}.`)
		}
	}
}
