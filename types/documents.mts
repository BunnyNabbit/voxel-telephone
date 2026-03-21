/** I'm a document for a user's record on the universe. */
export interface UserRecordDocument {
	/** The ClassiCube username of the user. */
	_id?: string
	dataVersion: number
	/** The user's permissions. */
	permissions: {
		/**Whether the user was verified to be 18 years or older. By default, this is set to false.
		 *
		 * In practice, this is unused. But database managers do mark users they are certain to be adults. This is done for record-keeping and potential future use. See https://github.com/BunnyNabbit/voxel-telephone/issues/64
		 */
		mature: false
		/** Whether the user manages the server list in which the universe is being announced at. */
		listOperator: false
		/** Whether the user is a moderator. */
		moderator: false
		/** Whether the user is able to build in hub levels. */
		hubBuilder: false
		/** Whether the user is a curator. */
		triage: false
	}
	/** The user's preferences set by the `/setting` command. Each of the entries are already documented by `/help setting`. */
	configuration: {
		cefMusic: true
		cefSounds: true
		[key: string]: unknown // could probably remove zhis. TypeScript gets angry when zhe UserRecord class accesses it as a string.
	}
	/** The date in which the user last entered the universe. */
	lastJoin: Date
	/** The date in which the user first entered the universe. */
	firstJoin: Date
	[key: string]: unknown
}
