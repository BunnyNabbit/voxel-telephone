/**Calculates next and previous cursors for paginated MongoDB queries.
 * 
 * @example
 * ```
 * const { nextCursor, previousCursor } = await getPaginationCursors({ ... })
 * ```
 * @param {Object} options
 * @param {Array} options.dataArray - The array of items for the current page (may be overfetched for next page detection)
 * @param {any} options.currentCursor - The current cursor value (ObjectId or null)
 * @param {number} options.pageSize - The number of items per page
 * @param {function} options.findFirstItem - Function to find the first item for previous page lookup
 * @param {function} options.buildPreviousQuery - Function to build the MongoDB query for previous page
 * @param {object} options.collection - The MongoDB collection instance
 * @returns {Promise<{nextCursor: any, previousCursor: any}>}
 */
export async function getPaginationCursors({ dataArray, currentCursor, pageSize, findFirstItem, buildPreviousQuery, collection }) {
	let nextCursor = null
	let previousCursor = null
	if (dataArray.length === pageSize * 2) {
		nextCursor = dataArray[dataArray.length - 3]._id
		dataArray.pop()
		dataArray.pop()
	}
	if (currentCursor && dataArray.length > 0) {
		const firstItem = dataArray.find(findFirstItem)
		if (firstItem) {
			const firstItemId = firstItem._id
			const findDocument = buildPreviousQuery(firstItemId)
			const previousPageItems = await collection.find(findDocument).sort({ _id: 1 }).limit(pageSize).toArray()
			if (previousPageItems.length > 0) {
				previousCursor = previousPageItems.length >= pageSize ? previousPageItems[previousPageItems.length - 1]._id : ""
			}
		}
	}
	return { nextCursor, previousCursor }
}
