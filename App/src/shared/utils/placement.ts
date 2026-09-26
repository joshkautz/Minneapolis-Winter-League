/**
 * A number with its English ordinal suffix: 1st, 2nd, 3rd, 4th, 11th, 21st.
 * The teens take "th" (11th, 12th, 13th, 111th), so the check is on the last
 * two digits, not the number.
 */
export const ordinal = (position: number): string => {
	const lastTwo = position % 100
	if (lastTwo >= 11 && lastTwo <= 13) return `${position}th`
	switch (position % 10) {
		case 1:
			return `${position}st`
		case 2:
			return `${position}nd`
		case 3:
			return `${position}rd`
		default:
			return `${position}th`
	}
}

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

/** Where a team finished a season, with a medal for the top three. */
export const formatPlacement = (placement: number | null): string => {
	if (placement === null) return 'TBD'
	const medal = MEDALS[placement]
	return medal ? `${ordinal(placement)} ${medal}` : ordinal(placement)
}
