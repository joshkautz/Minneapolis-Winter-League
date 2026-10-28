/**
 * What running a season costs, shown on the home page so players can see
 * where their team fee goes. Taken from the league's budget spreadsheet;
 * update `LEAGUE_COSTS` from it each season.
 *
 * The four cost categories are the spreadsheet's, grouped: everything the
 * website runs on — hosting, the domain, email and card processing,
 * including Stripe's dispute fees — is "Website". Whatever the fees bring
 * in beyond the costs is the league reserve.
 */

export interface CostCategory {
	name: string
	description: string
	/** The season's total, in cents. */
	seasonCents: number
}

export const LEAGUE_COSTS = {
	seasonName: 'Season 5',
	teams: 12,
	teamFeeCents: 100_000,
	costs: [
		{
			name: 'Facility',
			description:
				'Renting the fields at URW Sports Field Complex for every game night',
			seasonCents: 912_018,
		},
		{
			name: 'Insurance',
			description: 'The league’s liability insurance',
			seasonCents: 17_600,
		},
		{
			name: 'Equipment',
			description: 'Cones, scoreboards and discs',
			seasonCents: 10_000,
		},
		{
			name: 'Website',
			description:
				'Hosting, the domain, email, and card processing and dispute fees',
			// Stripe fees $351.60 and disputes $100, email $60, hosting $20,
			// domain $20.
			seasonCents: 55_160,
		},
	] satisfies CostCategory[],
	reserve: {
		name: 'League reserve',
		description:
			'Kept for future seasons and the unexpected: deposits, refunds, a cancelled night',
	},
} as const

/** One line of the breakdown, per team and for the season. */
export interface CostLine {
	name: string
	description: string
	perTeamCents: number
	seasonCents: number
	/** The share of a team's fee, 0–1. */
	share: number
	isReserve: boolean
}

/**
 * The breakdown, largest cost first and the reserve last. Each cost is
 * split evenly across the teams to the cent; the reserve is what remains
 * of the fee, so the lines add up to it exactly.
 */
export function costBreakdown(costs = LEAGUE_COSTS): CostLine[] {
	const lines: CostLine[] = [...costs.costs]
		.sort((a, b) => b.seasonCents - a.seasonCents)
		.map((cost) => {
			const perTeamCents = Math.round(cost.seasonCents / costs.teams)
			return {
				name: cost.name,
				description: cost.description,
				perTeamCents,
				seasonCents: cost.seasonCents,
				share: perTeamCents / costs.teamFeeCents,
				isReserve: false,
			}
		})
	const spentPerTeam = lines.reduce((sum, line) => sum + line.perTeamCents, 0)
	const spentSeason = lines.reduce((sum, line) => sum + line.seasonCents, 0)
	const reservePerTeam = costs.teamFeeCents - spentPerTeam
	return [
		...lines,
		{
			name: costs.reserve.name,
			description: costs.reserve.description,
			perTeamCents: reservePerTeam,
			seasonCents: costs.teamFeeCents * costs.teams - spentSeason,
			share: reservePerTeam / costs.teamFeeCents,
			isReserve: true,
		},
	]
}
