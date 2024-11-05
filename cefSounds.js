
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
		yip: sfxrSound("1242pjtyyfmqVzutzeaZ1X8wkHTVyG5EcmEQsYUGEAUz2VreMejuseYg47F7MQz2wonGnxNBeMWLmk8eroLzxEzbLDypJuCY1xUXqezmHg3CQQCdmbihzY19Tg"),
		shiny: sfxrSound("34T6PkwjtyBwLvonpcm41Zq4LuPUk71nCDgvjKKbAU33hgxVPjKViAw4V2RMjkSB7xRNdibLu1T9zBcusDdP2e5Uqb1wcP3GmHrzPWCUrEXNWQnypYDGcC8rb"),
		invalid: sfxrSound("11111GvZH7jwT4FjsvL4Kt7D9TBj81nTkcvBs3VbcAfsTdCKdtFu6AmMN5iKGM55Y4cPxiz6SG7etbWKP2QkiVwBfo54smV8s9t7v37V7MT1vDs7CEjwSjSf"),
		chat: sfxrSound("3Yw2CxDjPUsnbj3nAaw1boqFv8ordh7fvnYwRtUhUouLzXFrNBA8YeybkVQCnjpiXefXnmDMmdgzarbnuxdhmnXrNsnd99tdHiHZYYEAoFANNHyhiycwYCX8B"),
		rewind: sfxrSound("5k1PoSeXbw2ZXQ8Xn5zhtUbcPKwTEVYptzfK1c5ejg1uuoBLf79rHUDGb6b3ueMi6qEb6HdVSLayc4rQueqtUU71L9y3DzC8MgWLhuGgqMYYcgujfDLMo2tbP"),
		fastForward: sfxrSound("5gRs7L69av9vivfNuYHpVdBhT6NXBgAqB9UU9zqxXKfcf1z9zY6S5JKc9siuhNNe4tBQb4ix8hXaYuFAafT2nQmv9EVc6WYXDRaqiVS56vtUEK1AcGs3kW4Dc"),
		activateVCR: fileSound("vcr-start.ogg"),
		deactivateVCR: fileSound("vcr-end.ogg"),
		abort: sfxrSound("3PHPkv9FbDkbiVkCsXxBWFovhpK9UPebLT4tFdG6hiLtdr72TMCnpdyWc8ZJ9oCzFrKUgv1YsFfhnW7YNxBtTFJbP5aUQGf1WbLEY5zDp36YSFh2KnNzgH42B"),
		toggle: sfxrSound("4c8kYezmAPvJyi4ZGdXq7vWcwfxAhzMmAc9VtfP1X8nAKNahicEM4EKxouniXuTjuDkW8XFmPuRrymTocxps8nQmGpxPdZB5ctd8benEBnUAxWXfk3ongqJDJ"),
		poof: sfxrSound("45SJEiJiouquiwqaH2x48XGU5ZVEk3cf3cYZBTN4f5TLneVSPvsJW7PjN3xNczGdtdDaJ3d1Vejor8XW1XiWHP48MHA4zPVJFMWCDaEjdPqcS1VKdR7JUEnjF"),
		join: sfxrSound("34T6PktTUDAmJbCDoG4ZpNfWdzxkh2X7RQJBpEtRydQ6V21jpTtsGMGu4qDVioCHUeayPmzGf2HVzxQkUZkg5wpjHFJAWahbhYfaq9DefuN7uRYXsKmbcNWrT"),
		leave: sfxrSound("34T6PktTUDAmJbCDoG4ZpNf1dUxfN4tkxPxnYkKQZWzNxssWrEzepcSwfgvdcdKmxF1a2EnN5C5RHHCviY45PniXkeZJTFbLfuZe8f4ohaAfVyoEpk5deUYEj"),
		complete: sfxrSound("11111111111112aaZzEw4qaJHroZtt2yNQ4UQx6f1G4MVUaDbsoD82uzouwBhgc5L9PHGzD6YzCMyVGdFQ7Yofmhn77awmsyZXXTsz7GfaM9YcgKNaYas"),
		gameTrack: attributedTrack("instructor-of-zhings.ogg", "Instructor of Zhings - BunnyNabbit - CC0"),
		gameTrackDrone: attributedTrack("instructor-of-zhings-drone.ogg", "Instructor of Zhings (Drone) - BunnyNabbit - CC0"),
		viewTrack: attributedTrack("gawking.ogg", "Gawking - BunnyNabbit - CC0"),
		hubTrack: attributedTrack("sit-around.ogg", "Sit Around - BunnyNabbit - CC0")
	}
	return sounds
}

module.exports = cefSounds