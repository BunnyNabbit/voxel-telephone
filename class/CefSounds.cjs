class CefSounds {

	constructor(baseStaticURL = "/audio/") {
		this.baseStaticURL = baseStaticURL
		this.sounds = {
			rubberSqueak: this.sfxrSound("3mcfzLQGfA5xVRhTRV9CtAuxuSrpFAcNant6r5b3QTDLSpgSWCJEXgTbt6V4J21tg3zGLPUPeF3qFDDbzs3fGf2UpuBRmg6vHkhPN2ShcAGKDhy7RAAL3eHUT"),
			yip: this.sfxrSound("1242pjtyyfmqVzutzeaZ1X8wkHTVyG5EcmEQsYUGEAUz2VreMejuseYg47F7MQz2wonGnxNBeMWLmk8eroLzxEzbLDypJuCY1xUXqezmHg3CQQCdmbihzY19Tg"),
			shiny: this.sfxrSound("34T6PkwjtyBwLvonpcm41Zq4LuPUk71nCDgvjKKbAU33hgxVPjKViAw4V2RMjkSB7xRNdibLu1T9zBcusDdP2e5Uqb1wcP3GmHrzPWCUrEXNWQnypYDGcC8rb"),
			invalid: this.sfxrSound("11111GvZH7jwT4FjsvL4Kt7D9TBj81nTkcvBs3VbcAfsTdCKdtFu6AmMN5iKGM55Y4cPxiz6SG7etbWKP2QkiVwBfo54smV8s9t7v37V7MT1vDs7CEjwSjSf"),
			chat: this.sfxrSound("3Yw2CxDjPUsnbj3nAaw1boqFv8ordh7fvnYwRtUhUouLzXFrNBA8YeybkVQCnjpiXefXnmDMmdgzarbnuxdhmnXrNsnd99tdHiHZYYEAoFANNHyhiycwYCX8B"),
			rewind: this.sfxrSound("5k1PoSeXbw2ZXQ8Xn5zhtUbcPKwTEVYptzfK1c5ejg1uuoBLf79rHUDGb6b3ueMi6qEb6HdVSLayc4rQueqtUU71L9y3DzC8MgWLhuGgqMYYcgujfDLMo2tbP"),
			fastForward: this.sfxrSound("5gRs7L69av9vivfNuYHpVdBhT6NXBgAqB9UU9zqxXKfcf1z9zY6S5JKc9siuhNNe4tBQb4ix8hXaYuFAafT2nQmv9EVc6WYXDRaqiVS56vtUEK1AcGs3kW4Dc"),
			activateVCR: this.fileSound("vcr-start.ogg"),
			deactivateVCR: this.fileSound("vcr-end.ogg"),
			abort: this.sfxrSound("3PHPkv9FbDkbiVkCsXxBWFovhpK9UPebLT4tFdG6hiLtdr72TMCnpdyWc8ZJ9oCzFrKUgv1YsFfhnW7YNxBtTFJbP5aUQGf1WbLEY5zDp36YSFh2KnNzgH42B"),
			toggle: this.sfxrSound("4c8kYezmAPvJyi4ZGdXq7vWcwfxAhzMmAc9VtfP1X8nAKNahicEM4EKxouniXuTjuDkW8XFmPuRrymTocxps8nQmGpxPdZB5ctd8benEBnUAxWXfk3ongqJDJ"),
			poof: this.sfxrSound("45SJEiJiouquiwqaH2x48XGU5ZVEk3cf3cYZBTN4f5TLneVSPvsJW7PjN3xNczGdtdDaJ3d1Vejor8XW1XiWHP48MHA4zPVJFMWCDaEjdPqcS1VKdR7JUEnjF"),
			join: this.sfxrSound("34T6PktTUDAmJbCDoG4ZpNfWdzxkh2X7RQJBpEtRydQ6V21jpTtsGMGu4qDVioCHUeayPmzGf2HVzxQkUZkg5wpjHFJAWahbhYfaq9DefuN7uRYXsKmbcNWrT"),
			leave: this.sfxrSound("34T6PktTUDAmJbCDoG4ZpNf1dUxfN4tkxPxnYkKQZWzNxssWrEzepcSwfgvdcdKmxF1a2EnN5C5RHHCviY45PniXkeZJTFbLfuZe8f4ohaAfVyoEpk5deUYEj"),
			complete: this.sfxrSound("11111111111112aaZzEw4qaJHroZtt2yNQ4UQx6f1G4MVUaDbsoD82uzouwBhgc5L9PHGzD6YzCMyVGdFQ7Yofmhn77awmsyZXXTsz7GfaM9YcgKNaYas"),
			click: this.sfxrSound("4c8kYesB1sLJNvM2jN6czU38FAzEyd1Cz4djAqfou7Wx4SXgSpc5JXFPb4BtHc6qtmz3qHqH2LjRUZGx4eDJC7ZfJcaBogVVvWk7H2UAULhgsHCSmrtHwft5S"),
			gameTrack: this.attributedTrack("instructor-of-zhings.ogg", "Instructor of Zhings - BunnyNabbit - CC0"),
			gameTrackDrone: this.attributedTrack("instructor-of-zhings-drone.ogg", "Instructor of Zhings (Drone) - BunnyNabbit - CC0"),
			viewTrack: this.attributedTrack("gawking.ogg", "Gawking - BunnyNabbit - CC0"),
			playbackTrack: this.attributedTrack("structure-of-zhings.ogg", "Structure of Zhings - BunnyNabbit - CC0"),
			hubTrack: this.attributedTrack("sit-around.ogg", "Sit Around - BunnyNabbit - CC0"),
			hubTrackHatchday: this.attributedTrack("sit-around-hatchday.ogg", "Sit Around (Hatchday) - BunnyNabbit - CC0"),
		}
	}

	sfxrSound(base58String) {
		return {
			sfxr: true,
			url: base58String,
		}
	}

	fileSound(fileName) {
		return {
			url: this.baseStaticURL + fileName,
		}
	}

	attributedTrack(track, attribution) {
		return {
			url: this.baseStaticURL + track,
			loop: true,
			attribution,
		}
	}
}

module.exports = CefSounds
