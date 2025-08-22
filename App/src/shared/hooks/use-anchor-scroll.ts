import { useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export const useAnchorScroll = () => {
	const scrolledRef = useRef(false)
	const { hash } = useLocation()
	const hashRef = useRef(hash)

	useEffect(() => {
		if (hash) {
			if (hashRef.current !== hash) {
				hashRef.current = hash
				scrolledRef.current = false
			}

			if (!scrolledRef.current) {
				const id = hash.replace('#', '')
				const element = document.getElementById(id)
				if (element) {
					element.scrollIntoView({ behavior: 'smooth' })
					scrolledRef.current = true
				}
			}
		}
	})
}
