// React
import {
	PropsWithChildren,
	createContext,
	useContext,
	useEffect,
	useMemo,
} from 'react'

// Firebase Hooks
import { useCollection } from 'react-firebase-hooks/firestore'
import { toast } from 'sonner'

// Winter League
import { teamsInSeasonQuery, teamsQuery } from '@/firebase/collections/teams'
import { playerSeasonsSubcollection } from '@/firebase/collections/players'
import { type FirestoreError, type QuerySnapshot } from 'firebase/firestore'
import { logger, errorMessage } from '@/shared/utils'
import { TeamDocument, TeamSeasonDocument } from '@/types'
import { useSeasonsContext } from './seasons-context'
import { useAuthContext } from './auth-context'

interface TeamProps {
	/**
	 * Per-team season subdocs participating in the *current* season.
	 * Use canonicalTeamIdFromTeamSeasonDoc to derive the canonical team id.
	 */
	currentSeasonTeamsQuerySnapshot: QuerySnapshot<TeamSeasonDocument> | undefined
	currentSeasonTeamsQuerySnapshotLoading: boolean
	currentSeasonTeamsQuerySnapshotError: FirestoreError | undefined
	/** Per-team season subdocs participating in the *selected* season. */
	selectedSeasonTeamsQuerySnapshot:
		QuerySnapshot<TeamSeasonDocument> | undefined
	selectedSeasonTeamsQuerySnapshotLoading: boolean
	selectedSeasonTeamsQuerySnapshotError: FirestoreError | undefined
	/** Canonical team docs the authenticated user is a captain of (any season). */
	teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot:
		QuerySnapshot<TeamDocument> | undefined
	teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotLoading: boolean
	teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotError:
		FirestoreError | undefined
	/** All canonical teams in the system. */
}

const TeamsContext = createContext<TeamProps | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export const useTeamsContext = (): TeamProps => {
	const context = useContext(TeamsContext)
	if (!context) {
		throw new Error(
			'useTeamsContext must be used within a TeamsContextProvider'
		)
	}
	return context
}

export const TeamsContextProvider = ({ children }: PropsWithChildren) => {
	const {
		selectedSeasonQueryDocumentSnapshot,
		currentSeasonQueryDocumentSnapshot,
	} = useSeasonsContext()
	const { authStateUser } = useAuthContext()

	// Load the user's player season subcollection so we can derive which
	// canonical teams they are a captain of (across all seasons).
	const [authenticatedUserSeasonsSnapshot] = useCollection(
		playerSeasonsSubcollection(authStateUser?.uid)
	)

	const teamsForWhichAuthenticatedUserIsCaptain = useMemo(() => {
		if (!authenticatedUserSeasonsSnapshot) return undefined
		const seen = new Set<string>()
		const refs = []
		for (const docSnap of authenticatedUserSeasonsSnapshot.docs) {
			const data = docSnap.data()
			if (data.captain && data.team && !seen.has(data.team.id)) {
				seen.add(data.team.id)
				refs.push(data.team)
			}
		}
		return refs.length > 0 ? refs : undefined
	}, [authenticatedUserSeasonsSnapshot])

	// When the user hasn't switched the season selector, the "selected"
	// season is the same doc as the "current" season — running both
	// queries would double-fetch the same collection-group result. Detect
	// the equal case and gate the duplicate `useCollection` to undefined
	// so only one query fires; the consumer-facing accessors below alias
	// the deduped result back into both names.
	const selectedSeasonId = selectedSeasonQueryDocumentSnapshot?.id
	const currentSeasonId = currentSeasonQueryDocumentSnapshot?.id
	const seasonsAreEqual =
		!!selectedSeasonId &&
		!!currentSeasonId &&
		selectedSeasonId === currentSeasonId

	const [
		selectedSeasonTeamsQuerySnapshotInternal,
		selectedSeasonTeamsQuerySnapshotInternalLoading,
		selectedSeasonTeamsQuerySnapshotInternalError,
	] = useCollection(
		teamsInSeasonQuery(selectedSeasonQueryDocumentSnapshot?.ref)
	)

	const [
		currentSeasonTeamsQuerySnapshotInternal,
		currentSeasonTeamsQuerySnapshotInternalLoading,
		currentSeasonTeamsQuerySnapshotInternalError,
	] = useCollection(
		seasonsAreEqual
			? undefined
			: teamsInSeasonQuery(currentSeasonQueryDocumentSnapshot?.ref)
	)

	// Alias the deduped result when the seasons match, otherwise use the
	// dedicated current-season query result.
	const currentSeasonTeamsQuerySnapshot = seasonsAreEqual
		? selectedSeasonTeamsQuerySnapshotInternal
		: currentSeasonTeamsQuerySnapshotInternal
	const currentSeasonTeamsQuerySnapshotLoading = seasonsAreEqual
		? selectedSeasonTeamsQuerySnapshotInternalLoading
		: currentSeasonTeamsQuerySnapshotInternalLoading
	const currentSeasonTeamsQuerySnapshotError = seasonsAreEqual
		? selectedSeasonTeamsQuerySnapshotInternalError
		: currentSeasonTeamsQuerySnapshotInternalError
	const selectedSeasonTeamsQuerySnapshot =
		selectedSeasonTeamsQuerySnapshotInternal
	const selectedSeasonTeamsQuerySnapshotLoading =
		selectedSeasonTeamsQuerySnapshotInternalLoading
	const selectedSeasonTeamsQuerySnapshotError =
		selectedSeasonTeamsQuerySnapshotInternalError

	const [
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot,
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotLoading,
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotError,
	] = useCollection(teamsQuery(teamsForWhichAuthenticatedUserIsCaptain))

	// Log and notify on teams query errors
	useEffect(() => {
		const errors = [
			{
				error: selectedSeasonTeamsQuerySnapshotError,
				name: 'selected season teams',
			},
			{
				error: currentSeasonTeamsQuerySnapshotError,
				name: 'current season teams',
			},
			{
				error: teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotError,
				name: 'captain teams',
			},
		].filter((e) => e.error)

		errors.forEach(({ error, name }) => {
			if (error) {
				logger.error(`Failed to load ${name}`, error, {
					component: 'TeamsContextProvider',
				})
				toast.error(`Failed to load ${name}`, {
					description: errorMessage(
						error,
						'Please reload the page to try again.'
					),
				})
			}
		})
	}, [
		selectedSeasonTeamsQuerySnapshotError,
		currentSeasonTeamsQuerySnapshotError,
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotError,
	])

	return (
		<TeamsContext.Provider
			value={{
				currentSeasonTeamsQuerySnapshot,
				currentSeasonTeamsQuerySnapshotLoading,
				currentSeasonTeamsQuerySnapshotError,
				selectedSeasonTeamsQuerySnapshot,
				selectedSeasonTeamsQuerySnapshotLoading,
				selectedSeasonTeamsQuerySnapshotError,
				teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot,
				teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotLoading,
				teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotError,
			}}
		>
			{children}
		</TeamsContext.Provider>
	)
}
