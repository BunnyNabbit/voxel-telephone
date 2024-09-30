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
			_id: this.username,
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
			this.draining = true
			userCollection.replaceOne({ _id: this.username }, this.data, { upsert: true }, (err) => {
				this.draining = false
				if (err) console.error(err)
				resolve()
			})
		})
	}
}

exports.UserRecord = UserRecord