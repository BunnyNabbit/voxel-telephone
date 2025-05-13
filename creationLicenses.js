class License {
	constructor(name = "Null License", revocable = false, licenseData = {}) {
		this.name = name
		this.revocable = revocable
		this.licenseData = licenseData
	}
	serialize() {
		return {
			name: this.name,
			revocable: this.revocable,
			licenseData: this.licenseData
		}
	}
}

class CreativeCommonsLicense extends License {
	constructor(name, shortName, licenseData) {
		super(name, false, licenseData)
		this.shortName = shortName
	}
}

class OpenGameArtLicense extends License {
	constructor(name, shortName, licenseData) {
		super(name, false, licenseData)
		this.shortName = shortName
	}
}

module.exports = {
	"CC0": new CreativeCommonsLicense("CC0 1.0 Universal", "CC0 1.0", {
		url: "https://creativecommons.org/publicdomain/zero/1.0/",
		publicDomain: true
	}),
	"CC BY": new CreativeCommonsLicense("Attribution 4.0 International", "CC BY 4.0", {
		url: "https://creativecommons.org/licenses/by/4.0/",
		attribution: true,
	}),
	"CC BY-SA": new CreativeCommonsLicense("Attribution-ShareAlike 4.0 International", "CC BY-SA 4.0", {
		url: "https://creativecommons.org/licenses/by-sa/4.0/",
		attribution: true,
		shareAlike: true
	}),
	"OGA BY": new OpenGameArtLicense("OpenGameArt.org Attribution 4.0", "OGA BY 4.0", {
		url: "https://opengameart.org/sites/default/files/archive/oga-by-40.txt",
		attribution: true,
	})
}