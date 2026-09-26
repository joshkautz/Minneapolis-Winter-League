import {
	createContext,
	useCallback,
	useContext,
	useLayoutEffect,
	useMemo,
	useState,
	useSyncExternalStore,
	type ReactNode,
} from 'react'

/** What the player chose. `system` follows the operating system. */
export type ThemePreference = 'light' | 'dark' | 'system'

/** What is actually shown. */
export type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
	preference: ThemePreference
	resolvedTheme: ResolvedTheme
	setPreference: (preference: ThemePreference) => void
}

const STORAGE_KEY = 'theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

const ThemeContext = createContext<ThemeContextValue | null>(null)

const readStoredPreference = (): ThemePreference => {
	try {
		const stored = localStorage.getItem(STORAGE_KEY)
		if (stored === 'light' || stored === 'dark' || stored === 'system') {
			return stored
		}
	} catch {
		// Storage can be blocked (private windows); the default is fine.
	}
	return 'system'
}

const subscribeToSystemTheme = (onChange: () => void): (() => void) => {
	const query = window.matchMedia(DARK_QUERY)
	query.addEventListener('change', onChange)
	return () => query.removeEventListener('change', onChange)
}

const systemTheme = (): ResolvedTheme =>
	window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'

/** Applies a theme to the page, which Tailwind's `dark:` variants read. */
const applyTheme = (theme: ResolvedTheme): void => {
	const root = document.documentElement
	root.classList.toggle('dark', theme === 'dark')
	root.classList.toggle('light', theme === 'light')
}

/**
 * The light/dark theme. The choice is remembered as chosen, `system`
 * included, and only `system` follows the operating system: a player who
 * picked dark keeps dark when their OS switches to light mode.
 */
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
	const [preference, setPreferenceState] =
		useState<ThemePreference>(readStoredPreference)
	const system = useSyncExternalStore(subscribeToSystemTheme, systemTheme)
	const resolvedTheme = preference === 'system' ? system : preference

	// Before paint, so the page never flashes the other theme.
	useLayoutEffect(() => {
		applyTheme(resolvedTheme)
	}, [resolvedTheme])

	const setPreference = useCallback((next: ThemePreference) => {
		setPreferenceState(next)
		try {
			localStorage.setItem(STORAGE_KEY, next)
		} catch {
			// Not remembered across visits, but still applied now.
		}
	}, [])

	const value = useMemo(
		() => ({ preference, resolvedTheme, setPreference }),
		[preference, resolvedTheme, setPreference]
	)

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useThemeContext = (): ThemeContextValue => {
	const context = useContext(ThemeContext)
	if (!context) {
		throw new Error('useThemeContext must be used within a ThemeProvider')
	}
	return context
}
