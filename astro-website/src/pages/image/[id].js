import { database } from "../../shared/db.mjs"
import { ObjectId } from "mongodb"

export async function GET({ params, request }) {
	const render = await database.getTurnRender(ObjectId.createFromHexString(params.id))
	if (!render) return new Response("Not Found", { status: 404 })
	return new Response(render.data.buffer, {
		headers: {
			"Content-Type": `image/${render.format}`,
			"Cache-Control": "public, max-age=604800",
			"Content-Disposition": `inline; filename="${params.id}.${render.format}"`,
		},
	})
}
