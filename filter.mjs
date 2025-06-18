import { join } from "path"
import fs from "fs/promises"
import { getAbsolutePath } from "esm-path"
const __dirname = getAbsolutePath(import.meta.url)

let filterWords = []
let blockedWords = new RegExp(filterWords.join("|"), "i")

fs.readFile(join(__dirname, "filterWords.json"), "utf-8")
	.then((data) => {
		filterWords = JSON.parse(data)
		blockedWords = new RegExp(filterWords.join("|"), "i")
	})
	.catch((err) => {
		filterWords = []
		console.warn("filterWords.json appears to be missing. Loading without any bad words.", err)
	})

export default function matches(str) {
	if (blockedWords.test(str)) return true
	return false
}
