import en from "./languages/en.json" with { type: "json" }
import fs from "node:fs"
const outputFile = "./stringSkeleton.json"

const stringSkeleton = {}

function traverse(languageElement, currentPath = "", currentSkeletonElement = stringSkeleton) {
	for (const key in languageElement) {
		if (key == "$self") continue
		const value = languageElement[key]
		let newPath
		if (!currentPath) {
			newPath = key
		} else {
			newPath = `${currentPath}.${key}`
		}
		currentSkeletonElement[key] = {}
		if (typeof value !== "string") {
			if (value.$self) currentSkeletonElement[key].$self = newPath
			traverse(value, newPath, currentSkeletonElement[key])
		} else {
			currentSkeletonElement[key] = newPath
		}
	}
}

traverse(en)

fs.writeFileSync(outputFile, JSON.stringify(stringSkeleton, null, 1) + "\n", "utf8")
