if (!import.meta.hot) throw new Error("Don't import me when dynohot isn't being used. Try checking for \"import.meta.hot\" before importing me.")

export class HotModuleReplacementHelper {
	static handleClassModuleReplacement(module, handleClass) {
		module.hot.accept((newModule) => {
			const newClass = newModule.default
			const originalClass = handleClass.originalClass ?? handleClass
			Object.defineProperties(originalClass.prototype, Object.getOwnPropertyDescriptors(newClass.prototype))
			newClass.originalClass = originalClass
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
