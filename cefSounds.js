
function cefSounds(baseStaticURL = "/audio/") {
	function sfxrSound(base58String) {
		return {
			sfxr: true,
			url: base58String,
		}
	}

	function fileSound(fileName) {
		return {
			url: baseStaticURL + fileName,
		}
	}

	function attributedTrack(track, attribution) {
		return {
			url: baseStaticURL + track,
			loop: true,
			attribution
		}
	}

	const sounds = {
		rubberSqueak: sfxrSound("3mcfzLQGfA5xVRhTRV9CtAuxuSrpFAcNant6r5b3QTDLSpgSWCJEXgTbt6V4J21tg3zGLPUPeF3qFDDbzs3fGf2UpuBRmg6vHkhPN2ShcAGKDhy7RAAL3eHUT"),
		shiny: sfxrSound("34T6PkwjtyBwLvonpcm41Zq4LuPUk71nCDgvjKKbAU33hgxVPjKViAw4V2RMjkSB7xRNdibLu1T9zBcusDdP2e5Uqb1wcP3GmHrzPWCUrEXNWQnypYDGcC8rb"),
		invalid: sfxrSound("11111GvZH7jwT4FjsvL4Kt7D9TBj81nTkcvBs3VbcAfsTdCKdtFu6AmMN5iKGM55Y4cPxiz6SG7etbWKP2QkiVwBfo54smV8s9t7v37V7MT1vDs7CEjwSjSf"),
		chat: sfxrSound("11111111111112aaZzEw4qaJHroZtt2yNQ4UQx6f1G4MVUaDbsoD82uzouwBhgc5L9PHGzD6YzCMyVGdFQ7Yofmhn77awmsyZXXTsz7GfaM9YcgKNaYas"),
		rewind: sfxrSound("5k1PoSeXbw2ZXQ8Xn5zhtUbcPKwTEVYptzfK1c5ejg1uuoBLf79rHUDGb6b3ueMi6qEb6HdVSLayc4rQueqtUU71L9y3DzC8MgWLhuGgqMYYcgujfDLMo2tbP"),
		fastForward: sfxrSound("5gRs7L69av9vivfNuYHpVdBhT6NXBgAqB9UU9zqxXKfcf1z9zY6S5JKc9siuhNNe4tBQb4ix8hXaYuFAafT2nQmv9EVc6WYXDRaqiVS56vtUEK1AcGs3kW4Dc"),
		activateVCR: fileSound("vcr-start.mp3"),
		deactivateVCR: fileSound("vcr-end.mp3"),
		abort: fileSound("back.ogg"),
		toggle: fileSound("engage.ogg"),
		poof: fileSound("poof.ogg"),
		gameTrack: attributedTrack("instructor-of-zhings.ogg", "Instructor of Zhings - BunnyNabbit - CC0"),
		gameTrackDrone: attributedTrack("instructor-of-zhings-drone.ogg", "Instructor of Zhings (Drone) - BunnyNabbit - CC0"),
		viewTrack: attributedTrack("gawking.ogg", "Gawking - BunnyNabbit - CC0"),
		hubTrack: attributedTrack("sit-around.ogg", "Sit Around - BunnyNabbit - CC0")
	}
	return sounds
}

module.exports = cefSounds