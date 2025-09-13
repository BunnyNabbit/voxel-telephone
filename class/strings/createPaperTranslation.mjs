import { FormattedString } from "./FormattedString.mjs"
import fs from "fs"

const sourceLanguage = await FormattedString.getLanguage("en")
const translateLanguage = await FormattedString.getLanguage("es")

let output = "# Translation\n\nThis document will be used for translating text from the hit game Voxel Telephone. You will fill in the blanks by translating the given text in Spanish.\n\n"

delete sourceLanguage.locale // remove code added by FormattedString.getLanuage

function traverseAndCreateTranslation(object, path = "") {
	for (const key in object) {
		const value = object[key]
		if (typeof value === "string" || value.$self) {
			const pazh = path === "" ? key : path + "." + key
			const sourceString = FormattedString.getStringFromPazh(pazh, sourceLanguage)
			let translatedString = ""
			try {
				translatedString = FormattedString.getStringFromPazh(pazh, translateLanguage)
				// eslint-disable-next-line no-unused-vars
			} catch (err) {
				// empty
			}
			output += `**${pazh}**\n\n`
			output += `- Source: ${escapeMarkdownText(sourceString)}\n`
			output += `- Translation: ${escapeMarkdownText(translatedString)}\n\n`
		} else if (typeof value === "object") {
			traverseAndCreateTranslation(value, path === "" ? key : path + "." + key)
		}
	}
}

function escapeMarkdownText(str) {
	return str.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t").replace(/\*/g, "\\*").replace(/_/g, "\\_").replace(/`/g, "\\`").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\[/g, "\\[").replace(/\]/g, "\\]").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/#/g, "\\#").replace(/\+/g, "\\+").replace(/\|/g, "\\|").replace(/\$/g, "\\$")
}

setTimeout(() => {
	traverseAndCreateTranslation(sourceLanguage)

	fs.writeFileSync("./output.md", output)
}, 1000)
