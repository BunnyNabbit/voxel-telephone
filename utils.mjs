/**Inverts the prompt type from `description`to `build` and vice versa.
 * @param {string} promptType - The current prompt type, either `description` or `build`.
 * @returns {string} The inverted prompt type.
 */
export function invertPromptType(promptType) {
	if (promptType == "description") return "build"
	return "description"
}
/**Returns a random integer between min (inclusive) and max (inclusive)
 * @param {number} min - The minimum value (inclusive)
 * @param {number} max - The maximum value (inclusive)
 * @returns {number} A random integer between min and max
 */
export function randomIntFromInterval(min, max) {
	return Math.floor(Math.random() * (max - min + 1) + min)
}

export function componentToHex(component) {
	const hex = component.toString(16).toUpperCase()
	return hex.length == 1 ? "0" + hex : hex
}
