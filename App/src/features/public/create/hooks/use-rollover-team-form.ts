import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { getDocs } from 'firebase/firestore'
import { logger, TeamSeasonDocument } from '@/shared/utils'
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
import type { TeamCreationData } from '@/features/public/create/hooks/use-team-creation'

interface UseRolloverTeamFormProps {
	setNewTeamDocument: React.Dispatch<
		React.SetStateAction<TeamCreationData | undefined>
	>
	handleResult: ({
		success,
		title,
		description,
		navigation,
	}: {
		success: boolean
		title: string
		description: string
		navigation: boolean
	}) => void
	seasonId: string
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
	setNewTeamDocument,
	handleResult,
	seasonId,
}: UseRolloverTeamFormProps) => {
	const {
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot,
		currentSeasonTeamsQuerySnapshot,
	} = useTeamsContext()
	const { seasonsQuerySnapshot } = useSeasonsContext()

	const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
	const [selectedCanonicalTeamId, setSelectedCanonicalTeamId] = useState<
		string | undefined
	>(undefined)

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

	// For each canonical captain team, load all of its teamSeasons subdocs to
	// derive the most recent team name + season for display.
	const [availableTeams, setAvailableTeams] = useState<RolloverTeamOption[]>([])

	useEffect(() => {
		const captainSnaps =
			teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot?.docs ?? []
		if (captainSnaps.length === 0) {
			setAvailableTeams([])
			return
		}

		let cancelled = false
		const load = async () => {
			const rows = await Promise.all(
				captainSnaps.map(async (canonicalSnap) => {
					const canonicalTeamId = canonicalSnap.id
					const tsQuery = teamSeasonsQuery(canonicalTeamId)
					if (!tsQuery) return null
					try {
						const tsSnap = await getDocs(tsQuery)
						if (tsSnap.empty) return null
						// Pick the most recent team-season by season dateStart.
						let bestSeasonId: string | undefined
						let bestSeconds = -Infinity
						let bestName = ''
						for (const doc of tsSnap.docs) {
							const seasonRef = (doc.data() as TeamSeasonDocument).season
							const seconds = seasonRef
								? (seasonDateStartMap.get(seasonRef.id) ?? 0)
								: 0
							if (seconds > bestSeconds) {
								bestSeconds = seconds
								bestSeasonId = seasonRef?.id
								bestName = (doc.data() as TeamSeasonDocument).name
							}
						}
						const mostRecentSeasonName = bestSeasonId
							? (seasonsQuerySnapshot?.docs
									.find((s) => s.id === bestSeasonId)
									?.data()?.name ?? 'Unknown Season')
							: 'Unknown Season'
						return {
							canonicalTeamId,
							displayName: bestName || 'Unknown Team',
							mostRecentSeasonName,
							mostRecentSeasonStartSeconds:
								bestSeconds === -Infinity ? 0 : bestSeconds,
							alreadyRolledOver: alreadyRolledOverIds.has(canonicalTeamId),
						} satisfies RolloverTeamOption
					} catch (err) {
						logger.error('Failed to load team seasons for rollover candidate', {
							component: 'useRolloverTeamForm',
							canonicalTeamId,
							error: err instanceof Error ? err.message : String(err),
						})
						return null
					}
				})
			)

			if (cancelled) return
			const filtered = rows.filter((r): r is RolloverTeamOption => r !== null)
			// Most recent first.
			filtered.sort(
				(a, b) =>
					b.mostRecentSeasonStartSeconds - a.mostRecentSeasonStartSeconds
			)
			setAvailableTeams(filtered)
		}
		load()
		return () => {
			cancelled = true
		}
	}, [
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot,
		seasonsQuerySnapshot,
		seasonDateStartMap,
		alreadyRolledOverIds,
	])

	const form = useForm<RolloverTeamFormData>({
		resolver: standardSchemaResolver(rolloverTeamFormSchema),
		defaultValues: {
			selectedTeam: '',
		},
	})

	// Auto-select the most recent team that hasn't been rolled over yet.
	useEffect(() => {
		if (selectedCanonicalTeamId !== undefined) return
		const firstEligible = availableTeams.find((t) => !t.alreadyRolledOver)
		if (firstEligible) {
			setSelectedCanonicalTeamId(firstEligible.canonicalTeamId)
			form.setValue('selectedTeam', firstEligible.canonicalTeamId)
		}
	}, [availableTeams, selectedCanonicalTeamId, form])

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

				setNewTeamDocument({
					name: selected.displayName,
					storageRef: undefined,
					teamId: result.teamId,
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
						canonicalTeamId: selectedCanonicalTeamId,
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
		[
			availableTeams,
			selectedCanonicalTeamId,
			setNewTeamDocument,
			handleResult,
			setIsSubmitting,
			seasonId,
		]
	)

	const handleTeamChange = useCallback((canonicalTeamId: string) => {
		setSelectedCanonicalTeamId(canonicalTeamId)
	}, [])

	return {
		form,
		onSubmit,
		handleTeamChange,
		availableTeams,
		hasCaptainTeams:
			(teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot?.docs.length ?? 0) >
			0,
		isSubmitting,
	}
}
