import { describe, expect, it } from 'vitest'
import { FieldValue } from 'firebase-admin/firestore'
import { nameHistoryEntry, nameSnapshot } from './nameHistory.js'

const name = (
	firstname: string,
	lastname: string,
	nickname: string | null
) => ({
	firstname,
	lastname,
	nickname,
})

describe('nameSnapshot', () => {
	it('reads a player without a nickname as having none', () => {
		expect(nameSnapshot({ firstname: 'John', lastname: 'Lei' })).toEqual(
			name('John', 'Lei', null)
		)
	})
})

describe('nameHistoryEntry', () => {
	it('records a change with the name before and after, and who made it', () => {
		expect(
			nameHistoryEntry(
				name('John', 'Lei', null),
				name('Zheng', 'Of Addie', null),
				'player-1',
				'player'
			)
		).toEqual({
			before: name('John', 'Lei', null),
			after: name('Zheng', 'Of Addie', null),
			changedBy: 'player-1',
			source: 'player',
			changedAt: FieldValue.serverTimestamp(),
		})
	})

	it('records a nickname change on its own', () => {
		expect(
			nameHistoryEntry(
				name('John', 'Lei', null),
				name('John', 'Lei', 'Addie'),
				'player-1',
				'player'
			)
		).not.toBeNull()
	})

	it('records nothing when nothing changed', () => {
		expect(
			nameHistoryEntry(
				name('John', 'Lei', 'Addie'),
				name('John', 'Lei', 'Addie'),
				'player-1',
				'player'
			)
		).toBeNull()
	})

	it('records the name given at sign-up, which has nothing before it', () => {
		expect(
			nameHistoryEntry(null, name('John', 'Lei', null), 'player-1', 'signup')
		).toMatchObject({ before: null, source: 'signup' })
	})
})
