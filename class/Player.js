const filter = require("../filter.js")
const crypto = require("crypto")
const Watchdog = require("./Watchdog.js")
const DroneTransmitter = require("./DroneTransmitter.js")
const UserRecord = require("./UserRecord.js")
const templates = require("../templates.js")
const PushIntegration = require("./integrations/PushIntegration.js")

function randomIntFromInterval(min, max) {
   return Math.floor(Math.random() * (max - min + 1) + min)
}

class Player extends require("events") {
   constructor(client, universe, authInfo) {
      super()
      this.client = client
      this.universe = universe
      this.client.player = this
      this.authInfo = authInfo
      this.username = authInfo.username
      this.ready = this.initialize(client, universe, authInfo)
   }
   async initialize(client, universe, authInfo) {
      const verifyUsernames = (universe.serverConfiguration.verifyUsernames && universe.heartbeat)
      if (universe.server.players.filter(otherClient => otherClient.address == client.address).length >= universe.serverConfiguration.maxIpConnections) {
         return this.client.disconnect("Too many connections!")
      }
      if (universe.server.players.some(otherClient => otherClient.authInfo.username == authInfo.username)) {
         return this.client.disconnect("Another client already has that name")
      }
      if (verifyUsernames && crypto.createHash("md5").update(universe.heartbeat.salt + authInfo.username).digest("hex") !== authInfo.key) {
         console.log("Connection failed")
         this.message("It appears that authorization failed. Are you connecting via the ClassiCube server list? Try refreshing it.")
         this.message(`You will be disconnected in 10 seconds.`)
         setTimeout(() => {
            this.client.disconnect("Authorization failed. Please check chat logs.")
         }, 10000)
         return
      }
      if (!authInfo.extensions) return this.client.disconnect("Enable ClassiCube enhanced mode or use other supported client")
      console.log(authInfo.username, "connected")
      this.client.on("close", () => {
         this.destroyed = true
         if (this.space) {
            this.space.removePlayer(this)
         }
         universe.pushMessage(`- ${this.authInfo.username} disconnected`, PushIntegration.interestType.playerConnection)
         universe.server.players.forEach(otherClient => {
            otherClient.emit("playSound", universe.sounds.leave)
         })
         this.watchdog.destroy()
         universe.removePlayer(this)
         console.log("left")
      })
      this.universe = universe
      this.usingCEF = universe.soundServer && this.client.appName.includes(" cef")
      this.client.customBlockSupport(1)
      this.authInfo = authInfo
      this.message("Welcome to Voxel Telephone. A multiplayer game where you build what you hear and describe what you see. Watch as creations transform through collaborative misinterpretation!")
      universe.commandRegistry.attemptCall(this, "/rules")
      if (universe.serverConfiguration.listOperators.includes(authInfo.username)) {
         this.message("* You are considered a list operator.")
         this.message("* To force the heartbeat to post zero players, use /forcezero")
      }
      universe.addPlayer(this)
      this.droneTransmitter = new DroneTransmitter(this.client)
      universe.pushMessage(`+ ${this.username} connected`, PushIntegration.interestType.playerConnection)
      universe.server.players.forEach(otherClient => {
         otherClient.emit("playSound", universe.sounds.join)
      })
      let tagline = "how do i get cowboy paint off a dog ."
      if (universe.serverConfiguration.taglines) tagline = universe.serverConfiguration.taglines[randomIntFromInterval(0, universe.serverConfiguration.taglines.length - 1)]
      this.client.serverIdentification("Voxel Telephone", tagline, 0x64)
      this.userRecord = new UserRecord(this, universe.db.getUserRecordDocument(this.authInfo.username))
      this.watchdog = new Watchdog(this)
      if (this.usingCEF) {
         // zhis is a pretty weird trick. usually zhe CEF plugin unloads windows on level loads, but it can be prevented if its initialization command is issued right before level loading.
         // zhis trick doesn't work if its zhe first level to be loaded, so a dummy level is loaded to get zhings going
         // i don't even know. but its neat since zhe sound interface doesn't need to be recreated everytime a level gets loaded, making for much seamless transitions.
         // it also seems to hide zhe "Now viewing" message, which might be problematic in some ozher context since zhe plugin prevents you from using its silence argument on non-allowlisted links. But whatever! Weh heh heh.
         const { processLevel } = require("classicborne-server-protocol/utils.js")
         const emptyLevelBuffer = await processLevel(templates.empty([64, 64, 64]), 64, 64, 64)
         this.client.loadLevel(await emptyLevelBuffer, 64, 64, 64, true)
         const waitPromise = new Promise(resolve => setTimeout(resolve, 300))
         // allows zhe client to receive and load zhe dummy level. might be neater to wait for a position update, but not really possible here as zhe client hasn't received its own proper spawn position yet.
         await waitPromise
         this.emit("soundLoadHack")
         if (this.destroyed) return
      }
      universe.gotoHub(this)
      this.client.on("setBlock", operation => {
         if (this.watchdog.rateOperation()) return
         if (!this.space) return
         const operationPosition = [operation.x, operation.y, operation.z]
         let block = operation.type
         if (!this.space.userHasPermission(this.authInfo.username)) {
            this.client.setBlock(this.space.getBlock(operationPosition), operationPosition[0], operationPosition[1], operationPosition[2])
            return this.message("You don't have permission to build in this level")
         }
         if (operationPosition.some(value => value > 63)) {
            this.client.disconnect("Illegal position received")
            return
         }
         if (operation.mode == 0) {
            block = 0
         }
         if (this.space.inVcr) {
            this.client.setBlock(this.space.getBlock(operationPosition), operationPosition[0], operationPosition[1], operationPosition[2])
            this.message("Unable to place block. Level is in VCR mode")
            return
         }
         if (this.space.blocking) {
            this.client.setBlock(this.space.getBlock(operationPosition), operationPosition[0], operationPosition[1], operationPosition[2])
            if (this.space.inferCurrentCommand(operationPosition) !== "inferred position") {
               this.message("Unable to place block. Command in level is expecting additional arguments")
            }
            return
         }
         if (this.paintMode) {
            this.space.setBlock(operationPosition, this.heldBlock, [])
         } else {
            this.space.setBlock(operationPosition, block, [client])
         }
      })
      this.client.on("message", async (message) => {
         if (this.watchdog.rateOperation(10)) return
         console.log(this.authInfo.username, message)
         if (await universe.commandRegistry.attemptCall(this, message)) return
         // a few hardcoded commands
         if (message == "/forcezero" && universe.serverConfiguration.listOperators.includes(this.authInfo.username) && universe.heartbeat) {
            universe.heartbeat.forceZero = true
            console.log(`! ${this.authInfo.username} forced heartbeat players to zero`)
            universe.server.players.forEach(otherClient => otherClient.message(`! ${this.authInfo.username} forced heartbeat players to zero`))
            return
         }
         if (this.watchdog.rateOperation(20)) return
         // pass this to the level
         if (message.startsWith("/")) {
            if (!this.space) return
            if (!this.space.userHasPermission(this.authInfo.username)) return this.message("You don't have permission to build in this level")
            if (this.space.inVcr) {
               this.message("Unable to use commands. Level is in VCR mode")
               return
            }
            this.space.interpretCommand(message.replace("/", ""))
         } else {
            if (filter.matches(message)) {
               const filterMessages = universe.serverConfiguration.replacementMessages
               universe.server.players.forEach(otherClient => otherClient.message(`&7${this.authInfo.username}: &f${filterMessages[0, randomIntFromInterval(0, filterMessages.length - 1)]}`))
               return
            }
            if (this.space?.game?.promptType == "build") {
               this.currentDescription = message
               this.message("Description:")
               this.message(message, [0, 1])
               this.message("Use /finish to confirm your description for this build", [0, 3])
            } else if (this.creating) {
               this.creating = false
               this.canCreate = false
               universe.canCreateCooldown.add(this.authInfo.username)
               this.message("Your description has been submitted!")
               const game = await universe.db.createNewGame(message, this.authInfo.username)
               // addInteraction(this.authInfo.username, game._id, "complete")
               universe.db.addInteraction(this.authInfo.username, game._id, "skip")
               setTimeout(() => {
                  universe.canCreateCooldown.delete(this.authInfo.username)
               }, 3600000) // one hour
            } else {
               const userRecord = await (this.userRecord.data)
               const sound = universe.sounds[userRecord.chatSound] || universe.sounds.chat
               universe.pushMessage(`&7${this.authInfo.username}: &f${message}`, PushIntegration.interestType.chatMessage)
               universe.server.players.forEach(otherClient => {
                  otherClient.emit("playSound", sound)
               })
            }
         }
      })
      this.position = [0, 0, 0]
      this.orientation = [0, 0]
      this.paintMode = false
      this.client.on("position", (position, orientation, heldBlock) => {
         this.position = [position.x, position.y, position.z]
         this.heldBlock = heldBlock
         this.orientation = [orientation.yaw, orientation.pitch]
         if (this.space) {
            const controlledDrone = this.space.clientDrones.get(this.client)
            if (controlledDrone) {
               controlledDrone.setPosition(position, orientation)
            }
            // portal detection
            this.space.portals.forEach(portal => {
               if (!portal.spawnZone && portal.intersects(this.position)) {
                  if (portal.globalCommand) {
                     this.universe.commandRegistry.attemptCall(this, portal.globalCommand)
                  }
               }
            })
         }
      })
      const hatchday = universe.getHatchday()
      if (hatchday) {
         this.message(hatchday.joinMessage)
      }
   }
   // probably shouldn't do zhat. but whatever
   // customBlockSupport(version) {
   //    this.client.customBlockSupport(version)
   // }
   // except for zhis one. we should try to improve on crappy protocol functions. not duplicate zhem.
   message(message, types = [0], continueAdornment = "> ") {
      if (typeof types === "number") {
         types = [types]
      }
      const maxLength = 64 - continueAdornment.length
      const messages = []
      let currentColorCode = ""
      if (message.length <= maxLength) {  // Handle short messages directly
         messages.push(message)
      } else {
         while (message.length > 0) {
            const effectiveMaxLength = maxLength - currentColorCode.length // Adjust for color code length
            if (message.length <= effectiveMaxLength) {
               messages.push((messages.length === 0 ? "" : continueAdornment) + currentColorCode + message)
               break
            }
            let splitIndex = message.lastIndexOf(" ", effectiveMaxLength)
            // Check if the split is within a color code
            const colorCodeIndex = message.lastIndexOf("&", effectiveMaxLength)
            if (colorCodeIndex > splitIndex && colorCodeIndex < effectiveMaxLength + 2 && /^[0-9a-f]$/.test(message[colorCodeIndex + 1])) {
               splitIndex = colorCodeIndex - 1 // Split before the color code, if found within the last couple of chars
            }
            if (splitIndex === -1 || splitIndex === 0) {
               splitIndex = Math.min(effectiveMaxLength, message.length)
            }
            const currentMessage = (messages.length === 0 ? "" : continueAdornment) + currentColorCode + message.substring(0, splitIndex)
            const match = message.substring(0, splitIndex + 1).match(/&[0-9a-f](?!.*&[0-9a-f])/)
            if (match) {
               currentColorCode = match[0]
            }
            messages.push(currentMessage)
            message = message.substring(splitIndex + 1).trim()
         }
      }

      types.forEach(type => {
         messages.forEach(message => {
            this.client.message(message, type)
         })
      })
   }
   // addPlayerName(id, username, listName, groupName = "", groupOrder = 0) {
   //    this.client.addPlayerName(id, username, listName, groupName, groupOrder)
   // }
   // serverIdentification(serverName, motd, userType) {
   //    this.client.serverIdentification(serverName, motd, userType)
   // }
}

module.exports = Player