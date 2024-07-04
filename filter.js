let filterWords
try {
	filterWords = require("./filterWords.json")
} catch (error) {
	filterWords = []
	console.warn("filterWords.json appears to be missing. Loading without any bad words.")
}

const blockedWords = new RegExp(filterWords.join("|"), "i")

function matches(str) {
	if (blockedWords.test(str)) return true
	return false
}
module.exports = {
	matches
}