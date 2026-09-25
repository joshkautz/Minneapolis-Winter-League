import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { getDocs } from 'firebase/firestore'
import { logger } from '@/shared/utils'
import { useResolvedSnapshot } from '@/shared/hooks'
import {
	RolloverTeamFormData,
	rolloverTeamFormSchema,
} from '@/shared/utils/validation'
import { rolloverTeamViaFunction } from '@/firebase/collections/functions'
import {
	canonicalTeamIdFromTeamSeasonDoc,
	teamSeasonsQuery,
} from '@/firebase/collections/teams'
import { useTeamsContext, useSeasonsContext } from '@/providers'
import type { TeamCreationResult } from './use-team-creation'

interface UseRolloverTeamFormProps {
	handleResult: (result: TeamCreationResult) => void
	seasonId: string
}

/** A captained team and every season it has played, as fetched. */
interface CaptainTeamHistory {
	canonicalTeamId: string
	seasons: { seasonId: string | undefined; name: string }[]
}

/**
 * One row in the rollover-eligible team list shown in the dropdown.
 */
export interface RolloverTeamOption {
	/** Canonical team id (the rolloverTeam callable's `originalTeamId`). */
	canonicalTeamId: string
	/** Most recent team-season name to display in the dropdown. */
	displayName: string
	/** Most recent participating season's name (for the secondary line). */
	mostRecentSeasonName: string
	/** Sort key — most recent season's `dateStart` in seconds. */
	mostRecentSeasonStartSeconds: number
	/** True iff this canonical team already has a team-season for the current season. */
	alreadyRolledOver: boolean
}

/**
 * Custom hook for rollover team form logic.
 *
 * Loads the canonical teams the authenticated user has captained, then loads
 * each team's full team-season history so the dropdown can show the most
 * recent team name + season + already-rolled-over status.
 */
export const useRolloverTeamForm = ({
	handleResult,
	seasonId,
}: UseRolloverTeamFormProps) => {
	const {
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot,
		currentSeasonTeamsQuerySnapshot,
	} = useTeamsContext()
	const { seasonsQuerySnapshot } = useSeasonsContext()

	const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

	// Build a Set of canonical team ids that already have a teamSeasons subdoc
	// in the current season (i.e., have already been rolled over).
	const alreadyRolledOverIds = useMemo(() => {
		const set = new Set<string>()
		currentSeasonTeamsQuerySnapshot?.docs.forEach((doc) => {
			set.add(canonicalTeamIdFromTeamSeasonDoc(doc))
		})
		return set
	}, [currentSeasonTeamsQuerySnapshot])

	// Build a Map of seasonId → dateStart seconds, for sorting.
	const seasonDateStartMap = useMemo(() => {
		const map = new Map<string, number>()
		seasonsQuerySnapshot?.docs.forEach((doc) => {
			const data = doc.data()
			if (data.dateStart?.seconds !== undefined) {
				map.set(doc.id, data.dateStart.seconds)
			}
		})
		return map
	}, [seasonsQuerySnapshot])

	// Each captained team's full season history, fetched once per captain
	// snapshot. Everything shown in the dropdown is derived from it below, so
	// a change to the seasons or to this season's teams needs no refetch.
	const { items: captainTeamHistories } = useResolvedSnapshot(
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot,
		async (snapshot) => {
			const histories = await Promise.all(
				snapshot.docs.map(
					async (canonicalSnap): Promise<CaptainTeamHistory | null> => {
						const canonicalTeamId = canonicalSnap.id
						const historyQuery = teamSeasonsQuery(canonicalTeamId)
						if (!historyQuery) return null
						try {
							const teamSeasons = await getDocs(historyQuery)
							return {
								canonicalTeamId,
								seasons: teamSeasons.docs.map((doc) => ({
									seasonId: doc.data().season?.id,
									name: doc.data().name,
								})),
							}
						} catch (error) {
							logger.error(
								'Failed to load team seasons for rollover candidate',
								error,
								{ component: 'useRolloverTeamForm', canonicalTeamId }
							)
							return null
						}
					}
				)
			)
			return histories.filter(
				(history): history is CaptainTeamHistory => history !== null
			)
		}
	)

	const availableTeams = useMemo(
		() =>
			captainTeamHistories
				.filter((history) => history.seasons.length > 0)
				.map((history): RolloverTeamOption => {
					// The most recent team-season, by its season's start date.
					let mostRecent = history.seasons[0]
					let mostRecentSeconds = -Infinity
					for (const teamSeason of history.seasons) {
						const seconds = teamSeason.seasonId
							? (seasonDateStartMap.get(teamSeason.seasonId) ?? 0)
							: 0
						if (seconds > mostRecentSeconds) {
							mostRecentSeconds = seconds
							mostRecent = teamSeason
						}
					}
					return {
						canonicalTeamId: history.canonicalTeamId,
						displayName: mostRecent.name || 'Unknown Team',
						mostRecentSeasonName:
							seasonsQuerySnapshot?.docs
								.find((season) => season.id === mostRecent.seasonId)
								?.data()?.name ?? 'Unknown Season',
						mostRecentSeasonStartSeconds: mostRecentSeconds,
						alreadyRolledOver: alreadyRolledOverIds.has(
							history.canonicalTeamId
						),
					}
				})
				.sort(
					(a, b) =>
						b.mostRecentSeasonStartSeconds - a.mostRecentSeasonStartSeconds
				),
		[
			captainTeamHistories,
			seasonDateStartMap,
			seasonsQuerySnapshot,
			alreadyRolledOverIds,
		]
	)

	const form = useForm<RolloverTeamFormData>({
		resolver: standardSchemaResolver(rolloverTeamFormSchema),
		defaultValues: {
			selectedTeam: '',
		},
	})

	// Preselect the most recent team not yet rolled over, until the captain
	// picks one. The form holds the choice, so this only syncs it.
	useEffect(() => {
		if (form.getValues('selectedTeam')) return
		const firstEligible = availableTeams.find((t) => !t.alreadyRolledOver)
		if (firstEligible) {
			form.setValue('selectedTeam', firstEligible.canonicalTeamId)
		}
	}, [availableTeams, form])

	const onSubmit = useCallback(
		async (data: RolloverTeamFormData) => {
			try {
				setIsSubmitting(true)
				if (!data.selectedTeam) {
					throw new Error('No team selected')
				}
				const selected = availableTeams.find(
					(t) => t.canonicalTeamId === data.selectedTeam
				)
				if (!selected) {
					throw new Error('Selected team not found')
				}

				const result = await rolloverTeamViaFunction({
					originalTeamId: selected.canonicalTeamId,
					seasonId,
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				})

				handleResult({
					success: true,
					title: 'Team rolled over successfully',
					description: result.message,
					navigation: true,
				})
			} catch (error) {
				logger.error(
					'Team rollover failed',
					error instanceof Error ? error : new Error(String(error)),
					{
						component: 'useRolloverTeamForm',
						canonicalTeamId: data.selectedTeam,
					}
				)

				let errorMessage = 'Failed to rollover team. Please try again.'
				let errorTitle = 'Team rollover failed'

				if (error && typeof error === 'object' && 'message' in error) {
					errorMessage = error.message as string
				} else if (error instanceof Error) {
					errorMessage = error.message
				}

				if (errorMessage.includes('registration is not currently open')) {
					errorTitle = 'Registration Closed'
				} else if (errorMessage.includes('already on a team')) {
					errorTitle = 'Already on Team'
				} else if (errorMessage.includes('already been rolled over')) {
					errorTitle = 'Already Rolled Over'
				} else if (errorMessage.includes('Only captains')) {
					errorTitle = 'Permission Denied'
				}

				handleResult({
					success: false,
					title: errorTitle,
					description: errorMessage,
					navigation: false,
				})
			} finally {
				setIsSubmitting(false)
			}
		},
		[availableTeams, handleResult, setIsSubmitting, seasonId]
	)

	return {
		form,
		onSubmit,
		availableTeams,
		hasCaptainTeams:
			(teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot?.docs.length ?? 0) >
			0,
		isSubmitting,
	}
}
