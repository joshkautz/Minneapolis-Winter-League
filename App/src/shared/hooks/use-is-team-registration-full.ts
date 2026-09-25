import { useMemo } from 'react'
import { useTeamsContext } from '@/providers'
import { REGISTRATION_SPOTS } from '@/shared/utils'

/**
 * Whether every registration spot this season is taken, so the page can say
 * so before a captain tries to create or roll over a team. The callables
 * enforce the limit; this only explains it.
 */
export const useIsTeamRegistrationFull = (): boolean => {
	const { currentSeasonTeamsQuerySnapshot } = useTeamsContext()
	return useMemo(() => {
		const registeredTeams =
			currentSeasonTeamsQuerySnapshot?.docs.filter(
				(teamDoc) => teamDoc.data().registered === true
			).length ?? 0
		return registeredTeams >= REGISTRATION_SPOTS
	}, [currentSeasonTeamsQuerySnapshot])
}
