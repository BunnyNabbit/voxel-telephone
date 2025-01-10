class UserRecord {
	constructor(player, data) {
		this.player = player
		this.username = player.authInfo.username
		this.draining = false
		this.new = false
		this.data = data
		player.client.on("close", () => {
			this.save()
		})
	}
	static getDefaultRecord(username) {
		return {
			_id: username,
			dataVersion: 1,
			permissions: {
				mature: false,
				listOperator: false,
				moderator: false,
				hubBuilder: false,
				triage: false,
			},
			lastJoin: new Date(),
			firstJoin: new Date()
		}
	}
	async save() {
		await this.data
		await this.player.client.server.universe.db.saveUserRecord(this)
		this.draining = true
	}
}

module.exports = UserRecord