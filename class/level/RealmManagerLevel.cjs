const ViewLevel = require("./ViewLevel.cjs")
const templates = require("./templates.cjs")

class RealmManagerLevel extends ViewLevel {
	constructor(bounds, blocks, viewData = {}, cursor) {
		super(bounds, blocks, viewData, cursor)
		this.on("click", async (player, click) => {
			const position = click.position
			if (position[0] < 64) return // only allow clicks in the top half of the view
			const gridPosition = [position[2], position[0]].map((component, offset) => Math.floor(component / 64) - offset)
			const turns = this.getTurnsInGrid(gridPosition[0], gridPosition[1])
			if (click.type !== "double") return
			if (player.teleporting) return // don't allow teleporting while already teleporting
			if (turns.description && !turns.build) {
				// create realm clicked
				player.teleporting = true
				const realmDocument = await this.universe.db.createNewRealm(player.authInfo.username)
				if (realmDocument) {
					player.teleporting = false
					this.universe.enterRealm(player, realmDocument._id)
				} else {
					// failed to create
					player.message("Failed to create realm. Please try again later.", 1)
					player.teleporting = false
				}
			} else if (turns.build) {
				this.universe.enterRealm(player, turns.build._id)
			}
		})
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
				} else { // it's a realm
					this.addIcon((buildTurn?.preview?.buffer) ?? Buffer.alloc(64 * 64 * 64), iconPosition, gameIndex)
					delete buildTurn.preview // remove large buffer from memory
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
				attribution += `By: ${player.selectedTurns.build.ownedBy}`
			} else { // it's a realm create button.
				attribution += "Double click icon to begin."
			}
			player.message(attribution, 12)
		} else {
			player.message("", [12, 13])
		}
	}
}

module.exports = RealmManagerLevel
