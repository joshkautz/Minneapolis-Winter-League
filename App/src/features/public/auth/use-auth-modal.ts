import { useState, useCallback } from 'react'

interface UseAuthModalReturn {
	isAuthModalOpen: boolean
	openAuthModal: () => void
	closeAuthModal: () => void
}

export const useAuthModal = (): UseAuthModalReturn => {
	const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)

	const openAuthModal = useCallback(() => {
		setIsAuthModalOpen(true)
	}, [])

	const closeAuthModal = useCallback(() => {
		setIsAuthModalOpen(false)
	}, [])

	return {
		isAuthModalOpen,
		openAuthModal,
		closeAuthModal,
	}
}
