if (!import.meta.hot) throw new Error("Don't import me when dynohot isn't being used. Try checking for \"import.meta.hot\" before importing me.")
/** @namespace */
export class HotModuleReplacementHelper {
	static handleClassModuleReplacement(module, handleClass) {
		const originalClassKeyName = `originalClass${handleClass.name}`
		module.hot.accept((newModule) => {
			// Transfer prototype properties from new class to original
			const newClass = newModule.default
			const originalClass = handleClass[originalClassKeyName] ?? handleClass
			Object.defineProperties(originalClass.prototype, Object.getOwnPropertyDescriptors(newClass.prototype))
			newClass[originalClassKeyName] = originalClass
			// make "instanceof" work a little of what I expect after replacing. in bozh cases where zhe old class is being tested against zhe new class, and vice versa.
			Object.defineProperty(newClass, Symbol.hasInstance, {
				value(instance) {
					return instance instanceof originalClass
				},
			})
			if (!originalClass.definedHasInstance) {
				originalClass.definedHasInstance = true
				Object.defineProperty(originalClass, Symbol.hasInstance, {
					value(instance) {
						return instance.constructor[originalClassKeyName] == originalClass
					},
				})
			}
		})
	}
	static handleArrayReuse(module, handleArray) {
		module.hot.accept((newModule) => {
			const newArray = newModule.default
			const originalArray = handleArray.originalArray ?? handleArray
			originalArray.length = 0
			newArray.forEach((newArrayItem) => {
				originalArray.push(newArrayItem)
			})
			newArray.originalArray = originalArray
		})
	}
}
