import crypto from "crypto"
import { EventEmitter } from "events"
import express from "express"
import { join } from "node:path"
import { createServer } from "node:http"
import { Server } from "socket.io"
import { getAbsolutePath } from "esm-path"
const __dirname = getAbsolutePath(import.meta.url)

class SoundEvent {
	/** */
	constructor(soundData, cursor) {
		this.data = soundData
		this.cursor = cursor
	}
}

class SoundTransmitter extends EventEmitter {
	/** */
	constructor(player) {
		super()
		this.currentTrack = null
		this.eventQueue = new Set()
		this.eventCursor = 0
		this.player = player
		this.sockets = new Set()
		this.key = crypto.randomBytes(6).toString("base64url")
		this.player.on("playSound", (sound) => {
			sound = JSON.parse(JSON.stringify(sound))
			this.enqueueEvent(sound)
		})
		player.once("soundLoadHack", () => {
			this.createWindow()
			setTimeout(() => {
				if (!this.sockets.size) this.createWindow()
			}, 4500)
		})
		this.configuration = {
			cefMusic: false,
			cefSounds: false,
		}
		player.on("configuration", (configuration) => {
			this.configuration = configuration
			if (!configuration.cefMusic) {
				this.enqueueEvent({
					loop: true,
					stop: true,
				})
			} else {
				// resend current track
				if (this.currentTrack) this.enqueueEvent(this.currentTrack.data)
			}
		})
	}

	createWindow() {
		const cefCommand = `cef create -t -s ${this.player.universe.serverConfiguration.sounds.audioPlayerBaseURL}?${this.key}`
		this.player.message(cefCommand)
	}

	enqueueEvent(sound) {
		const event = new SoundEvent(sound, this.eventCursor)
		this.eventCursor++
		if (this.canPlay(sound)) {
			this.sockets.forEach((socket) => {
				socket.emit("playSound", event)
			})
		}
		if (sound.loop && !sound.stop) {
			if (this.currentTrack) {
				const deleteTrack = this.currentTrack
				setTimeout(() => {
					this.eventQueue.delete(deleteTrack)
				}, 5000)
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

	canPlay(sound) {
		if (sound.stop) return true
		if (sound.loop && this.configuration.cefMusic) return true
		if (!sound.loop && this.configuration.cefSounds) return true
		return false
	}

	attach(socket, cursor) {
		this.sockets.add(socket)
		this.eventQueue.forEach((event) => {
			console.log(event.cursor, cursor, event.cursor > cursor)
			if (this.canPlay(event.data) && (event.cursor > cursor || event.data.loop)) {
				socket.emit("playSound", event)
			}
		})
		socket.once("disconnecting", () => {
			this.sockets.delete(socket)
			if (!this.sockets.size) this.createWindow()
		})
	}
}

export class SoundServer extends EventEmitter {
	/** */
	constructor(universe) {
		super()
		this.keySoundTransmitters = new Map()
		universe.on("playerAdded", async (player) => {
			if (player.usingCEF) {
				const key = crypto.randomBytes(6).toString("base64url")
				const soundTransmitter = new SoundTransmitter(player)
				this.keySoundTransmitters.set(soundTransmitter.key, soundTransmitter)
				player.once("close", () => {
					this.keySoundTransmitters.delete(key)
				})
				const userRecord = await player.userRecord.get()
				player.emit("configuration", userRecord.configuration)
				player.message("CEF sounds are enabled.")
				player.message("Use &a/setting music off &fto disable music")
			}
		})

		const app = express()
		const server = createServer(app)
		const io = new Server(server)
		app.use("/", express.static(join(__dirname, "../../static")))

		io.on("connection", (socket) => {
			if (socket.handshake.auth.key) {
				const soundTransmitter = this.keySoundTransmitters.get(socket.handshake.auth.key)
				if (!soundTransmitter || typeof socket.handshake.auth.cursor !== "number") return socket.disconnect(true)
				soundTransmitter.attach(socket, socket.handshake.auth.cursor)
			}
		})

		server.listen(universe.serverConfiguration.sounds.interfacePort)
	}
}

export default SoundServer
