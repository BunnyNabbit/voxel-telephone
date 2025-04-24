import config from "../../../config.json"

export default function getCanonicalURL(pathname) {
	const { baseURL } = config.website
	const { origin } = new URL(baseURL)
	return `${origin}${pathname}`
}