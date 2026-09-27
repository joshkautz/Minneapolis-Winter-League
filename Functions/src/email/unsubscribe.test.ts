import { describe, expect, it } from 'vitest'
import {
	isOptionalCategory,
	maskEmail,
	oneClickUnsubscribeUrl,
	preferencesOf,
	preferencesPageUrl,
	tokenMatches,
} from './unsubscribe.js'

describe('preferencesOf', () => {
	it('sends everything to a player who has changed nothing', () => {
		expect(preferencesOf({ email: 'a@example.com' })).toEqual({
			announcements: true,
			registration: true,
			teams: true,
		})
		expect(preferencesOf(undefined)).toEqual({
			announcements: true,
			registration: true,
			teams: true,
		})
	})

	it('turns off only what the player turned off', () => {
		expect(
			preferencesOf({
				email: 'a@example.com',
				emailPreferences: { announcements: false, teams: true },
			})
		).toEqual({ announcements: false, registration: true, teams: true })
	})
})

describe('isOptionalCategory', () => {
	it.each(['announcements', 'registration', 'teams'])('accepts %s', (c) => {
		expect(isOptionalCategory(c)).toBe(true)
	})

	it.each(['account', '', 'Announcements', undefined, 1, null])(
		'refuses %s, which a player cannot turn off or does not exist',
		(c) => {
			expect(isOptionalCategory(c)).toBe(false)
		}
	)
})

describe('links', () => {
	it('sends a person to the preferences page on the site', () => {
		const url = new URL(preferencesPageUrl('p1', 'tok', 'announcements'))
		expect(url.origin).toBe('https://mplswinterleague.com')
		expect(url.pathname).toBe('/email-preferences')
		expect(Object.fromEntries(url.searchParams)).toEqual({
			p: 'p1',
			t: 'tok',
			c: 'announcements',
		})
	})

	it('points mail apps at the one-click endpoint, over HTTPS as RFC 8058 requires', () => {
		const url = new URL(oneClickUnsubscribeUrl('p1', 'tok', 'teams'))
		expect(url.protocol).toBe('https:')
		expect(url.origin).toBe('https://mplswinterleague.com')
		expect(url.pathname).toBe('/unsubscribe')
		expect(Object.fromEntries(url.searchParams)).toEqual({
			p: 'p1',
			t: 'tok',
			c: 'teams',
		})
	})

	it('encodes a token safely in the URL', () => {
		const url = new URL(preferencesPageUrl('p1', 'a+b/c=', 'teams'))
		expect(url.searchParams.get('t')).toBe('a+b/c=')
	})
})

describe('tokenMatches', () => {
	const contact = { email: 'a@example.com', unsubscribeToken: 'secret-token' }

	it('accepts the player’s own token', () => {
		expect(tokenMatches(contact, 'secret-token')).toBe(true)
	})

	it.each([
		['a wrong token', 'secret-tokex'],
		['a shorter one', 'secret'],
		['a longer one', 'secret-token-and-more'],
		['an empty one', ''],
	])('refuses %s', (_label, token) => {
		expect(tokenMatches(contact, token)).toBe(false)
	})

	it('refuses everything for a player who has never been sent email', () => {
		expect(tokenMatches({ email: 'a@example.com' }, '')).toBe(false)
		expect(tokenMatches(undefined, 'anything')).toBe(false)
	})
})

describe('maskEmail', () => {
	it.each([
		['josh@mplsmallard.com', 'j•••@mplsmallard.com'],
		['a@b.co', 'a•••@b.co'],
		['not-an-email', '•••'],
	])('masks %s as %s', (email, masked) => {
		expect(maskEmail(email)).toBe(masked)
	})
})
