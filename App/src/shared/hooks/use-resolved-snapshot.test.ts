import { describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useResolvedSnapshot } from './use-resolved-snapshot'

describe('useResolvedSnapshot', () => {
	it('reports processing until the first resolve settles', async () => {
		let release!: (rows: string[]) => void
		const pending = new Promise<string[]>((resolve) => {
			release = resolve
		})

		const { result } = renderHook(() =>
			useResolvedSnapshot('snap-a', () => pending)
		)

		expect(result.current.isProcessing).toBe(true)
		expect(result.current.items).toEqual([])

		await act(async () => {
			release(['a1'])
			await pending
		})

		expect(result.current.isProcessing).toBe(false)
		expect(result.current.items).toEqual(['a1'])
	})

	it('is idle with no items when the snapshot is undefined', () => {
		const { result } = renderHook(() =>
			useResolvedSnapshot(undefined, async () => ['never'])
		)

		expect(result.current.isProcessing).toBe(false)
		expect(result.current.items).toEqual([])
	})

	it('ignores a stale resolve that settles after a newer snapshot arrives', async () => {
		// The bug this hook exists to prevent: the first (slow) resolve
		// settling last and overwriting the newer snapshot's rows.
		let releaseFirst!: (rows: string[]) => void
		const first = new Promise<string[]>((r) => {
			releaseFirst = r
		})
		const second = Promise.resolve(['from-second'])

		const { result, rerender } = renderHook(
			({ snap }: { snap: string }) =>
				useResolvedSnapshot(snap, (s) => (s === 'snap-a' ? first : second)),
			{ initialProps: { snap: 'snap-a' } }
		)

		rerender({ snap: 'snap-b' })
		await waitFor(() => expect(result.current.items).toEqual(['from-second']))

		// The first snapshot's resolve now settles, late.
		await act(async () => {
			releaseFirst(['from-first'])
			await first
		})

		expect(result.current.items).toEqual(['from-second'])
		expect(result.current.isProcessing).toBe(false)
	})

	it('clears items while a new snapshot is being resolved', async () => {
		const { result, rerender } = renderHook(
			({ snap }: { snap: string }) =>
				useResolvedSnapshot(snap, async (s) => [`rows-for-${s}`]),
			{ initialProps: { snap: 'snap-a' } }
		)

		await waitFor(() =>
			expect(result.current.items).toEqual(['rows-for-snap-a'])
		)

		rerender({ snap: 'snap-b' })
		// Stale rows must not linger under the new snapshot.
		expect(result.current.items).toEqual([])
		expect(result.current.isProcessing).toBe(true)

		await waitFor(() =>
			expect(result.current.items).toEqual(['rows-for-snap-b'])
		)
	})
})
