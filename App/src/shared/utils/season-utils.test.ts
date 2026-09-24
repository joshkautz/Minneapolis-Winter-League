import { describe, expect, it } from 'vitest'
import type { QuerySnapshot, DocumentReference } from 'firebase/firestore'
import type { PlayerSeasonDocument, SeasonDocument } from '@/types'
import {
	didPlayerPayPreviousSeason,
	initialSelectedSeasonId,
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

describe('initialSelectedSeasonId', () => {
	// Which season a visitor sees on arrival. Remembering the automatic
	// default as though it were a choice once pinned every returning visitor
	// to whichever season was newest on their first visit.
	const seasonIds = ['fall-2026', 'spring-2026', 'fall-2025']
	const newestId = 'fall-2026'

	it('shows the newest season on a first visit', () => {
		expect(
			initialSelectedSeasonId({
				pickedId: null,
				pickedWhileNewestId: null,
				newestId,
				seasonIds,
			})
		).toBe('fall-2026')
	})

	it('keeps an older season the visitor picked while it is still the latest pick', () => {
		expect(
			initialSelectedSeasonId({
				pickedId: 'fall-2025',
				pickedWhileNewestId: 'fall-2026',
				newestId,
				seasonIds,
			})
		).toBe('fall-2025')
	})

	it('drops a pick once a newer season has been created', () => {
		// Picked Spring while Spring was newest; Fall has since been added.
		expect(
			initialSelectedSeasonId({
				pickedId: 'spring-2026',
				pickedWhileNewestId: 'spring-2026',
				newestId,
				seasonIds,
			})
		).toBe('fall-2026')
	})

	it('treats a pick stored before this rule as stale', () => {
		// Every visitor before the fix: a season id with no record of what
		// was newest. They were pinned by the old default, not by choice.
		expect(
			initialSelectedSeasonId({
				pickedId: 'spring-2026',
				pickedWhileNewestId: null,
				newestId,
				seasonIds,
			})
		).toBe('fall-2026')
	})

	it('ignores a picked season that no longer exists', () => {
		expect(
			initialSelectedSeasonId({
				pickedId: 'deleted-season',
				pickedWhileNewestId: 'fall-2026',
				newestId,
				seasonIds,
			})
		).toBe('fall-2026')
	})

	it('has nothing to show before any season exists', () => {
		expect(
			initialSelectedSeasonId({
				pickedId: null,
				pickedWhileNewestId: null,
				newestId: undefined,
				seasonIds: [],
			})
		).toBeUndefined()
	})
})
