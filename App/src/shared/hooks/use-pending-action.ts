import { useCallback, useRef, useState } from 'react'

/**
 * Tracks an async action a button starts, so the button can show that it is
 * working and cannot fire the action twice.
 *
 * Some results reach the page through a Firestore listener a moment after
 * the callable returns: an invitation is sent before its offer shows up in
 * the row that sent it. Pass `reflected` — whether the page already shows
 * the result — and a successful action stays pending until it does, so the
 * button goes from "Inviting..." straight to "Invited" instead of flashing
 * back to "Invite" in between. Without it, pending ends when the action
 * does.
 *
 * An action reports failure by resolving to `false` (it has already told
 * the user why). It should not throw: the handlers here catch and toast
 * their own errors, and a rejection would surface as unhandled from a click.
 */
export const usePendingAction = (
	reflected?: boolean
): {
	pending: boolean
	run: (action: () => Promise<boolean | void>) => Promise<void>
} => {
	const [running, setRunning] = useState(false)
	const [awaitingReflection, setAwaitingReflection] = useState(false)
	// State updates are not synchronous, so two clicks in the same tick would
	// both see `running` as false. The ref closes that gap.
	const inFlight = useRef(false)

	// Adjusting state while rendering, rather than in an effect, so the
	// button never renders a frame in the stale state.
	if (awaitingReflection && reflected !== false) {
		setAwaitingReflection(false)
	}

	const run = useCallback(async (action: () => Promise<boolean | void>) => {
		if (inFlight.current) return
		inFlight.current = true
		setRunning(true)
		try {
			const succeeded = (await action()) !== false
			if (succeeded) setAwaitingReflection(true)
		} finally {
			inFlight.current = false
			setRunning(false)
		}
	}, [])

	return { pending: running || awaitingReflection, run }
}
