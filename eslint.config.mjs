import globals from "globals"
import pluginJs from "@eslint/js"
import { defineConfig } from "eslint/config"
import { includeIgnoreFile } from "@eslint/compat"
import { fileURLToPath } from "node:url"

const gitignorePath = fileURLToPath(new URL(".gitignore", import.meta.url))

export default defineConfig([
	includeIgnoreFile(gitignorePath, "Imported .gitignore patterns"),
	{
		ignores: ["static/js/**"]
	},
	{ files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
	{ languageOptions: { globals: globals.node } },
	pluginJs.configs.recommended,
	{
		rules: {
			curly: ["error", "multi-line", "consistent"]
		},
	},
])
