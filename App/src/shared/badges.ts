/**
 * Every badge a team can earn, imported from
 * `Functions/src/badges/catalog.ts` so the team page names and describes
 * each one in the words the rules award it by. That file has no imports,
 * which is what makes loading it from the other workspace safe.
 */

import type { BadgeTier } from '../../../Functions/src/badges/catalog'

export {
	BADGES,
	type BadgeDefinition,
	type BadgeTier,
} from '../../../Functions/src/badges/catalog'

/** A badge's artwork, drawn by scripts/badge-art and served with the site. */
export const badgeImageUrl = (badgeId: string): string =>
	`/badges/${badgeId}.webp`

export const TIER_LABELS: Readonly<Record<BadgeTier, string>> = {
	rare: 'Rare',
	uncommon: 'Uncommon',
	common: 'Common',
	fall: 'Fall',
}
