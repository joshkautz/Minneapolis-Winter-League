import { FC, ReactNode, createContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextValue {
	theme: 'light' | 'dark'
	setTheme: (value: Theme) => void
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(
	undefined
)

const getInitialPreference = () => {
	return window.matchMedia &&
		window.matchMedia('(prefers-color-scheme: dark)').matches
		? 'dark'
		: 'light'
}

const getInitialTheme = () => {
	const storedTheme = localStorage.getItem('theme')
	const root = document.documentElement
	if (storedTheme === 'dark' || storedTheme === 'light') {
		root.classList.add(storedTheme)
		return storedTheme
	}
	root.classList.add(getInitialPreference())
	return getInitialPreference()
}

export const ThemeProvider: FC<{ children: ReactNode }> = ({ children }) => {
	const [systemPreference, setSystemPreference] = useState<'light' | 'dark'>(
		() => getInitialPreference()
	)
	const [theme, setTheme] = useState<'light' | 'dark'>(() => getInitialTheme())

	const handleSetTheme = (input: Theme) => {
		const value = input === 'system' ? systemPreference : input
		const root = document.documentElement
		const isDark = value === 'dark'

		root.classList.toggle('light', !isDark)
		root.classList.toggle('dark', isDark)

		setTheme(value)
		localStorage.setItem('theme', value)
	}

	useEffect(() => {
		const updateSystemPreference = (event: MediaQueryListEvent) => {
			const newPreference = event.matches ? 'dark' : 'light'
			if (newPreference !== systemPreference) {
				setSystemPreference(newPreference)
				if (newPreference !== theme) {
					handleSetTheme(newPreference)
				}
			}
		}

		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
		mediaQuery.addEventListener('change', updateSystemPreference)

		return () => {
			mediaQuery.removeEventListener('change', updateSystemPreference)
		}
	}, [systemPreference])

	return (
		<ThemeContext.Provider value={{ theme, setTheme: handleSetTheme }}>
			{children}
		</ThemeContext.Provider>
	)
}
