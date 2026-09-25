/**
 * Vitest global setup.
 *
 * Runs before every test file (wired up via `test.setupFiles` in
 * vite.config.ts).
 */

import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { setLogLevel } from 'firebase/firestore'

/**
 * Tests that mount the app shell open real Firestore listeners, which try to
 * reach a backend that is not there and log a warning each time the
 * connection fails, on the SDK's own schedule. One landing as a test file
 * finished failed the run ("Closing rpc while onUserConsoleLog was
 * pending") about one time in six. Nothing a test asserts depends on the
 * SDK's logging, so it is silenced. Firestore's own `setLogLevel`, not
 * `firebase/app`'s: that one only reaches loggers that already exist, and
 * Firestore creates its logger when it loads.
 */
setLogLevel('silent')

/**
 * jsdom implements no CSS Object Model media queries, so `window.matchMedia`
 * is simply absent. ThemeProvider and the `use-mobile` hook both call it during
 * mount, which takes down any test that renders the app shell. The stub always
 * reports "does not match", i.e. light theme and desktop width.
 */
Object.defineProperty(window, 'matchMedia', {
	writable: true,
	value: (query: string): MediaQueryList =>
		({
			matches: false,
			media: query,
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn(),
		}) as unknown as MediaQueryList,
})

/**
 * Observed by Radix primitives and the carousel; jsdom ships neither.
 */
Object.defineProperty(window, 'ResizeObserver', {
	writable: true,
	value: class {
		observe = vi.fn()
		unobserve = vi.fn()
		disconnect = vi.fn()
	},
})

// Testing Library's auto-cleanup only runs when a global afterEach exists.
afterEach(() => {
	cleanup()
})
