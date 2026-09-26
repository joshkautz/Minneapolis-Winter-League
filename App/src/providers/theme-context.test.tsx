import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ThemeProvider, useThemeContext } from './theme-context'

/**
 * The theme follows the operating system only when the player chose
 * "System", and remembers that choice itself rather than whatever it
 * resolved to at the time.
 */

let systemIsDark = false
const listeners = new Set<() => void>()

const setSystemDark = (dark: boolean) => {
	systemIsDark = dark
	listeners.forEach((listener) => listener())
}

const originalMatchMedia = window.matchMedia

beforeEach(() => {
	localStorage.clear()
	document.documentElement.className = ''
	systemIsDark = false
	listeners.clear()
	window.matchMedia = ((query: string) => ({
		get matches() {
			return systemIsDark
		},
		media: query,
		addEventListener: (_: string, listener: () => void) =>
			listeners.add(listener),
		removeEventListener: (_: string, listener: () => void) =>
			listeners.delete(listener),
	})) as unknown as typeof window.matchMedia
})

afterEach(() => {
	window.matchMedia = originalMatchMedia
})

const wrapper = ({ children }: { children: ReactNode }) => (
	<ThemeProvider>{children}</ThemeProvider>
)

const renderTheme = () => renderHook(() => useThemeContext(), { wrapper })

describe('ThemeProvider', () => {
	it('starts on System and follows the operating system', () => {
		const { result } = renderTheme()
		expect(result.current.preference).toBe('system')
		expect(result.current.resolvedTheme).toBe('light')

		act(() => setSystemDark(true))

		expect(result.current.resolvedTheme).toBe('dark')
		expect(document.documentElement.classList.contains('dark')).toBe(true)
	})

	it('keeps an explicit choice when the operating system changes', () => {
		const { result } = renderTheme()
		act(() => result.current.setPreference('dark'))

		act(() => setSystemDark(false))

		expect(result.current.resolvedTheme).toBe('dark')
		expect(document.documentElement.classList.contains('dark')).toBe(true)
	})

	it('remembers System itself, not what it resolved to', () => {
		const { result } = renderTheme()
		act(() => result.current.setPreference('light'))
		act(() => result.current.setPreference('system'))

		expect(localStorage.getItem('theme')).toBe('system')
	})

	it('restores the remembered choice on the next visit', () => {
		localStorage.setItem('theme', 'dark')
		const { result } = renderTheme()
		expect(result.current.preference).toBe('dark')
		expect(document.documentElement.classList.contains('dark')).toBe(true)
	})

	it('ignores a stored value it does not recognise', () => {
		localStorage.setItem('theme', 'sepia')
		const { result } = renderTheme()
		expect(result.current.preference).toBe('system')
	})

	it('refuses to be used outside the provider', () => {
		expect(() => renderHook(() => useThemeContext())).toThrow(
			'useThemeContext must be used within a ThemeProvider'
		)
	})
})
