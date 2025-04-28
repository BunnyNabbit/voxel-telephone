const { exec } = require('node:child_process')
const Database = require("../class/Database.js")
const fs = require('fs')
const path = require('path')
const exportVox = require("../exportVox.js")
const Level = require("../class/level/Level.js")
const ChangeRecord = require("../class/level/changeRecord/ChangeRecord.js")
const templates = require("../class/level/templates.js")
const defaultBlockset = require("../6-8-5-rgb.json")
const { Jimp } = require("jimp")
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
class SpotvoxRenderer {
	constructor(serverConfiguration, db) {
		this.serverConfiguration = serverConfiguration
		this.db = db ?? new Database(serverConfiguration)
	}
	/**Renders a .vox file using Spotvox and returns the WEBP data.
	 * @param {string} file - The path to the .vox file.
	 * @returns {Promise<Buffer>} - A promise that resolves with the WEBP data.
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
				const webpFileName = path.join(__dirname, folderName, 'size8blocky', `${folderName}_angle0.webp`)

				// Convert PNG to WEBP using ImageMagick
				const convertCommand = `convert ${pngFileName} -quality 80 ${webpFileName}`
				exec(convertCommand, (convertError) => {
					if (convertError) {
						console.error(`Error converting PNG to WEBP: ${convertError}`)
						console.warn("Falling back to PNG format.")
						SpotvoxRenderer.readFile(pngFileName)
							.then((pngData) => {
								resolve({
									data: pngData,
									format: "png",
								})
								return SpotvoxRenderer.removeName(folderName)
							})
							.catch(reject)
					} else {
						SpotvoxRenderer.readFile(webpFileName)
							.then((webpData) => {
								resolve({
									data: webpData,
									format: "webp",
								})
								return SpotvoxRenderer.removeName(folderName)
							})
							.catch(reject)
					}
				})
			})
		})
	}

	exportVox(changeRecordPath, outputPath) {
		return new Promise((resolve) => {
			let exportLevel = new Level([64, 64, 64], templates.empty([64, 64, 64]))
			exportLevel.blockset = defaultBlockset
			exportLevel.changeRecord = new ChangeRecord(changeRecordPath, async () => {
				await exportLevel.changeRecord.restoreBlockChangesToLevel(exportLevel)
				exportVox(exportLevel, outputPath).then(() => {
					exportLevel.dispose()
					resolve()
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
				await this.exportVox(path.join(SpotvoxRenderer.blockRecordsPath, `game-${id}`), outputPath)
				const renderData = await this.renderVox(outputPath)
				const trimmedImage = await SpotvoxRenderer.trimImage(renderData.data)
				await this.db.addSpotvoxRender(id, {
					...renderData,
					data: trimmedImage,
				})
				SpotvoxRenderer.removeName(`${id}.vox`)
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

	static readPngFile(fileName) {
		return new Promise((resolve, reject) => {
			fs.readFile(fileName, (error, pngData) => {
				if (error) {
					console.error(`Error reading file: ${error}`)
					return reject(error)
				}
				resolve(pngData)
			})
		})
	}

	static readFile(fileName) {
		return new Promise((resolve, reject) => {
			fs.readFile(fileName, (error, data) => {
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
}

const serverConfiguration = require('../config.json')
const renderer = new SpotvoxRenderer(serverConfiguration);
(async function main() {
	while (true) {
		await renderer.doJobs()
		await new Promise(resolve => setTimeout(resolve, 5000))
	}
})()

// renderer.renderVox("./Copter.vox").then((output) => {
// 	console.log(`${output.format} data length: ${output.data.length}`)
// })

module.exports = SpotvoxRenderer