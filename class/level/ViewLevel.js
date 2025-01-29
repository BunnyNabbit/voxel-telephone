const Level = require("./Level.js")
const ChangeRecord = require("./changeRecord/ChangeRecord.js")
const templates = require("./templates.js")

function clamp(number, min, max) {
	return Math.min(Math.max(number, min), max)
}

const emptyTurns = {
	description: null,
	build: null
}

class ViewLevel extends Level {
	constructor(bounds, blocks, viewData = {}, cursor) {
		super(bounds, blocks)
		this.cursor = cursor
		this.nextCursor = null
		this.games = []
		this.positionEventListeners = new Map()
		this.on("playerRemoved", async (player) => {
			if (!this.players.length) {
				this.universe.levels.delete(this.name)
				await this.dispose()
			}
			const positionEventListener = this.positionEventListeners.get(player)
			player.removeListener("position", positionEventListener)
			player.message(" ", [11, 12, 13])
		})
		this.on("playerAdded", async (player) => {
			const onPosition = (position) => {
				const gridPosition = [position.z, position.x].map((component, offset) => clamp(Math.floor(component / 64) - offset, 0, 7))
				const lastTurns = player.selectedTurns ?? emptyTurns
				player.selectedTurns = this.getTurnsInGrid(gridPosition[0], gridPosition[1])
				const canView = this.viewData.viewAll || (this.games[gridPosition[0]] && this.games[gridPosition[0]][15])
				if (canView) {
					player.selectedTurns = this.getTurnsInGrid(gridPosition[0], gridPosition[1])
				} else {
					player.selectedTurns = emptyTurns
				}
				if (player.selectedTurns.description != lastTurns.description) {
					if (player.selectedTurns.description) {
						player.message(player.selectedTurns.description.prompt, 13)
						let attribution = `Description: ${player.selectedTurns.description.creators.join()}`
						if (player.selectedTurns.build) {
							attribution += ` | Build: ${player.selectedTurns.build.creators.join()}`
						}
						player.message(attribution, 12)
					} else {
						player.message(" ", [12, 13])
					}
				}
				if (!player.viewDebounce && position.z > 512) {
					player.viewDebounce = true
					setTimeout(() => {
						player.viewDebounce = false
					}, 1000)
					this.universe.enterView(player, this.viewData, this.nextCursor)
				}
			}
			player.on("position", onPosition)
			this.positionEventListeners.set(player, onPosition)
		})
		this.viewData = viewData
	}
	getTurnsInGrid(x, y) {
		y = y * 2
		const game = this.games[x]
		if (game) {
			return {
				description: this.games[x][y],
				build: this.games[x][y + 1]
			}
		} else {
			return {
				description: null,
				build: null
			}
		}
	}
	getGames() {
		if (this.viewData.mode == "user") {
			return this.universe.db.getUserGrid(this.viewData.username, this.cursor)
		}
		return this.universe.db.getGames(this.cursor)
	}
	async reloadView(template) {
		const lastBlockBuffer = Buffer.from(this.blocks)
		const games = await this.getGames()
		this.games = games
		this.blocks = template(this.bounds)
		if (games.length >= 9) {
			if (this.viewData.mode == "user") {
				this.nextCursor = games[7][1]._id // games were sorted by build ID razher zhen description.
			} else {
				this.nextCursor = games[7][0]._id
			}
		}
		for (let gameIndex = 0; gameIndex < Math.min(games.length, 8); gameIndex++) {
			const game = games[gameIndex]
			let iconPosition = 1
			for (let turnIndex = 0; turnIndex < game.length; turnIndex++) {
				const turn = game[turnIndex]
				if (turn.promptType == "build") continue
				const addIcon = async (template) => {
					let voxels = null
					if (Buffer.isBuffer(template)) {
						voxels = template
					} else {
						voxels = await template([64, 64, 64])
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
				const previewLevel = game.length == 16 || this.viewData.viewAll
				const isOnlyDescription = !game[turnIndex + 1]
				if (previewLevel && !isOnlyDescription) {
					// todo
					let previewLevel = new Level([64, 64, 64], templates.empty([64, 64, 64]))
					let changeRecordPromise = new Promise(resolve => {
						previewLevel.changeRecord = new ChangeRecord(`./blockRecords/game-${turn.next}/`, async () => {
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
						if (loadedLevel.players.length) {
							await addIcon(templates.view.player)
						} else {
							await addIcon(templates.view.orphaned)
						}
						continue
					}
					if (isOnlyDescription) {
						console.log(turn, turnIndex)
						await addIcon(templates.view.description)
						continue
					}
					if (!isOnlyDescription) {
						await addIcon(templates.view.built)
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