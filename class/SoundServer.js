const crypto = require("crypto")
class SoundEvent {
	constructor(soundData, cursor) {
		this.data = soundData
		this.cursor = cursor
	}
}

class SoundTransmitter extends require("events") {
	constructor(client) {
		super()
		this.currentTrack = null
		this.eventQueue = new Set()
		this.eventCursor = 0
		this.client = client
		this.sockets = new Set()
		this.client.on("playSound", (sound) => {
			sound = JSON.parse(JSON.stringify(sound))
			this.enqueueEvent(sound)
		})
	}

	enqueueEvent(sound) {
		const event = new SoundEvent(sound, this.eventCursor)
		this.eventCursor++
		this.sockets.forEach(socket => {
			socket.emit("playSound", event)
		})
		if (sound.loop) {
			if (this.currentTrack) {
				const deleteTrack = this.currentTrack
				setTimeout(() => {
					this.eventQueue.delete(deleteTrack)
				}, 5000);
			}
			this.currentTrack = event
			this.eventQueue.add(event)
		} else {
			this.eventQueue.add(event)
			setTimeout(() => {
				this.eventQueue.delete(event)
			}, 5000)
		}
	}

	attach(socket, cursor) {
		this.sockets.add(socket)
		this.eventQueue.forEach(event => {
			console.log(event.cursor, cursor, event.cursor > cursor)
			if (event.cursor > cursor || event.data.loop) {
				socket.emit("playSound", event)
			}
		})
		socket.once("disconnecting", () => {
			this.sockets.delete(socket)
		})
	}
}


class SoundServer extends require("events") {
	constructor(universe) {
		super()
		this.keySoundTransmitters = new Map()
		universe.on("clientAdded", (client) => {
			if (client.usingCEF) {
				const key = crypto.randomBytes(6).toString("base64url")
				this.keySoundTransmitters.set(key, new SoundTransmitter(client))
				client.on("levelLoaded", () => {
					const cefCommand = `cef create -t -s ${universe.serverConfiguration.sounds.audioPlayerBaseURL}?${key}`
					console.log("CefCommandLength", cefCommand.length)
					client.message(cefCommand, 0)
				})
			}
		})
		const express = require('express')
		const { createServer } = require('node:http')
		const { join } = require('node:path')
		const { Server } = require('socket.io')

		const app = express()
		const server = createServer(app)
		const io = new Server(server)

		app.get('/', (req, res) => {
			res.sendFile(join(__dirname, 'soundBrickClient.html'))
		})

		io.on('connection', (socket) => {
			if (socket.handshake.auth.key) {
				const soundTransmitter = this.keySoundTransmitters.get(socket.handshake.auth.key)
				if (!soundTransmitter || typeof socket.handshake.auth.cursor !== "number") socket.disconnect(true)
				soundTransmitter.attach(socket, socket.handshake.auth.cursor)
			}
		})

		server.listen(universe.serverConfiguration.sounds.interfacePort)
	}
}

module.exports = SoundServer