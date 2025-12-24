/**
 * Site Settings Context Provider
 *
 * Provides global site settings to the application, including theme variants.
 * Listens to Firestore for real-time updates to site settings.
 */

import { FC, ReactNode, createContext, useContext, useEffect } from 'react'
import { useDocument } from 'react-firebase-hooks/firestore'
import { getSiteSettingsRef } from '@/firebase/collections/site-settings'
import { ThemeVariant } from '@/types'

interface SiteSettingsContextValue {
	/** Current theme variant */
	themeVariant: ThemeVariant
	/** Whether the Valentine theme is active */
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

	const themeVariant: ThemeVariant = snapshot?.data()?.themeVariant ?? 'default'
	const isValentine = themeVariant === 'valentine'

	// Apply or remove the valentine class on the document element
	useEffect(() => {
		const root = document.documentElement
		if (isValentine) {
			root.classList.add('valentine')
		} else {
			root.classList.remove('valentine')
		}

		// Cleanup on unmount
		return () => {
			root.classList.remove('valentine')
		}
	}, [isValentine])

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
