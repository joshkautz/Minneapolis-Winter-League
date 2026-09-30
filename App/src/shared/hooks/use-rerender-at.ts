import { useEffect, useState } from 'react'

/**
 * setTimeout's longest delay; a later moment is waited for in steps.
 */
const MAX_DELAY_MS = 2 ** 31 - 1

/** Past the moment itself, so a comparison made on re-render sees it passed. */
const SETTLE_MS = 250

/**
 * Re-renders the component when the soonest of `moments` (epoch ms) arrives,
 * then waits for the next. For state that changes with the clock alone —
 * registration opening or closing, a reservation expiring — which no
 * Firestore listener would otherwise redraw.
 */
export const useRerenderAt = (moments: number[]): void => {
	// Each firing bumps this, which reschedules for the moment after.
	const [tick, setTick] = useState(0)
	// A stable key, so a new array with the same moments does not reschedule.
	const key = [...moments].sort((a, b) => a - b).join(',')

	useEffect(() => {
		const next = key
			.split(',')
			.filter(Boolean)
			.map(Number)
			.find((moment) => moment > Date.now())
		if (next === undefined) return
		const delay = Math.min(next - Date.now() + SETTLE_MS, MAX_DELAY_MS)
		const timer = setTimeout(() => setTick((tick) => tick + 1), delay)
		return () => clearTimeout(timer)
	}, [key, tick])
}
