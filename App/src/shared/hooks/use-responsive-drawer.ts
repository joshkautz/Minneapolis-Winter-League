import { useState, useEffect, useRef, useCallback } from 'react'
import { useIsMobile } from '@/shared/hooks'

/**
 * Custom hook for managing responsive drawer state with viewport-aware animations
 *
 * Features:
 * - Automatically closes drawer when switching to desktop view
 * - Remembers user intent and re-opens drawer when returning to mobile view
 * - Tracks manual user actions vs automatic viewport changes
 * - Provides smooth animations between viewport transitions
 */
export const useResponsiveDrawer = (initialOpen = false) => {
	const [isDrawerOpen, setIsDrawerOpen] = useState(initialOpen)
	const isMobile = useIsMobile()
	// Track if user intended the drawer to be open (for viewport changes)
	const userIntendedOpen = useRef(initialOpen)

	// Handle viewport changes - animate drawer closed on desktop, open on mobile if user intended it
	useEffect(() => {
		if (!isMobile && isDrawerOpen) {
			// Going to desktop - animate closed but remember user's intent
			userIntendedOpen.current = true
			setIsDrawerOpen(false)
		} else if (isMobile && !isDrawerOpen && userIntendedOpen.current) {
			// Going back to mobile and user had it open before - animate back open
			setIsDrawerOpen(true)
		}
	}, [isMobile, isDrawerOpen])

	// Handle manual opening/closing by user
	const handleSetDrawerOpen = useCallback((open: boolean) => {
		setIsDrawerOpen(open)
		// Track user intent when they manually open/close
		userIntendedOpen.current = open
	}, [])

	// Handle closing the drawer and resetting user intent
	const handleCloseDrawer = useCallback(() => {
		if (isDrawerOpen) {
			setIsDrawerOpen(false)
			// User manually closed, so reset intent
			userIntendedOpen.current = false
		}
	}, [isDrawerOpen])

	// Handle actions that should close drawer and reset intent (like login)
	const handleCloseDrawerWithAction = useCallback((action?: () => void) => {
		if (action) {
			action()
		}
		setIsDrawerOpen(false)
		// User performed action that closed drawer, so reset intent
		userIntendedOpen.current = false
	}, [])

	return {
		// State
		isDrawerOpen,
		isMobile,

		// Actions
		setDrawerOpen: handleSetDrawerOpen,
		closeDrawer: handleCloseDrawer,
		closeDrawerWithAction: handleCloseDrawerWithAction,
	}
}
