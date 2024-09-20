class Watchdog {
   constructor(client) {
      this.interval = setInterval(() => {
         this.currentRate = 0
      }, 1000)
      this.currentRate = 0
      this.limit = 382
      this.client = client
   }
   rateOperation(amount = 1) {
      this.currentRate += amount
      if (this.currentRate > this.limit) {
         this.client.disconnect("Sanctioned: Watchdog triggered")
         return true
      }
      return false
   }
   destroy() {
      clearInterval(this.interval)
   }
}

module.exports = Watchdog