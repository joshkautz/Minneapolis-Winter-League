import { useState, useCallback } from 'react'

interface UseAnimatedSelectOptions {
	/** Duration of the fade/scale transition in milliseconds */
	transitionDuration?: number
	/** Delay before starting the value update in milliseconds */
	updateDelay?: number
	/** Callback function to execute during the transition */
	onValueChange?: (value: string) => void
}

interface UseAnimatedSelectReturn {
	/** Whether the component is currently transitioning */
	isTransitioning: boolean
	/** Function to handle value changes with animation */
	handleAnimatedChange: (value: string) => void
	/** CSS classes for the transition state */
	getTransitionClasses: () => string
	/** CSS classes for icons during transition */
	getIconClasses: () => string
}

/**
 * Custom hook for animating select component value changes
 * Provides smooth fade and scale transitions when selections change
 */
export const useAnimatedSelect = ({
	transitionDuration = 150,
	updateDelay = 75,
	onValueChange,
}: UseAnimatedSelectOptions = {}): UseAnimatedSelectReturn => {
	const [isTransitioning, setIsTransitioning] = useState<boolean>(false)

	const handleAnimatedChange = useCallback(
		(value: string) => {
			// Start transition animation
			setIsTransitioning(true)

			// Brief delay to show the fade effect
			setTimeout(() => {
				// Execute the value change callback
				onValueChange?.(value)

				// End transition after specified duration
				setTimeout(() => {
					setIsTransitioning(false)
				}, transitionDuration)
			}, updateDelay)
		},
		[transitionDuration, updateDelay, onValueChange]
	)

	const getTransitionClasses = useCallback(() => {
		return `transition-opacity duration-150 ${
			isTransitioning ? 'opacity-50' : 'opacity-100'
		}`
	}, [isTransitioning])

	const getIconClasses = useCallback(() => {
		return `transition-all duration-200 ${
			isTransitioning ? 'scale-90' : 'scale-100'
		}`
	}, [isTransitioning])

	return {
		isTransitioning,
		handleAnimatedChange,
		getTransitionClasses,
		getIconClasses,
	}
}
