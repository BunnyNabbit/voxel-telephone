import { Vector3 } from "./arrayLikes.mjs"
import { Player } from "../class/player/Player.mjs"
import { Level } from "../class/level/Level.mjs"

/** I am the data sent when a {@link Player} clicks in a {@link Level}. */
export interface clickData {
	position: Vector3
	holdingBlock: number
	type: "single" | "double"
}
