import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { NotificationCard } from '@/shared/components'
import { DocumentSnapshot, QuerySnapshot } from '@/firebase'
import { canonicalTeamIdFromTeamSeasonDoc } from '@/firebase/collections/teams'
import { useSeasonsContext, useGamesContext } from '@/providers'
import { TeamSeasonDocument, hasAssignedTeams } from '@/shared/utils'

// Format placement with ordinal suffix and medal emoji for top 3
const formatPlacement = (placement: number | null) => {
	if (placement === null) return 'TBD'
	if (placement === 1) return '1st 🥇'
	if (placement === 2) return '2nd 🥈'
	if (placement === 3) return '3rd 🥉'
	const suffix =
		placement % 10 === 1 && placement !== 11
			? 'st'
			: placement % 10 === 2 && placement !== 12
				? 'nd'
				: placement % 10 === 3 && placement !== 13
					? 'rd'
					: 'th'
	return `${placement}${suffix}`
}

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
}: {
	teamDocumentSnapshot:
		| DocumentSnapshot<import('@/shared/utils').TeamDocument>
		| undefined
	historyQuerySnapshot: QuerySnapshot<TeamSeasonDocument>
}) => {
	void teamDocumentSnapshot
	const { seasonsQuerySnapshot } = useSeasonsContext()
	const { allGamesQuerySnapshot } = useGamesContext()

	// Calculate team records from games. Keyed by `${canonicalTeamId}__${seasonId}`
	// because a single team has different W/L records in different seasons.
	const teamRecords = useMemo(() => {
		const records: Record<string, { wins: number; losses: number }> = {}

		if (!allGamesQuerySnapshot?.docs) return records

		allGamesQuerySnapshot.docs.forEach((gameDoc) => {
			const gameData = gameDoc.data()

			// Skip games with null team references (placeholder games)
			if (!hasAssignedTeams(gameData)) return

			const { home, away, homeScore, awayScore, season } = gameData

			// Skip games that haven't been played yet (null scores)
			if (homeScore === null || awayScore === null) return
			if (!season?.id) return

			const homeKey = `${home.id}__${season.id}`
			const awayKey = `${away.id}__${season.id}`

			if (!records[homeKey]) records[homeKey] = { wins: 0, losses: 0 }
			if (!records[awayKey]) records[awayKey] = { wins: 0, losses: 0 }

			if (homeScore > awayScore) {
				records[homeKey].wins++
				records[awayKey].losses++
			} else if (awayScore > homeScore) {
				records[awayKey].wins++
				records[homeKey].losses++
			}
			// Ties (rare in ultimate but not impossible): no win/loss credit
		})

		return records
	}, [allGamesQuerySnapshot])

	// Process history entries with season data and records
	const processedHistory = useMemo((): ProcessedHistoryEntry[] => {
		if (!historyQuerySnapshot?.docs || !seasonsQuerySnapshot?.docs) return []

		return historyQuerySnapshot.docs
			.map((historyDoc) => {
				const data = historyDoc.data()
				const seasonDoc = seasonsQuerySnapshot.docs.find(
					(s) => s.id === data.season.id
				)
				const canonicalTeamId = canonicalTeamIdFromTeamSeasonDoc(historyDoc)
				// Look up the record using (canonicalTeamId, seasonId) — the
				// key matches what the games loop above produced.
				const record = teamRecords[`${canonicalTeamId}__${data.season.id}`]

				return {
					id: canonicalTeamId,
					seasonId: data.season.id,
					seasonName: seasonDoc?.data()?.name || 'Unknown Season',
					teamName: data.name,
					teamLogo: data.logo || null,
					wins: record?.wins || 0,
					losses: record?.losses || 0,
					placement: data.placement ?? null,
				}
			})
			.sort((a, b) => b.seasonName.localeCompare(a.seasonName))
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
						<Link
							key={entry.seasonId}
							to={`/teams/${entry.id}/${entry.seasonId}`}
							className='flex items-center gap-4 px-4 py-3 border-b last:border-b-0 cursor-pointer transition-colors hover:bg-muted/50 focus:outline-none focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary'
							role='listitem'
							aria-label={`${entry.teamName}, ${entry.seasonName}, ${entry.wins} wins ${entry.losses} losses, finished ${formatPlacement(entry.placement)}`}
						>
							{/* Team Logo */}
							<div className='flex-shrink-0'>
								{entry.teamLogo ? (
									<img
										src={entry.teamLogo}
										alt=''
										className='w-10 h-10 rounded-full object-cover bg-muted'
									/>
								) : (
									<div className='w-10 h-10 rounded-full bg-gradient-to-br from-primary to-sky-300 flex items-center justify-center'>
										<span className='text-sm font-bold text-primary-foreground'>
											{entry.teamName?.charAt(0)?.toUpperCase() || 'T'}
										</span>
									</div>
								)}
							</div>

							{/* Team Info */}
							<div className='flex-1 min-w-0'>
								<div className='flex items-center gap-2'>
									<span className='font-medium text-foreground truncate'>
										{entry.teamName}
									</span>
								</div>
								<span className='text-sm text-muted-foreground'>
									{entry.seasonName}
								</span>
							</div>

							{/* Win-Loss Record */}
							<div className='flex-shrink-0 text-center'>
								<div className='text-sm font-medium'>
									{entry.wins}-{entry.losses}
								</div>
								<div className='text-xs text-muted-foreground'>Record</div>
							</div>

							{/* Placement */}
							<div className='flex-shrink-0 text-right min-w-[60px]'>
								<div className='text-sm font-medium'>
									{formatPlacement(entry.placement)}
								</div>
								<div className='text-xs text-muted-foreground'>Finish</div>
							</div>
						</Link>
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
