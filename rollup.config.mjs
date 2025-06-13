import json from '@rollup/plugin-json'
import commonjs from '@rollup/plugin-commonjs'

export default {
	input: 'voxelTelephone.mjs',
	output: {
		dir: 'output',
		format: 'es',
	},
	plugins: [
		json(),
		commonjs(),
	],
}
