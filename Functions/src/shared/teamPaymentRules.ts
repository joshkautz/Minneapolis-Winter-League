/**
 * The numbers a team's registration turns on: the smallest contribution, the
 * signed players a team needs and the spots in a season.
 *
 * The App imports this file (`App/src/shared/utils/team-payments.ts`) so the
 * team payment card and the registration pages state the same limits the
 * server enforces. Keep it free of imports: it is loaded from the other
 * workspace.
 */

/**
 * Smallest team contribution accepted, in cents, unless less than this is
 * still owed. Below it the card processing fee takes a disproportionate
 * share of the money.
 */
export const MIN_CONTRIBUTION_CENTS = 1_000

/** Players a team needs to have signed the waiver to register. */
export const MIN_SIGNED_PLAYERS = 10

/** Teams that can register in a season; registration locks at this count. */
export const REGISTRATION_SPOTS = 12

/**
 * Last season's teams that finished in these places have a spot held for
 * them in the next season, as a reward: 1st, 2nd and 3rd.
 */
export const HELD_SPOT_PLACEMENTS = 3

/** How long, from registration opening, a held spot waits for its team. */
export const HELD_SPOT_DAYS = 7

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * When a season's held spots stop being held, in epoch milliseconds: a week
 * after registration opens, or when it closes, if that is sooner.
 */
export function heldSpotsEndMs(season: {
	registrationStartMs: number
	registrationEndMs: number
}): number {
	return Math.min(
		season.registrationStartMs + HELD_SPOT_DAYS * MS_PER_DAY,
		season.registrationEndMs
	)
}

/**
 * Whether a team that qualifies can take a spot: one is free once the
 * spots claimed and those held for other teams are counted. A team's own
 * held spot is never counted against it, so a held team always gets in
 * while its spot is held.
 */
export function hasOpenSpot(state: {
	spotsClaimed: number
	/** Spots still held for teams other than this one. */
	spotsHeldForOthers: number
}): boolean {
	return state.spotsClaimed + state.spotsHeldForOthers < REGISTRATION_SPOTS
}
