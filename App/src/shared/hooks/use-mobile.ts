import * as React from 'react'

const MOBILE_BREAKPOINT = 768

const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

const subscribe = (onChange: () => void): (() => void) => {
	const mql = window.matchMedia(QUERY)
	mql.addEventListener('change', onChange)
	return () => mql.removeEventListener('change', onChange)
}

const getSnapshot = (): boolean => window.matchMedia(QUERY).matches

// Rendered on the server / in a non-DOM environment there is no viewport to
// measure; assume desktop, matching the previous `undefined` default.
const getServerSnapshot = (): boolean => false

/**
 * Tracks whether the viewport is below the mobile breakpoint.
 *
 * Uses useSyncExternalStore rather than an effect that seeds state on mount.
 * The effect version rendered once with a stale value and then immediately
 * set state, which React 19 flags as a cascading render — and it briefly
 * reported "not mobile" on a phone during that first paint.
 */
export function useIsMobile(): boolean {
	return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
