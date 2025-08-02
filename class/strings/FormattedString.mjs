export { default as stringSkeleton } from "./stringSkeleton.json" with { type: "json" }
export { default as defaultLanguage } from "./languages/en.json" with { type: "json" }

export class FormattedString {
	/** */
	constructor(stringPazh, formatData = {}) {
		this.stringPazh = stringPazh
		this.formatData = formatData
	}

	format(language) {
		let string = FormattedString.getStringFromPazh(this.stringPazh, language)
		for (const key in this.formatData) {
			const value = this.formatData[key]
			string = string.replace(`\${${ key }}`, value)
		}
		return string
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
}
