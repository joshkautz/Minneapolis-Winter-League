import { useMemo } from 'react'
import { useSeasonsContext, useTeamsContext } from '@/providers'
import { useUserStatus } from '@/shared/hooks/use-user-status'
import { canonicalTeamIdFromTeamSeasonDoc } from '@/firebase/collections/teams'
import { usesTeamPayments } from '@/shared/utils'

/**
 * What leaving the team does to money put toward its registration, for the
 * confirmation shown before someone leaves or is removed. Null when the
 * season has no team payments.
 *
 * Mirrors settlement: before the team registers, a leaver's money is
 * released; after, registration is final and it stays with the team.
 */
export const useDeparturePaymentNote = (
	/** The person leaving, or null for the signed-in player themselves. */
	otherPlayerName: string | null = null
): string | null => {
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()
	const { currentSeasonTeamsQuerySnapshot } = useTeamsContext()
	const { currentSeasonData } = useUserStatus()
	const teamId = currentSeasonData?.team?.id

	const registered = useMemo(
		() =>
			currentSeasonTeamsQuerySnapshot?.docs
				.find((doc) => canonicalTeamIdFromTeamSeasonDoc(doc) === teamId)
				?.data().registered === true,
		[currentSeasonTeamsQuerySnapshot, teamId]
	)

	if (!usesTeamPayments(currentSeasonQueryDocumentSnapshot?.data())) {
		return null
	}

	const payer = otherPlayerName ?? 'you'
	if (registered) {
		return `The team has registered, so anything ${payer} paid toward it stays with the team.`
	}
	return otherPlayerName
		? `Anything ${otherPlayerName} paid toward the team's registration is released or refunded in full.`
		: `Anything you paid toward the team's registration is released or refunded in full.`
}
