const filter = require("../filter.js")
const crypto = require("crypto")
const Watchdog = require("./Watchdog.js")
const DroneTransmitter = require("./DroneTransmitter.js")
const UserRecord = require("./UserRecord.js")
const templates = require("../templates.js")

function randomIntFromInterval(min, max) {
   return Math.floor(Math.random() * (max - min + 1) + min)
}

class Player extends require("events") {
   constructor(client, universe, authInfo) {
      super()
      this.client = client
      this.universe = universe
      this.client.player = this
      this.ready = this.initialize(client, universe, authInfo)
      this.authInfo = authInfo
   }
   async initialize(client, universe, authInfo) {
      const verifyUsernames = (universe.serverConfiguration.verifyUsernames && universe.heartbeat)
      if (client.httpRequest) {
         client.address = client.httpRequest.headers["x-forwarded-for"]
      } else {
         client.address = client.socket.remoteAddress
      }
      if (universe.server.clients.filter(otherClient => otherClient.address == client.address).length >= universe.serverConfiguration.maxIpConnections) {
         return client.disconnect("Too many connections!")
      }
      if (universe.server.clients.some(otherClient => otherClient.authInfo.username == authInfo.username)) {
         return client.disconnect("Another client already has that name")
      }
      if (verifyUsernames && crypto.createHash("md5").update(universe.heartbeat.salt + authInfo.username).digest("hex") !== authInfo.key) {
         console.log("Connection failed")
         client.message("It appears that authorization failed. Are you connecting via the ClassiCube server list? Try refreshing it.", 0)
         client.message(`You will be disconnected in 10 seconds.`, 0)
         setTimeout(() => {
            client.disconnect("Authorization failed. Please check chat logs.")
         }, 10000)
         return
      }
      if (!authInfo.extensions) return client.disconnect("Enable ClassiCube enhanced mode or use other supported client")
      console.log(authInfo.username, "connected")
      client.on("close", () => {
         client.destroyed = true
         if (client.space) {
            client.space.removeClient(client)
         }
         universe.server.clients.forEach(otherClient => {
            otherClient.message(`- ${client.authInfo.username} disconnected`, 0)
            otherClient.emit("playSound", universe.sounds.leave)
         })
         client.watchdog.destroy()
         universe.removeClient(client)
         console.log("left")
      })
      client.universe = universe
      client.usingCEF = universe.soundServer && client.appName.includes(" cef")
      client.customBlockSupport(1)
      client.authInfo = authInfo
      client.message("Welcome to Voxel Telephone. A multiplayer game where you build what you hear and describe what you see. Watch as creations transform through collaborative misinterpretation!", 0)
      universe.commandRegistry.attemptCall(client, "/rules")
      if (universe.serverConfiguration.listOperators.includes(authInfo.username)) {
         client.message("* You are considered a list operator.", 0)
         client.message("* To force the heartbeat to post zero players, use /forcezero", 0)
      }
      universe.addClient(client)
      client.droneTransmitter = new DroneTransmitter(client)
      universe.server.clients.forEach(otherClient => {
         otherClient.message(`+ ${client.authInfo.username} connected`, 0)
         otherClient.emit("playSound", universe.sounds.join)
      })
      client.serverIdentification("Voxel Telephone", universe.serverConfiguration.taglines[randomIntFromInterval(0, universe.serverConfiguration.taglines.length - 1)], 0x64)
      client.userRecord = new UserRecord(client, universe.db.getUserRecordDocument(client.authInfo.username))
      client.watchdog = new Watchdog(client)
      if (client.usingCEF) {
         // zhis is a pretty weird trick. usually zhe CEF plugin unloads windows on level loads, but it can be prevented if its initialization command is issued right before level loading.
         // zhis trick doesn't work if its zhe first level to be loaded, so a dummy level is loaded to get zhings going
         // i don't even know. but its neat since zhe sound interface doesn't need to be recreated everytime a level gets loaded, making for much seamless transitions.
         // it also seems to hide zhe "Now viewing" message, which might be problematic in some ozher context since zhe plugin prevents you from using its silence argument on non-allowlisted links. But whatever! Weh heh heh.
         const { processLevel } = require("classicborne-server-protocol/utils.js")
         const emptyLevelBuffer = await processLevel(templates.empty([64, 64, 64]), 64, 64, 64)
         client.loadLevel(await emptyLevelBuffer, 64, 64, 64, true)
         const waitPromise = new Promise(resolve => setTimeout(resolve, 300))
         // allows zhe client to receive and load zhe dummy level. might be neater to wait for a position update, but not really possible here as zhe client hasn't received its own proper spawn position yet.
         await waitPromise
         client.emit("soundLoadHack")
         if (client.destroyed) return
      }
      universe.gotoHub(client)
      client.on("setBlock", operation => {
         if (client.watchdog.rateOperation()) return
         if (!client.space) return
         const operationPosition = [operation.x, operation.y, operation.z]
         let block = operation.type
         if (!client.space.userHasPermission(client.authInfo.username)) {
            client.setBlock(client.space.getBlock(operationPosition), operationPosition[0], operationPosition[1], operationPosition[2])
            return client.message("You don't have permission to build in this level", 0)
         }
         if (operationPosition.some(value => value > 63)) {
            client.disconnect("Illegal position received")
            return
         }
         if (operation.mode == 0) {
            block = 0
         }
         if (client.space.inVcr) {
            client.setBlock(client.space.getBlock(operationPosition), operationPosition[0], operationPosition[1], operationPosition[2])
            client.message("Unable to place block. Level is in VCR mode", 0)
            return
         }
         if (client.space.blocking) {
            client.setBlock(client.space.getBlock(operationPosition), operationPosition[0], operationPosition[1], operationPosition[2])
            if (client.space.inferCurrentCommand(operationPosition) !== "inferred position") {
               client.message("Unable to place block. Command in level is expecting additional arguments", 0)
            }
            return
         }
         if (client.paintMode) {
            client.space.setBlock(operationPosition, client.heldBlock, [])
         } else {
            client.space.setBlock(operationPosition, block, [client])
         }
      })
      client.on("message", async (message) => {
         if (client.watchdog.rateOperation(10)) return
         console.log(client.authInfo.username, message)
         if (await universe.commandRegistry.attemptCall(client, message)) return
         // a few hardcoded commands
         if (message == "/forcezero" && universe.serverConfiguration.listOperators.includes(client.authInfo.username) && universe.heartbeat) {
            universe.heartbeat.forceZero = true
            console.log(`! ${client.authInfo.username} forced heartbeat players to zero`)
            universe.server.clients.forEach(otherClient => otherClient.message(`! ${client.authInfo.username} forced heartbeat players to zero`, 0))
            return
         }
         if (client.watchdog.rateOperation(20)) return
         // pass this to the level
         if (message.startsWith("/")) {
            if (!client.space) return
            if (!client.space.userHasPermission(client.authInfo.username)) return client.message("You don't have permission to build in this level", 0)
            if (client.space.inVcr) {
               client.message("Unable to use commands. Level is in VCR mode", 0)
               return
            }
            client.space.interpretCommand(message.replace("/", ""))
         } else {
            if (filter.matches(message)) {
               const filterMessages = universe.serverConfiguration.replacementMessages
               universe.server.clients.forEach(otherClient => otherClient.message(`&7${client.authInfo.username}: &f${filterMessages[0, randomIntFromInterval(0, filterMessages.length - 1)]}`, 0))
               return
            }
            if (client.space?.game?.promptType == "build") {
               client.currentDescription = message
               client.message("Description:", 0)
               client.message(message, 0)
               client.message(message, 1)
               client.message("Use /finish to confirm your description for this build", 3)
               client.message("Use /finish to confirm your description for this build", 0)
            } else if (client.creating) {
               client.creating = false
               client.canCreate = false
               universe.canCreateCooldown.add(client.authInfo.username)
               client.message("Your description has been submitted!", 0)
               const game = await universe.db.createNewGame(message, client.authInfo.username)
               // addInteraction(client.authInfo.username, game._id, "complete")
               universe.db.addInteraction(client.authInfo.username, game._id, "skip")
               setTimeout(() => {
                  universe.canCreateCooldown.delete(client.authInfo.username)
               }, 3600000) // one hour
            } else {
               const userRecord = await (client.userRecord.data)
               const sound = universe.sounds[userRecord.chatSound] || universe.sounds.chat
               universe.server.clients.forEach(otherClient => {
                  otherClient.message(`&7${client.authInfo.username}: &f${message}`, 0, "> ")
                  otherClient.emit("playSound", sound)
               })
            }
         }
      })
      client.position = [0, 0, 0]
      client.orientation = [0, 0]
      client.paintMode = false
      client.on("position", (position, orientation, heldBlock) => {
         client.position = [position.x, position.y, position.z]
         client.heldBlock = heldBlock
         client.orientation = [orientation.yaw, orientation.pitch]
         if (client.space) {
            const controlledDrone = client.space.clientDrones.get(client)
            if (controlledDrone) {
               controlledDrone.setPosition(position, orientation)
            }
            // portal detection
            client.space.portals.forEach(portal => {
               if (portal.intersects(client.position)) {
                  if (portal.globalCommand) {
                     client.universe.commandRegistry.attemptCall(client, portal.globalCommand)
                  }
               }
            })
         }
      })
      const hatchday = universe.getHatchday()
      if (hatchday) {
         client.message(hatchday.joinMessage, 0)
      }
   }
}

module.exports = Player