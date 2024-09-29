class NullChangeRecord {
	constructor(path, root = defaultRootDvd, loadedCallback = noop) {
		this.currentBuffer = null
		this.path = path
		this.draining = false
		this.dirty = false
		this.vhsFh = null
		this.dvdFh = null
		this.bounds = [64, 64, 64]
		this.actionCount = 0
		this.currentActionCount = 0
		setTimeout(() => {
			loadedCallback(this)
		}, 0);
	}
	addBlockChange(position, block) {
		this.appendAction(false, position.concat(block))
	}
	appendAction(isCommand = false, actionBytes, commandString) {
	}
	async restoreBlockChangesToLevel(level, maxActions) {
      return 0
	}
	async flushChanges() {
		return 0
	}
	async commit(toActionCount) {
		return 0
	}
	async dispose() {
	}
}

module.exports = NullChangeRecord