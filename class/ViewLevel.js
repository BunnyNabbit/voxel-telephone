const Level = require("./Level.js")
const ChangeRecord = require("./ChangeRecord.js")
const templates = require("../templates.js")

class ViewLevel extends Level {
	constructor(bounds, blocks, moderationView, cursor) {
		super(bounds, blocks)
		this.cursor = cursor
		this.on("clientRemoved", async (client) => {
			if (!this.clients.length) {
				this.universe.levels.delete(this.name)
				await this.dispose()
			}
		})
		this.moderationView = moderationView
	}
	async reloadView(template) {
		const lastBlockBuffer = Buffer.from(this.blocks)
		const games = await this.universe.db.getGames()
		this.blocks = template(this.bounds)
		for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
			const game = games[gameIndex]
			let iconPosition = 1
			for (let turnIndex = 0; turnIndex < game.length; turnIndex++) {
				const turn = game[turnIndex]
				if (turn.promptType == "build") continue
				const addIcon = (template) => {
					let voxels = null
					if (Buffer.isBuffer(template)) {
						voxels = template
					} else {
						voxels = template([64, 64, 64])
					}
					const zBlockOffset = gameIndex * 64
					const xBlockOffset = iconPosition * 64
					let voxelIndex = 0
					for (let y = 0; y < 64; y++) {
						for (let z = 0; z < 64; z++) {
							for (let x = 0; x < 64; x++) {
								const voxel = voxels[voxelIndex]
								if (voxel) this.rawSetBlock([x + xBlockOffset, y, z + zBlockOffset], voxel)
								voxelIndex++
							}
						}
					}
					iconPosition++
				}
				const previewLevel = game.length == 16 || this.moderationView
				const isOnlyDescription = !game[turnIndex + 1]
				if (previewLevel && !isOnlyDescription) {
					// todo
					let previewLevel = new Level([64, 64, 64], templates.empty([64, 64, 64]))
					let changeRecordPromise = new Promise(resolve => {
						previewLevel.changeRecord = new ChangeRecord(`./blockRecords/game-${turn.next}/`, null, async () => {
							await previewLevel.changeRecord.restoreBlockChangesToLevel(previewLevel)
							previewLevel.dispose()
							resolve(previewLevel.blocks)
						})
					})
					addIcon(await changeRecordPromise)
				} else {
					// create an icon describing zhe turn's current state
					let loadedLevel = this.universe.levels.get(`game-${turn.next}`)
					if (loadedLevel) {
						loadedLevel = await loadedLevel
						if (loadedLevel.clients.length) {
							addIcon(templates.view.player)
						} else {
							addIcon(templates.view.orphaned)
						}
						continue
					}
					if (isOnlyDescription) {
						console.log(turn, turnIndex)
						addIcon(templates.view.description)
						continue
					}
					if (!isOnlyDescription) {
						addIcon(templates.view.built)
						continue
					}
					// other icons/todo
					// patrol: unreviewed turn if triage/moderation is online
					// report: turn reported by player
					// scyzhe: turn being reviewed by triage/moderation
				}
			}
		}
		if (lastBlockBuffer.compare(this.blocks)) this.reload()
	}
}

module.exports = ViewLevel