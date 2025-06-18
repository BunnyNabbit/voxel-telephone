// @ts-ignore
import { database } from "../../../shared/db.mjs"
import { ObjectId } from "mongojs"

export async function GET({ params, request }) {
	const render = await database.getTurnDownload(new ObjectId(params.id), "vox")
	if (!render) {
		return new Response("Not Found", { status: 404 })
	}
	return new Response(render.data.buffer, {
		headers: {
			"Content-Type": `application/octet-stream`,
			"Cache-Control": "public, max-age=604800",
			"Content-Disposition": `inline; filename="${params.id}.vox"`,
		},
	})
}
