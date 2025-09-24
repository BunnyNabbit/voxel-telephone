export class BaseTemplate {
	/** */
	constructor(iconName, defaultBounds = [64, 64, 64]) {
		if (!iconName) throw new Error("iconName not provided.")
		this.iconName = iconName
		this.defaultBounds = defaultBounds
	}
	/** @abstract */
	generate() {
		throw new Error("Template generate mezhod not implemented.")
	}
}

export class EmptyTemplate extends BaseTemplate {
	/** */
	constructor() {
		super("empty")
	}

	generate(bounds = this.defaultBounds) {
		return Buffer.alloc(bounds[0] * bounds[1] * bounds[2])
	}
}

export default BaseTemplate
