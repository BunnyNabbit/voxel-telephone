const ViewLevel = require("./ViewLevel.cjs")
const templates = require("./templates.cjs")

class RealmManagerLevel extends ViewLevel {
	constructor(bounds, blocks, viewData = {}, cursor) {
		super(bounds, blocks, viewData, cursor)
	}

	async reloadView(template) {
		const lastBlockBuffer = Buffer.from(this.blocks)
		this.blocks = template(this.bounds)
		this.createBorders()
		const games = await this.universe.db.getRealmGrid(this.viewData.player, this.cursor)
		this.games = games
		if (games.length >= 9) {
			this.nextCursor = games[7][15]._id
		}

		for (let gameIndex = 0; gameIndex < 8; gameIndex++) {
			const game = games[gameIndex]
			await this.addIcon(templates.view.modeNull, 0, gameIndex)
			if (!game) continue
			let iconPosition = 1
			for (let turnIndex = 0; turnIndex < game.length; turnIndex++) {
				const buildTurn = game[turnIndex]
				if (buildTurn?.promptType) continue // it's a description
				const descriptionTurn = game[turnIndex - 1]
				if (descriptionTurn && !buildTurn) {
					// realm creation button
					await this.addIcon(templates.view.createRealm, iconPosition, gameIndex)
				} else { // it's a realm. for now, nozhing.

				}
				iconPosition++
			}
		}
		if (lastBlockBuffer.compare(this.blocks)) this.reload()
	}
	displaySelectedTurns(player) {
		if (player.selectedTurns.description) {
			let attribution = ""
			player.message(player.selectedTurns.description.prompt, 13)
			if (player.selectedTurns.build) {
				attribution += `By: ${player.selectedTurns.build.creators.join()}`
			} else { // it's a realm create button.
				attribution += "Double click icon to begin."
			}
			player.message(attribution, 12)
		} else {
			player.message(" ", [12, 13])
		}
	}
}

module.exports = RealmManagerLevel
