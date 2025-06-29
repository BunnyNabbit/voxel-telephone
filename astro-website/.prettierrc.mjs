/** @type {import("prettier").Config} */
export default {
	plugins: ["prettier-plugin-astro", "prettier-plugin-drone-class"],
	overrides: [
		{
			files: "*.astro",
			options: {
				parser: "astro",
				astroAllowShorthand: true,
			},
		},
	],
	semi: false,
	printWidth: Infinity,
	trailingComma: "es5",
	useTabs: true,
	endOfLine: "auto",
}
