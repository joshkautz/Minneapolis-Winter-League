import { useMemo } from 'react'
import { NotificationCard, SeasonHistoryRow } from '@/shared/components'
import { type DocumentSnapshot, type QuerySnapshot } from 'firebase/firestore'
import { canonicalTeamIdFromTeamSeasonDoc } from '@/firebase/collections/teams'
import { useSeasonsContext } from '@/providers'
import { sortBySeasonStartDesc, teamRecordsBySeason } from '@/shared/utils'
import { GameDocument, TeamSeasonDocument, type TeamDocument } from '@/types'

interface ProcessedHistoryEntry {
	id: string
	seasonId: string
	seasonName: string
	teamName: string
	teamLogo: string | null
	wins: number
	losses: number
	placement: number | null
}

export const TeamHistory = ({
	teamDocumentSnapshot,
	historyQuerySnapshot,
	gamesQuerySnapshot,
}: {
	teamDocumentSnapshot: DocumentSnapshot<TeamDocument> | undefined
	historyQuerySnapshot: QuerySnapshot<TeamSeasonDocument>
	/**
	 * Games for THIS team only — `gamesByTeamQuery(teamRef)` from the
	 * parent team-profile component. Replaces the previous reliance on
	 * the unbounded `useGamesContext().allGamesQuerySnapshot`, which
	 * pulled every game ever played just to compute one team's history.
	 */
	gamesQuerySnapshot: QuerySnapshot<GameDocument> | undefined
}) => {
	const { seasonsQuerySnapshot } = useSeasonsContext()

	// The canonical team id — every game in `gamesQuerySnapshot` has
	// this team on one side or the other. We get it from the parent
	// canonical team document.
	const canonicalTeamId = teamDocumentSnapshot?.id

	// This team's record in each season, from the team-scoped games.
	const teamRecords = useMemo(
		() =>
			gamesQuerySnapshot?.docs && canonicalTeamId
				? teamRecordsBySeason(
						gamesQuerySnapshot.docs.map((doc) => doc.data()),
						canonicalTeamId
					)
				: {},
		[gamesQuerySnapshot, canonicalTeamId]
	)

	// Process history entries with season data and records
	const processedHistory = useMemo((): ProcessedHistoryEntry[] => {
		if (!historyQuerySnapshot?.docs || !seasonsQuerySnapshot?.docs) return []

		const entries = historyQuerySnapshot.docs.map((historyDoc) => {
			const data = historyDoc.data()
			const seasonDoc = seasonsQuerySnapshot.docs.find(
				(s) => s.id === data.season.id
			)
			const canonicalTeamIdForRow = canonicalTeamIdFromTeamSeasonDoc(historyDoc)
			// Look up the record by seasonId — the games loop above
			// already restricted itself to this team's games, so the
			// records map is keyed only by season.
			const record = teamRecords[data.season.id]

			return {
				id: canonicalTeamIdForRow,
				seasonId: data.season.id,
				seasonName: seasonDoc?.data()?.name || 'Unknown Season',
				teamName: data.name,
				teamLogo: data.logo || null,
				wins: record?.wins || 0,
				losses: record?.losses || 0,
				placement: data.placement ?? null,
			}
		})

		// Newest first, by when the season starts.
		const startById = new Map(
			seasonsQuerySnapshot.docs.map((season) => [
				season.id,
				season.data().dateStart?.toMillis(),
			])
		)
		return sortBySeasonStartDesc(entries, (entry) =>
			startById.get(entry.seasonId)
		)
	}, [historyQuerySnapshot, seasonsQuerySnapshot, teamRecords])

	return (
		<NotificationCard
			title={'History'}
			description={processedHistory[0]?.teamName ?? 'Past seasons'}
			className={'flex-1 basis-full shrink-0 max-w-full min-w-[360px]'}
		>
			{processedHistory.length > 0 ? (
				<div role='list' aria-label='Team history' className='-mx-4'>
					{processedHistory.map((entry) => (
						<div role='listitem' key={entry.seasonId}>
							<SeasonHistoryRow
								to={`/teams/${entry.id}/${entry.seasonId}`}
								teamName={entry.teamName}
								teamLogo={entry.teamLogo}
								seasonName={entry.seasonName}
								wins={entry.wins}
								losses={entry.losses}
								placement={entry.placement}
								className='px-4'
							/>
						</div>
					))}
				</div>
			) : (
				<p className='text-sm text-muted-foreground text-center py-4'>
					No history available for this team.
				</p>
			)}
		</NotificationCard>
	)
}
