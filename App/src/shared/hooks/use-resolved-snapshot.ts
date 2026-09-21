import { useEffect, useRef, useState } from 'react'

/**
 * Resolves a Firestore snapshot into display rows asynchronously.
 *
 * Several admin screens take a query snapshot, follow the DocumentReferences
 * on each document (creator, player, team) and render the joined result. The
 * hand-rolled version of that had two problems:
 *
 *  - It called `setIsProcessing(true)` synchronously inside the effect, which
 *    React 19 flags as a cascading render (`react-hooks/set-state-in-effect`).
 *  - It had no cancellation. When the snapshot changed while a resolve was
 *    still in flight, whichever promise settled last won — so an older
 *    snapshot could overwrite a newer one and leave stale rows on screen.
 *
 * Here the resolved rows are stored together with the snapshot they came
 * from, so `items` and `isProcessing` are both derived: results belonging to
 * a superseded snapshot are ignored rather than rendered.
 *
 * `resolve` is read through a ref, so it does not need to be memoized by the
 * caller and the resolve only re-runs when `snapshot` itself changes.
 */
export function useResolvedSnapshot<Snapshot, Row>(
	snapshot: Snapshot | null | undefined,
	resolve: (snapshot: Snapshot) => Promise<Row[]>
): { items: Row[]; isProcessing: boolean } {
	const resolveRef = useRef(resolve)

	// Declared before the resolving effect so the ref is current by the time
	// that effect runs on a later render.
	useEffect(() => {
		resolveRef.current = resolve
	})

	const [resolved, setResolved] = useState<{
		source: Snapshot
		items: Row[]
	} | null>(null)

	useEffect(() => {
		if (snapshot === null || snapshot === undefined) {
			return
		}

		let cancelled = false

		const run = async (): Promise<void> => {
			const items = await resolveRef.current(snapshot)
			if (!cancelled) {
				setResolved({ source: snapshot, items })
			}
		}

		void run()

		return () => {
			cancelled = true
		}
	}, [snapshot])

	const hasCurrentResult = resolved !== null && resolved.source === snapshot

	return {
		items: hasCurrentResult ? resolved.items : [],
		isProcessing:
			snapshot !== null && snapshot !== undefined && !hasCurrentResult,
	}
}
