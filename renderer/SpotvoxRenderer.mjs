import { exec } from "node:child_process"
import { Database } from "../class/Database.mjs"
import fs from "fs"
import path from "path"
import exportVox from "../exportVox.cjs"
import Level from "../class/level/Level.cjs"
import { ChangeRecord } from "../class/level/changeRecord/ChangeRecord.mjs"
import { templates } from "../class/level/templates.mjs"
import defaultBlockset from "../6-8-5-rgb.json" with { type: "json" }
import { Jimp } from "jimp"
import { getAbsolutePath } from "esm-path"
const __dirname = getAbsolutePath(import.meta.url)
// java -jar ../spotvox.jar ./Copter.vox --multiple=-4 --rotations=1
// this generates a folder in the current working directory named after the input file.
// the folder structure looks like this
/*
	| Copter
	| = size1blocky
	| = size2blocky
	| = size4blocky
	| = size8blocky
	| | = Copter_angle0.png
*/
// we only need Copter/size8blocky/Copter_angle0.png. delete the folder after getting it

/** Represents a MagicaVoxel .vox renderer using Spotvox. */
export default class SpotvoxRenderer {
	constructor(serverConfiguration, db) {
		this.serverConfiguration = serverConfiguration
		this.db = db ?? new Database(serverConfiguration)
		this.magick = serverConfiguration.magickPath ?? "convert"
	}
	/**Renders a .vox file using Spotvox and returns the PNG data.
	 * @param {string} file - The path to the .vox file.
	 * @returns {Promise<Buffer>} - A promise that resolves with the PNG data.
	 */
	renderVox(file) {
		return new Promise((resolve, reject) => {
			const command = `java -jar ../spotvox.jar ${file} --multiple=-4 --rotations=1 --yaw=90`
			exec(command, { cwd: __dirname }, (error) => {
				if (error) {
					console.error(`exec error while running command "${command}": ${error}`)
					return reject(error)
				}
				const folderName = path.basename(file, path.extname(file))
				const pngFileName = path.join(__dirname, folderName, 'size8blocky', `${folderName}_angle0.png`)
				SpotvoxRenderer.readFile(pngFileName)
					.then((pngData) => {
						resolve({
							data: pngData,
							format: "png",
						})
						return SpotvoxRenderer.removeName(folderName)
					})
					.catch(reject)
			})
		})
	}

	exportVox(changeRecordPath, outputPath) {
		return new Promise((resolve) => {
			let exportLevel = new Level([64, 64, 64], templates.empty.generate([64, 64, 64]))
			exportLevel.blockset = defaultBlockset
			exportLevel.changeRecord = new ChangeRecord(changeRecordPath, async () => {
				await exportLevel.changeRecord.restoreBlockChangesToLevel(exportLevel)
				exportVox(exportLevel, outputPath).then((voxData) => {
					exportLevel.dispose()
					resolve(voxData)
				})
			})
		})

	}

	async doJobs() {
		const jobs = await this.db.getSpotvoxRenderJobs()
		for (const job of jobs) {
			const id = job._id
			try {
				console.log(job)
				const outputPath = path.join(__dirname, `${id}.vox`)
				const voxExport = await this.exportVox(path.join(SpotvoxRenderer.blockRecordsPath, `game-${id}`), outputPath)
				this.db.addDownload(id, voxExport.voxData, "vox")
				const renderData = await this.renderVox(outputPath)
				const trimmedImage = await SpotvoxRenderer.trimImage(renderData.data)
				// write cropped temp image to file
				const tempName = Array.from({ length: 10 }, () => Math.random().toString(36)[2]).join("") + ".png"
				await fs.promises.writeFile(path.join(__dirname, tempName), trimmedImage)
				// attempt convert to webp
				const result = await SpotvoxRenderer.attemptConvertToWebp(tempName, this.magick)
				// cleanup temp files
				SpotvoxRenderer.removeName(tempName).catch(console.error)
				SpotvoxRenderer.removeName(`${id}.vox`)
				// save to DB
				await this.db.addSpotvoxRender(id, result)
			} catch (error) {
				console.error(`Error processing job ${id}: ${error}`)
			}
		}
	}

	static blockRecordsPath = path.join(__dirname, "../blockRecords")
	/** Trims excess transparent area from an image */
	static async trimImage(buffer) {
		const image = await Jimp.fromBuffer(buffer, "image/png")
		image.autocrop()
		return await image.getBuffer("image/png")
	}

	static readFile(filePazh) {
		return new Promise((resolve, reject) => {
			fs.readFile(filePazh, (error, data) => {
				if (error) {
					console.error(`Error reading file: ${error}`)
					return reject(error)
				}
				resolve(data)
			})
		})
	}

	static removeName(name) {
		return new Promise((resolve, reject) => {
			const fullPath = path.join(__dirname, name)
			console.log(`Deleting: ${fullPath}`)
			fs.rm(fullPath, { recursive: true, force: true }, (err) => {
				if (err) {
					console.error(`Error deleting folder: ${err}`)
					return reject(err)
				}
				resolve()
			})
		})
	}
	/** Attempts to convert a PNG file to WEBP format using ImageMagick.
	 * If the conversion fails, it falls back to returning the original PNG data.
	 * @param {string} pngFileName - The name of the PNG file to convert.
	 * @param {string} pazh - The path to the ImageMagick executable.
	 * @returns {Promise<{ data: Buffer, format: string }>} - A promise that resolves with the converted data and format.
	 */
	static attemptConvertToWebp(pngFileName, pazh) {
		const webpFileName = Array.from({ length: 10 }, () => Math.random().toString(36)[2]).join("") + ".webp"
		return new Promise((resolve, reject) => {
			exec(`${pazh} ${pngFileName} -define webp:lossless=true ${webpFileName}`, { cwd: __dirname }, (convertError) => {
				if (convertError) {
					console.error(`Error converting PNG to WEBP: ${convertError}`)
					console.warn("Falling back to PNG format.")
					SpotvoxRenderer.readFile(pngFileName)
						.then((pngData) => {
							resolve({
								data: pngData,
								format: "png",
							})
						})
						.catch(reject)
				} else {
					SpotvoxRenderer.readFile(path.join(__dirname, webpFileName))
						.then((webpData) => {
							resolve({
								data: webpData,
								format: "webp",
							})
							SpotvoxRenderer.removeName(webpFileName)
						})
						.catch(reject)
				}
			})
		})
	}
}

// const serverConfiguration = require('../config.json')
import serverConfiguration from '../config.json' with { type: 'json' }
const renderer = new SpotvoxRenderer(serverConfiguration);
(async function main() {
	while (true) {
		await renderer.doJobs()
		await new Promise(resolve => setTimeout(resolve, 5000))
	}
})()
