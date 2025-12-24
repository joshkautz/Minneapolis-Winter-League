/**
 * Site Settings Context Provider
 *
 * Provides global site settings to the application, including theme variants.
 * Listens to Firestore for real-time updates to site settings.
 */

import { FC, ReactNode, createContext, useContext, useEffect, useRef } from 'react'
import { useDocument } from 'react-firebase-hooks/firestore'
import { getSiteSettingsRef } from '@/firebase/collections/site-settings'
import { ThemeVariant, THEME_VARIANTS } from '@/types'

interface SiteSettingsContextValue {
	/** Current theme variant */
	themeVariant: ThemeVariant
	/** Whether the Valentine theme is active (convenience helper) */
	isValentine: boolean
	/** Whether settings are still loading */
	loading: boolean
}

const SiteSettingsContext = createContext<SiteSettingsContextValue | undefined>(
	undefined
)

export const SiteSettingsContextProvider: FC<{ children: ReactNode }> = ({
	children,
}) => {
	const [snapshot, loading] = useDocument(getSiteSettingsRef())
	const previousVariantRef = useRef<ThemeVariant | null>(null)

	const themeVariant: ThemeVariant =
		snapshot?.data()?.themeVariant ?? 'default'
	const isValentine = themeVariant === 'valentine'

	// Apply theme class on the document element (supports any theme variant)
	useEffect(() => {
		const root = document.documentElement

		// Remove previous theme class if it exists
		if (previousVariantRef.current && previousVariantRef.current !== 'default') {
			root.classList.remove(previousVariantRef.current)
		}

		// Add new theme class (skip for default theme)
		if (themeVariant !== 'default') {
			root.classList.add(themeVariant)
		}

		previousVariantRef.current = themeVariant

		// Cleanup on unmount - remove all theme classes
		return () => {
			THEME_VARIANTS.forEach((variant) => {
				if (variant !== 'default') {
					root.classList.remove(variant)
				}
			})
		}
	}, [themeVariant])

	return (
		<SiteSettingsContext.Provider value={{ themeVariant, isValentine, loading }}>
			{children}
		</SiteSettingsContext.Provider>
	)
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSiteSettings = (): SiteSettingsContextValue => {
	const context = useContext(SiteSettingsContext)
	if (context === undefined) {
		throw new Error(
			'useSiteSettings must be used within a SiteSettingsContextProvider'
		)
	}
	return context
}
