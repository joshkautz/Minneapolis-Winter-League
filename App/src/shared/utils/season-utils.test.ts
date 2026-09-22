import { describe, expect, it } from 'vitest'
import type { QuerySnapshot, DocumentReference } from 'firebase/firestore'
import type { PlayerSeasonDocument, SeasonDocument } from '@/types'
import {
	didPlayerPayPreviousSeason,
	isPlayerCaptainForSeason,
	isPlayerPaidForSeason,
	isPlayerSignedForSeason,
} from './season-utils'

/**
 * These decide whether the UI offers captain controls, shows a player as
 * registered, or applies the returning-player discount. They read a
 * subcollection snapshot keyed by season id, so the failure mode that matters
 * is a season id that is absent from the snapshot — which must read as false,
 * not throw.
 */

/** Builds a QuerySnapshot whose docs are keyed by season id. */
const seasonsSnapshot = (
	entries: Record<string, Partial<PlayerSeasonDocument>>
): QuerySnapshot<PlayerSeasonDocument> =>
	({
		docs: Object.entries(entries).map(([id, data]) => ({
			id,
			data: () => data as PlayerSeasonDocument,
		})),
	}) as unknown as QuerySnapshot<PlayerSeasonDocument>

const seasonRef = (id: string): DocumentReference<SeasonDocument> =>
	({ id }) as DocumentReference<SeasonDocument>

/** allSeasonsSnapshot is ordered dateStart descending: index 1 is "previous". */
const allSeasons = (...ids: string[]): QuerySnapshot<SeasonDocument> =>
	({
		docs: ids.map((id) => ({ id })),
	}) as unknown as QuerySnapshot<SeasonDocument>

describe.each([
	['isPlayerCaptainForSeason', isPlayerCaptainForSeason, 'captain'],
	['isPlayerPaidForSeason', isPlayerPaidForSeason, 'paid'],
	['isPlayerSignedForSeason', isPlayerSignedForSeason, 'signed'],
] as const)('%s', (_name, fn, field) => {
	it(`is true when ${field} is set for that season`, () => {
		const snap = seasonsSnapshot({ s1: { [field]: true } })
		expect(fn(snap, seasonRef('s1'))).toBe(true)
	})

	it(`is false when ${field} is false`, () => {
		const snap = seasonsSnapshot({ s1: { [field]: false } })
		expect(fn(snap, seasonRef('s1'))).toBe(false)
	})

	it('is false when the season has no subdoc', () => {
		const snap = seasonsSnapshot({ s1: { [field]: true } })
		expect(fn(snap, seasonRef('s2'))).toBe(false)
	})

	it('is false when the snapshot is undefined', () => {
		expect(fn(undefined, seasonRef('s1'))).toBe(false)
	})

	it('is false when no season is selected', () => {
		const snap = seasonsSnapshot({ s1: { [field]: true } })
		expect(fn(snap, undefined)).toBe(false)
	})

	it('does not leak another season’s status', () => {
		// The bug this guards: reading the first subdoc instead of matching
		// on id would report last season's captaincy for this season.
		const snap = seasonsSnapshot({
			s1: { [field]: true },
			s2: { [field]: false },
		})
		expect(fn(snap, seasonRef('s2'))).toBe(false)
	})
})

describe('didPlayerPayPreviousSeason', () => {
	it('is true when the player paid for the second-newest season', () => {
		const snap = seasonsSnapshot({
			current: { paid: false },
			prev: { paid: true },
		})
		expect(
			didPlayerPayPreviousSeason(snap, allSeasons('current', 'prev'))
		).toBe(true)
	})

	it('is false when the player did not pay for it', () => {
		const snap = seasonsSnapshot({
			current: { paid: true },
			prev: { paid: false },
		})
		expect(
			didPlayerPayPreviousSeason(snap, allSeasons('current', 'prev'))
		).toBe(false)
	})

	it('ignores the current season, however it is set', () => {
		// Paying for the current season must not earn the returning discount.
		const snap = seasonsSnapshot({ current: { paid: true } })
		expect(
			didPlayerPayPreviousSeason(snap, allSeasons('current', 'prev'))
		).toBe(false)
	})

	it('is false in the inaugural season, when there is no previous one', () => {
		const snap = seasonsSnapshot({ current: { paid: true } })
		expect(didPlayerPayPreviousSeason(snap, allSeasons('current'))).toBe(false)
	})

	it('is false when either snapshot is missing', () => {
		const snap = seasonsSnapshot({ prev: { paid: true } })
		expect(didPlayerPayPreviousSeason(undefined, allSeasons('c', 'prev'))).toBe(
			false
		)
		expect(didPlayerPayPreviousSeason(snap, undefined)).toBe(false)
	})
})
