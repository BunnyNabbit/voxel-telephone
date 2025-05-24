import { Universe } from "./class/server/Universe.mjs"
import serverConfiguration from "./config.json" with { type: "json" }
new Universe(serverConfiguration)
