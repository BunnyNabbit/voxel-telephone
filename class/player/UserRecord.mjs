export class UserRecord {

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
			dataVersion: 2,
			permissions: {
				mature: false,
				listOperator: false,
				moderator: false,
				hubBuilder: false,
				triage: false,
			},
			configuration: {
				cefMusic: true,
				cefSounds: true
			},
			lastJoin: new Date(),
			firstJoin: new Date()
		}
	}

	static updateData(data) {
		if (data.dataVersion == 1) {
			// adds configuration
			data.configuration = {
				cefMusic: true,
				cefSounds: true
			}
			data.dataVersion = 2
		}
	}

	async get() {
		const data = await this.data
		// update it if it is outdated
		UserRecord.updateData(data)
		return data
	}

	async save() {
		UserRecord.orphans.add(this.player.username)
		await this.data
		await this.player.client.server.universe.db.saveUserRecord(this)
		this.draining = true
		UserRecord.orphans.delete(this.player.username)
	}
	static orphans = new Set()
}
