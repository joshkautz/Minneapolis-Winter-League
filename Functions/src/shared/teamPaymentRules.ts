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
