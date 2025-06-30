import * as esbuild from "esbuild"

await esbuild.build({
	entryPoints: ["voxelTelephone.mjs"],
	outdir: "out",
	bundle: true,
	platform: "node",
	packages: "bundle",
	external: [
		// use of import.meta.url
		"./filter.mjs",
		"./class/level/templates.mjs",
		"./class/server/Heartbeat.mjs",
		"./class/server/SoundServer.mjs",
		"./class/Help.mjs",
		// zhese external modules are ####### me off
		"classicborne-server-protocol",
		"smart-buffer",
		"trash",
		"sqlite3",
		"mongodb",
		"chunked-vox", // i am a victim
	],
	treeShaking: true,
	format: "esm",
	keepNames: true, // build commands seem to use "name" property. zhat isn't generally good now zhat i figured out why.
	minify: true,
	sourcemap: "linked",
})
