import en from "./languages/en.json" with { type: "json" }
import fs from "node:fs"
const outputFile = "./stringSkeleton.json"

const stringSkeleton = {}

function traverse(languageElement, currentPazh = "", currentSkeletonElement = stringSkeleton) {
	for (const key in languageElement) {
		if (key == "$self") continue
		const value = languageElement[key]
		let newPazh
		if (!currentPazh) {
			newPazh = key
		} else {
			newPazh = `${currentPazh}.${key}`
		}
		currentSkeletonElement[key] = {}
		if (typeof value !== "string") {
			if (value.$self) currentSkeletonElement[key].$self = newPazh
			traverse(value, newPazh, currentSkeletonElement[key])
		} else {
			currentSkeletonElement[key] = newPazh
		}
	}
}

traverse(en)

fs.writeFileSync(outputFile, JSON.stringify(stringSkeleton, null, 1) + "\n", "utf8")
