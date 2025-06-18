// 1. Import utilities from `astro:content`
import { defineCollection, z } from "astro:content"

// 2. Import loader(s)
import { glob, file } from "astro/loaders"

// 3. Define your collection(s)
const help = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/help" }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			contributors: z.array(z.string()).optional(),
			summary: z.string().optional(),
			image: image().optional(),
			imageAlt: z.string().optional(),
			noIndex: z.boolean().optional(),
		}),
})

// 4. Export a single `collections` object to register your collection(s)
export const collections = { help }
