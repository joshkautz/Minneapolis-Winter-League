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
import {
	allTeamsQuery,
	teamsInSeasonQuery,
	teamsQuery,
} from '@/firebase/collections/teams'
import { playerSeasonsSubcollection } from '@/firebase/collections/players'
import { FirestoreError, QuerySnapshot } from '@/firebase'
import { TeamDocument, TeamSeasonDocument, logger } from '@/shared/utils'
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
		| QuerySnapshot<TeamSeasonDocument>
		| undefined
	selectedSeasonTeamsQuerySnapshotLoading: boolean
	selectedSeasonTeamsQuerySnapshotError: FirestoreError | undefined
	/** Canonical team docs the authenticated user is a captain of (any season). */
	teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot:
		| QuerySnapshot<TeamDocument>
		| undefined
	teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotLoading: boolean
	teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotError:
		| FirestoreError
		| undefined
	/** All canonical teams in the system. */
	allTeamsQuerySnapshot: QuerySnapshot<TeamDocument> | undefined
	allTeamsQuerySnapshotLoading: boolean
	allTeamsQuerySnapshotError: FirestoreError | undefined
}

// eslint-disable-next-line react-refresh/only-export-components
export const TeamsContext = createContext<TeamProps>({
	currentSeasonTeamsQuerySnapshot: undefined,
	currentSeasonTeamsQuerySnapshotLoading: false,
	currentSeasonTeamsQuerySnapshotError: undefined,
	selectedSeasonTeamsQuerySnapshot: undefined,
	selectedSeasonTeamsQuerySnapshotLoading: false,
	selectedSeasonTeamsQuerySnapshotError: undefined,
	teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot: undefined,
	teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotLoading: false,
	teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotError: undefined,
	allTeamsQuerySnapshot: undefined,
	allTeamsQuerySnapshotLoading: false,
	allTeamsQuerySnapshotError: undefined,
})

// eslint-disable-next-line react-refresh/only-export-components
export const useTeamsContext = () => useContext(TeamsContext)

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

	const [
		selectedSeasonTeamsQuerySnapshot,
		selectedSeasonTeamsQuerySnapshotLoading,
		selectedSeasonTeamsQuerySnapshotError,
	] = useCollection(
		teamsInSeasonQuery(selectedSeasonQueryDocumentSnapshot?.ref)
	)

	const [
		currentSeasonTeamsQuerySnapshot,
		currentSeasonTeamsQuerySnapshotLoading,
		currentSeasonTeamsQuerySnapshotError,
	] = useCollection(teamsInSeasonQuery(currentSeasonQueryDocumentSnapshot?.ref))

	const [
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot,
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotLoading,
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotError,
	] = useCollection(teamsQuery(teamsForWhichAuthenticatedUserIsCaptain))

	const [
		allTeamsQuerySnapshot,
		allTeamsQuerySnapshotLoading,
		allTeamsQuerySnapshotError,
	] = useCollection(allTeamsQuery())

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
			{
				error: allTeamsQuerySnapshotError,
				name: 'all teams',
			},
		].filter((e) => e.error)

		errors.forEach(({ error, name }) => {
			if (error) {
				logger.error(`Failed to load ${name}:`, {
					component: 'TeamsContextProvider',
					error: error.message,
				})
				toast.error(`Failed to load ${name}`, {
					description: error.message,
				})
			}
		})
	}, [
		selectedSeasonTeamsQuerySnapshotError,
		currentSeasonTeamsQuerySnapshotError,
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotError,
		allTeamsQuerySnapshotError,
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
				allTeamsQuerySnapshot,
				allTeamsQuerySnapshotLoading,
				allTeamsQuerySnapshotError,
			}}
		>
			{children}
		</TeamsContext.Provider>
	)
}
