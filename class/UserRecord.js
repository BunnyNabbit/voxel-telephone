class UserRecord {
	constructor(client, data) {
		this.client = client
		this.username = client.authInfo.username
		this.draining = false
		this.new = false
		this.data = data
		client.on("close", () => {
			this.save();
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
	save() {
		return new Promise(async (resolve) => {
			await this.data
			await this.client.server.universe.db.saveUserRecord(this)
			this.draining = true
			resolve()
		})
	}
}

module.exports = UserRecord