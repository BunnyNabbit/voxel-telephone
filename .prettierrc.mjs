/** @type {import("prettier").Config} */
export default {
	semi: false,
	plugins: ["prettier-plugin-drone-class", "prettier-plugin-drone-jsdoc"],
	tsdoc: true,
	jsdocTagsOrder: '{"todo":0}',
	jsdocEmptyCommentStrategy: "keep",
	printWidth: Infinity,
	trailingComma: "es5",
	useTabs: true,
	endOfLine: "auto",
}
