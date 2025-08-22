import { useEffect, useState } from 'react'

// I am using a default delay of 200ms because that is right about the range where things still "feel" instant to the user
// but you can pass in a custom value value for ms if you like!
export const useDebounce = <T>(value: T, delay?: number): T => {
	const [debouncedValue, setDebouncedValue] = useState<T>(value)

	useEffect(() => {
		const handler = setTimeout(() => {
			setDebouncedValue(value)
		}, delay ?? 200)

		return () => {
			clearTimeout(handler)
		}
	}, [value])

	return debouncedValue
}
