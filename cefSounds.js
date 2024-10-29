
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
		activateVCR: fileSound("vcr-start.ogg"),
		deactivateVCR: fileSound("vcr-end.ogg"),
		abort: sfxrSound("3PHPkv9FbDkbiVkCsXxBWFovhpK9UPebLT4tFdG6hiLtdr72TMCnpdyWc8ZJ9oCzFrKUgv1YsFfhnW7YNxBtTFJbP5aUQGf1WbLEY5zDp36YSFh2KnNzgH42B"),
		toggle: sfxrSound("6VCNgQW1tpn55qpN5c4C3HjBSuiKL6L2Xw89jeG3TRj5tdphrkR9dqazLM2FcZyWABuTqfekqaznms9eGoiJpE3iSFMLdV7tWP8DRXdV866PnYezYbgpBbPyh"),
		poof: sfxrSound("45SJEiJiouquiwqaH2x48XGU5ZVEk3cf3cYZBTN4f5TLneVSPvsJW7PjN3xNczGdtdDaJ3d1Vejor8XW1XiWHP48MHA4zPVJFMWCDaEjdPqcS1VKdR7JUEnjF"),
		gameTrack: attributedTrack("instructor-of-zhings.ogg", "Instructor of Zhings - BunnyNabbit - CC0"),
		gameTrackDrone: attributedTrack("instructor-of-zhings-drone.ogg", "Instructor of Zhings (Drone) - BunnyNabbit - CC0"),
		viewTrack: attributedTrack("gawking.ogg", "Gawking - BunnyNabbit - CC0"),
		hubTrack: attributedTrack("sit-around.ogg", "Sit Around - BunnyNabbit - CC0")
	}
	return sounds
}

module.exports = cefSounds