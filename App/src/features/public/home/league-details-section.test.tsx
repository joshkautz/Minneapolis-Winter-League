import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The home page's season card, from the season document: Season 5's name,
 * nights, Thanksgiving break, length and fee, and the registration rules'
 * team limits. They were typed into the page and went stale each season.
 */

const SEASON_5 = {
	name: 'Season 5',
	dateStart: { toDate: () => new Date('2026-11-07T06:00:00Z') },
	dateEnd: { toDate: () => new Date('2026-12-20T06:00:00Z') },
	teamRegistrationTotalCents: 100_000,
}

vi.mock('@/providers', () => ({
	useSeasonsContext: () => ({
		currentSeasonQueryDocumentSnapshot: { data: () => SEASON_5 },
	}),
}))

import { LeagueDetailsSection } from './league-details-section'

const renderSection = () =>
	render(
		<MemoryRouter>
			<LeagueDetailsSection />
		</MemoryRouter>
	)

describe('LeagueDetailsSection', () => {
	it('states the season’s nights and break from its dates', () => {
		renderSection()
		expect(screen.getByText('Season 5')).toBeInTheDocument()
		expect(
			screen.getByText(
				/Saturdays, November 7th, 14th, 21st and December 5th, 12th, 19th\. No games November 28th\./
			)
		).toBeInTheDocument()
	})

	it('prices the season from its fee and length', () => {
		renderSection()
		expect(
			screen.getByText(/\$1,000 per team for 6 weeks of games/)
		).toBeInTheDocument()
		expect(screen.getByText(/first games start at 6:00pm/)).toBeInTheDocument()
	})

	it('states the team limits from the registration rules', () => {
		renderSection()
		expect(screen.getByText('12 teams')).toBeInTheDocument()
		expect(screen.getByText('10-player minimum')).toBeInTheDocument()
		expect(
			screen.getByText(/The first 12 teams to do both are in/)
		).toBeInTheDocument()
	})
})
