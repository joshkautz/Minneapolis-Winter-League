import type {
	ContributionStatus,
	PlayerSeasonDocument,
	SeasonDocument,
	TeamContributionDocument,
} from '@/types'

/**
 * Team payments in the App: which pricing a season uses, what that means for
 * a player's registration, and the money arithmetic the team payment card
 * shows.
 *
 * The rules mirror `Functions/src/shared/contributions.ts` and
 * `teamRegistrationService.ts`. They are here so the page can explain itself
 * and validate a form before a round trip — the server is still the only
 * check that counts. Change the rules there and here together.
 */

/** Stripe's contributions and a season's total are whole dollars. */
export const CENTS_PER_DOLLAR = 100

/** The smallest contribution, unless less than this is still owed. */
export const MIN_CONTRIBUTION_CENTS = 1_000

/** Players each team needs to have signed their waiver. */
export const MIN_SIGNED_PLAYERS = 10

/** Teams that can register in a season. */
export const REGISTRATION_SPOTS = 12

/**
 * Whether a season uses team-level pricing. Checked by type rather than
 * presence, as the server does, so a total cleared to null reads as the
 * per-player rule rather than a $0 total.
 */
export const usesTeamPayments = (
	season: Pick<SeasonDocument, 'teamRegistrationTotalCents'> | undefined
): season is SeasonDocument & { teamRegistrationTotalCents: number } =>
	typeof season?.teamRegistrationTotalCents === 'number'

/**
 * Whether a player counts toward their team's ten for the season.
 *
 * Under team payments a player registers by signing their waiver: the money
 * is the team's. Under per-player pricing they also have to have paid.
 */
export const isPlayerRegisteredForSeason = (
	playerSeason: Pick<PlayerSeasonDocument, 'paid' | 'signed'> | undefined,
	season: Pick<SeasonDocument, 'teamRegistrationTotalCents'> | undefined
): boolean => {
	if (!playerSeason?.signed) return false
	return usesTeamPayments(season) ? true : Boolean(playerSeason.paid)
}

/** What a set of contributions holds and has taken. */
export const totalsFrom = (
	contributions: Pick<TeamContributionDocument, 'status' | 'amountCents'>[]
): { authorizedCents: number; capturedCents: number } => {
	let authorizedCents = 0
	let capturedCents = 0
	for (const contribution of contributions) {
		if (contribution.status === 'authorized') {
			authorizedCents += contribution.amountCents
		} else if (contribution.status === 'captured') {
			capturedCents += contribution.amountCents
		}
	}
	return { authorizedCents, capturedCents }
}

/** Money committed toward the total: held or taken. */
export const committedCents = (
	contributions: Pick<TeamContributionDocument, 'status' | 'amountCents'>[]
): number => {
	const { authorizedCents, capturedCents } = totalsFrom(contributions)
	return authorizedCents + capturedCents
}

/**
 * What the team's current roster has committed: the figure the server
 * registers on and takes the remaining balance from
 * (`committedByRosterCents` in Functions). A teammate who left is being
 * released, so their money no longer counts.
 */
export const committedByRosterCents = (
	contributions: Pick<
		TeamContributionDocument,
		'status' | 'amountCents' | 'player'
	>[],
	rosterPlayerIds: ReadonlySet<string>
): number =>
	committedCents(
		contributions.filter((contribution) =>
			rosterPlayerIds.has(contribution.player.id)
		)
	)

/**
 * Why a proposed contribution would be refused, or null if it is fine.
 * The same rule the server applies: whole dollars, at least $10 unless less
 * is owed, and no more than the team still needs.
 */
export const contributionAmountError = (
	amountCents: number,
	remainingCents: number
): string | null => {
	if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
		return 'Enter an amount in dollars.'
	}
	if (amountCents % CENTS_PER_DOLLAR !== 0) {
		return 'Contributions are in whole dollars.'
	}
	const floor = Math.min(MIN_CONTRIBUTION_CENTS, remainingCents)
	if (amountCents < floor) {
		return `The minimum contribution is ${formatDollars(floor)}.`
	}
	if (amountCents > remainingCents) {
		return `Your team only needs ${formatDollars(remainingCents)} more.`
	}
	return null
}

/**
 * Suggested amounts for the contribution form: the whole remainder first,
 * then round amounts below it that the rule allows.
 */
export const suggestedContributionsCents = (
	remainingCents: number
): number[] => {
	if (remainingCents <= 0) return []
	const suggestions = [remainingCents]
	for (const amount of [50_000, 25_000, 10_000, 5_000]) {
		if (
			amount < remainingCents &&
			contributionAmountError(amount, remainingCents) === null
		) {
			suggestions.push(amount)
		}
	}
	return suggestions
}

/** `$1,000` for whole dollars, `$12.50` otherwise. */
export const formatDollars = (cents: number): string => {
	const dollars = cents / CENTS_PER_DOLLAR
	return dollars.toLocaleString('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
		maximumFractionDigits: 2,
	})
}

/** How each state of a contribution reads to the team. */
export const CONTRIBUTION_STATUS_LABELS: Record<ContributionStatus, string> = {
	authorized: 'Authorized',
	captured: 'Paid',
	canceled: 'Released',
	refunded: 'Refunded',
}
