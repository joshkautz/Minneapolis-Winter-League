/**
 * PlayerRankingHistory component
 *
 * A player's rank and rating over their career, or over one season with
 * that season's rank, record and every game's effect (the switch is
 * `?season=`, see ranking-scope.tsx). Accessible at /players/{playerId}.
 *
 * All of it comes from the player's one `player-ranking-history` document
 * and their season standing, plus their teams' games for the results.
 */

import { useMemo, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useCollection, useDocument } from 'react-firebase-hooks/firestore'
import { getDoc, getDocs } from 'firebase/firestore'

import {
	logger,
	sortBySeasonStartDesc,
	teamRecordsBySeason,
	type SeasonRecord,
} from '@/shared/utils'
import { GameDocument, PlayerSeasonDocument, TeamSeasonDocument } from '@/types'
import { playerSeasonsSubcollection } from '@/firebase/collections/players'
import { teamSeasonRef } from '@/firebase/collections/teams'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Trophy, ArrowLeft, Users, CalendarDays } from 'lucide-react'
import { useSeasonsContext } from '@/providers'
import { gamesByTeamQuery } from '@/firebase/collections/games'
import { useQueryErrorHandler } from '@/shared/hooks'
import {
	currentPlayerRankingsQuery,
	playerRankingHistoryRef,
	seasonRankingRef,
} from '@/firebase/collections/player-rankings'
import { SeasonHistoryRow } from '@/shared/components'
import { seasonIdsOf, seasonSlots } from './ranking-helpers'
import { RatingHistoryChart, type ChartPoint } from './rating-history-chart'
import { PlayerSeasonSummary } from './player-season-summary'
import { RankingScopeSelect } from './ranking-scope'
import { scopeQuery, useRankingScope } from './use-ranking-scope'

interface PlayerRankingHistoryProps {
	/** Optional class name for styling */
	className?: string
}

// Interface for processed team history entry
interface TeamHistoryEntry {
	seasonId: string
	seasonName: string
	teamId: string
	teamName: string
	teamLogo: string | null
	wins: number
	losses: number
	placement: number | null
	isCaptain: boolean
}

export const PlayerRankingHistory = ({
	className,
}: PlayerRankingHistoryProps) => {
	const { playerId } = useParams<{ playerId: string }>()
	const navigate = useNavigate()

	// Get seasons and games data from contexts
	const { seasonsQuerySnapshot } = useSeasonsContext()

	// Subscribe to the player's per-season subcollection. Replaces the dead
	// `playerData.seasons` array.
	const [playerSeasonsSnapshot, , playerSeasonsError] = useCollection(
		playerSeasonsSubcollection(playerId)
	)

	useEffect(() => {
		if (playerSeasonsError) {
			logger.error('Failed to load player seasons', playerSeasonsError, {
				component: 'PlayerRankingHistory',
				playerId,
			})
		}
	}, [playerSeasonsError, playerId])

	const { seasonId, setSeasonId } = useRankingScope()

	// Everyone ranked, for the player picker: names are on the rankings.
	const [rankingsSnapshot, rankingsLoading, rankingsError] = useCollection(
		currentPlayerRankingsQuery()
	)
	// The player's rating and ranks after every round, in one document.
	const [historySnapshot, historyLoading, error] = useDocument(
		playerId ? playerRankingHistoryRef(playerId) : null
	)
	// Their standing in the season being looked at.
	const [standingSnapshot, , standingError] = useDocument(
		playerId && seasonId ? seasonRankingRef(seasonId, playerId) : null
	)

	useQueryErrorHandler({
		error: rankingsError,
		component: 'PlayerRankingHistory',
		errorLabel: 'players',
	})

	useQueryErrorHandler({
		error,
		component: 'PlayerRankingHistory',
		errorLabel: 'ranking history',
		context: { playerId },
	})

	useQueryErrorHandler({
		error: standingError,
		component: 'PlayerRankingHistory',
		errorLabel: 'season standing',
		context: { playerId, seasonId },
	})

	const loading = historyLoading || rankingsLoading

	const allPlayers = useMemo(
		() =>
			(rankingsSnapshot?.docs ?? [])
				.map((doc) => ({ id: doc.id, name: doc.data().playerName }))
				.sort((a, b) => a.name.localeCompare(b.name)),
		[rankingsSnapshot]
	)
	const playerName =
		historySnapshot?.data()?.playerName ??
		allPlayers.find((player) => player.id === playerId)?.name ??
		'Unknown Player'

	const rounds = useMemo(
		() => historySnapshot?.data()?.rounds ?? [],
		[historySnapshot]
	)

	const seasonsById = useMemo(
		() =>
			new Map(
				seasonsQuerySnapshot?.docs.map((doc) => [doc.id, doc.data()]) ?? []
			),
		[seasonsQuerySnapshot]
	)

	// The seasons this player was rated in, newest first, for the switch.
	const playerSeasons = useMemo(
		() =>
			sortBySeasonStartDesc(seasonIdsOf(rounds), (id) =>
				seasonsById.get(id)?.dateStart?.toMillis()
			).map((id) => ({
				id,
				name: seasonsById.get(id)?.name ?? 'Unknown Season',
			})),
		[rounds, seasonsById]
	)
	const season = playerSeasons.find((candidate) => candidate.id === seasonId)
	const seasonName =
		season?.name ??
		(seasonId ? seasonsById.get(seasonId)?.name : undefined) ??
		'this season'

	// The games of every team the player has been on, fetched per team:
	// the page used to read every game ever played for this. A game between
	// two of their teams comes back twice, so it is kept once, by id.
	const [teamGames, setTeamGames] = useState<GameDocument[]>([])
	useEffect(() => {
		const teamRefs = new Map(
			(playerSeasonsSnapshot?.docs ?? []).flatMap((psDoc) => {
				const teamRef = (psDoc.data() as PlayerSeasonDocument).team
				return teamRef ? [[teamRef.id, teamRef] as const] : []
			})
		)
		let cancelled = false
		const load = async () => {
			try {
				const snapshots = await Promise.all(
					[...teamRefs.values()].flatMap((teamRef) => {
						const teamGamesQuery = gamesByTeamQuery(teamRef)
						return teamGamesQuery ? [getDocs(teamGamesQuery)] : []
					})
				)
				const games = new Map(
					snapshots.flatMap((snapshot) =>
						snapshot.docs.map((doc) => [doc.id, doc.data()] as const)
					)
				)
				if (!cancelled) setTeamGames([...games.values()])
			} catch (err) {
				logger.error('Failed to load team games for history', err, {
					component: 'PlayerRankingHistory',
					playerId,
				})
			}
		}
		load()
		return () => {
			cancelled = true
		}
	}, [playerSeasonsSnapshot, playerId])

	// Each team's record in each season, keyed `${teamId}::${seasonId}`.
	// Per season: a team keeps its id when it rolls over, so tallying by team
	// alone credited every season's games to each season's row.
	const teamRecords = useMemo(() => {
		const records: Record<string, SeasonRecord> = {}
		const teamIds = new Set(
			(playerSeasonsSnapshot?.docs ?? [])
				.map((psDoc) => (psDoc.data() as PlayerSeasonDocument).team?.id)
				.filter((id): id is string => Boolean(id))
		)
		for (const teamId of teamIds) {
			for (const [seasonId, record] of Object.entries(
				teamRecordsBySeason(teamGames, teamId)
			)) {
				records[`${teamId}::${seasonId}`] = record
			}
		}
		return records
	}, [teamGames, playerSeasonsSnapshot])

	// Load each (canonicalTeamId, seasonId) team-season subdoc the player has
	// participated in. Bounded by player history length (~5 docs typical).
	const [teamSeasonByKey, setTeamSeasonByKey] = useState<
		Map<string, TeamSeasonDocument>
	>(new Map())

	useEffect(() => {
		const docs = playerSeasonsSnapshot?.docs ?? []
		let cancelled = false
		const load = async () => {
			if (docs.length === 0) {
				if (!cancelled) setTeamSeasonByKey(new Map())
				return
			}
			const entries = await Promise.all(
				docs.map(async (psDoc) => {
					const ps = psDoc.data() as PlayerSeasonDocument
					const teamRef = ps.team
					if (!teamRef) return null
					const seasonId = psDoc.id
					const canonicalTeamId = teamRef.id
					try {
						const tsSnap = await getDoc(
							teamSeasonRef(canonicalTeamId, seasonId)
						)
						if (!tsSnap.exists()) return null
						const key = `${canonicalTeamId}::${seasonId}`
						return [key, tsSnap.data() as TeamSeasonDocument] as const
					} catch (err) {
						logger.error('Failed to load team season for history row', err, {
							component: 'PlayerRankingHistory',
							canonicalTeamId,
							seasonId,
						})
						return null
					}
				})
			)
			if (cancelled) return
			const map = new Map<string, TeamSeasonDocument>()
			for (const entry of entries) {
				if (entry) map.set(entry[0], entry[1])
			}
			setTeamSeasonByKey(map)
		}
		load()
		return () => {
			cancelled = true
		}
	}, [playerSeasonsSnapshot])

	// The player's teams, newest season first. Seasons without a team (a
	// free agent's) are left out.
	const teamHistory = useMemo((): TeamHistoryEntry[] => {
		if (!playerSeasonsSnapshot?.docs || !playerId) return []

		const entries = playerSeasonsSnapshot.docs.flatMap((psDoc) => {
			const seasonId = psDoc.id
			const playerSeason = psDoc.data() as PlayerSeasonDocument
			const teamId = playerSeason.team?.id
			if (!teamId) return []

			const teamSeason = teamSeasonByKey.get(`${teamId}::${seasonId}`)
			const record = teamRecords[`${teamId}::${seasonId}`]
			return [
				{
					seasonId,
					seasonName: seasonsById.get(seasonId)?.name || 'Unknown Season',
					teamId,
					teamName: teamSeason?.name ?? 'Unknown Team',
					teamLogo: teamSeason?.logo ?? null,
					wins: record?.wins || 0,
					losses: record?.losses || 0,
					placement: teamSeason?.placement ?? null,
					isCaptain: playerSeason.captain || false,
				},
			]
		})

		return sortBySeasonStartDesc(entries, (entry) =>
			seasonsById.get(entry.seasonId)?.dateStart?.toMillis()
		)
	}, [
		playerSeasonsSnapshot,
		playerId,
		seasonsById,
		teamSeasonByKey,
		teamRecords,
	])

	// The season's rounds, each with the game the player's team played.
	const slots = useMemo(() => {
		if (!seasonId) return []
		const teamId =
			(
				playerSeasonsSnapshot?.docs
					.find((doc) => doc.id === seasonId)
					?.data() as PlayerSeasonDocument | undefined
			)?.team?.id ?? null
		return seasonSlots(rounds, seasonId, teamGames, teamId)
	}, [seasonId, rounds, teamGames, playerSeasonsSnapshot])

	// All time: overall rank. A season: rank among its players.
	const chartData = useMemo((): ChartPoint[] => {
		if (!seasonId) {
			return rounds.map((round) => ({
				date: round.date.toDate().toISOString(),
				ranking: round.rank,
				rating: round.rating,
			}))
		}
		return slots.flatMap(({ round, game }) =>
			round.seasonRank === null
				? []
				: [
						{
							date: round.date.toDate().toISOString(),
							ranking: round.seasonRank,
							rating: round.rating,
							game,
						},
					]
		)
	}, [seasonId, rounds, slots])

	const shownTeamHistory = seasonId
		? teamHistory.filter((entry) => entry.seasonId === seasonId)
		: teamHistory

	const handlePlayerChange = (newPlayerId: string) => {
		navigate(`/players/${newPlayerId}${scopeQuery(seasonId)}`)
	}

	// Handle missing playerId
	if (!playerId) {
		return (
			<div className='container max-w-4xl mx-auto py-8'>
				<Alert variant='destructive'>
					<AlertDescription>
						Player ID is required to view rankings history.
					</AlertDescription>
				</Alert>
			</div>
		)
	}

	if (loading) {
		return <PlayerHistorySkeleton className={className} />
	}

	const latest = chartData[chartData.length - 1]
	const header = (
		<CardHeader className='flex flex-col gap-3 space-y-0 border-b py-5 sm:flex-row sm:items-center'>
			<div className='grid flex-1 gap-1'>
				<CardTitle className='flex items-center gap-2'>
					<Trophy className='h-5 w-5' />
					{seasonId ? `${seasonName} rankings` : 'Rankings history'}
				</CardTitle>
			</div>
			<div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
				<RankingScopeSelect
					seasonId={seasonId}
					seasons={playerSeasons}
					onChange={setSeasonId}
				/>
				<Select value={playerId} onValueChange={handlePlayerChange}>
					<SelectTrigger
						className='w-full rounded-lg sm:w-[200px]'
						aria-label='Select a player'
					>
						<SelectValue placeholder='Select player' />
					</SelectTrigger>
					<SelectContent className='rounded-xl'>
						{allPlayers.map((player) => (
							<SelectItem
								key={player.id}
								value={player.id}
								className='rounded-lg'
							>
								{player.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</CardHeader>
	)

	const backButton = (
		<div className='flex items-center gap-4'>
			<Button
				variant='outline'
				size='sm'
				onClick={() => navigate(-1)}
				className='flex items-center gap-2'
			>
				<ArrowLeft className='h-4 w-4' />
				Back
			</Button>
		</div>
	)

	const notice = (children: React.ReactNode, destructive = false) => (
		<div className='container max-w-6xl mx-auto py-8 space-y-6'>
			{backButton}
			<Card className={`${className} pt-0`}>
				{header}
				<CardContent className='px-2 pt-4 sm:px-6 sm:pt-6'>
					<Alert
						variant={destructive ? 'destructive' : 'default'}
						role={destructive ? undefined : 'status'}
						aria-live={destructive ? undefined : 'polite'}
					>
						<AlertDescription>{children}</AlertDescription>
					</Alert>
				</CardContent>
			</Card>
		</div>
	)

	if (error) {
		return notice(
			'Failed to load rankings history. Please try again later.',
			true
		)
	}

	if (rounds.length === 0) {
		return notice('No rankings history data available for this player.')
	}

	if (seasonId && chartData.length === 0) {
		return notice(
			<>
				{playerName} was not on a team in {seasonName}.{' '}
				<button
					type='button'
					className='underline'
					onClick={() => setSeasonId(null)}
				>
					See all time
				</button>
			</>
		)
	}

	return (
		<div className='container max-w-6xl mx-auto py-8 space-y-6'>
			{backButton}

			<Card className={`${className} pt-0`}>
				{header}
				<CardContent className='px-2 pt-4 sm:px-6 sm:pt-6'>
					<RatingHistoryChart
						data={chartData}
						rankLabel={seasonId ? 'Season Rank' : 'Rank Position'}
						description={`${playerName}'s ${seasonId ? `season rank and rating through ${seasonName}` : 'ranking and rating over time'}. ${seasonId ? 'Season rank' : 'Current rank'}: ${latest?.ranking ?? 'N/A'}, rating: ${latest?.rating.toFixed(2) ?? 'N/A'}.`}
					/>
				</CardContent>
			</Card>

			{seasonId && (
				<Card>
					<CardHeader className='pb-3'>
						<CardTitle className='flex items-center gap-2 text-lg'>
							<CalendarDays className='h-5 w-5' />
							{seasonName} games
						</CardTitle>
					</CardHeader>
					<CardContent>
						<PlayerSeasonSummary
							seasonName={seasonName}
							standing={standingSnapshot?.data()}
							slots={slots}
						/>
					</CardContent>
				</Card>
			)}

			{/* Team History Card */}
			<Card>
				<CardHeader className='pb-3'>
					<CardTitle className='flex items-center gap-2 text-lg'>
						<Users className='h-5 w-5' />
						{seasonId ? 'Team' : 'Team History'}
					</CardTitle>
				</CardHeader>
				<CardContent className='p-0'>
					{shownTeamHistory.length > 0 ? (
						<ul aria-label='Team history' className='list-none m-0 p-0'>
							{shownTeamHistory.map((entry, index) => (
								<li key={`${entry.seasonId}-${entry.teamId}-${index}`}>
									<SeasonHistoryRow
										to={`/teams/${entry.teamId}/${entry.seasonId}`}
										teamName={entry.teamName}
										teamLogo={entry.teamLogo}
										seasonName={entry.seasonName}
										wins={entry.wins}
										losses={entry.losses}
										placement={entry.placement}
										captain={entry.isCaptain}
										className='px-6'
									/>
								</li>
							))}
						</ul>
					) : (
						<p className='text-sm text-muted-foreground text-center py-6 px-6'>
							No team history available for this player.
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	)
}

/** The page's shape while the history loads. */
const PlayerHistorySkeleton = ({ className }: { className?: string }) => (
	<div className='container max-w-6xl mx-auto py-8 space-y-6'>
		{/* Back button skeleton */}
		<div className='flex items-center gap-4'>
			<div className='h-8 w-32 rounded-md bg-gray-200 animate-pulse relative overflow-hidden'>
				<div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12 animate-shimmer' />
			</div>
		</div>

		<Card className={`${className} pt-0`}>
			{/* Header skeleton that matches the real layout */}
			<CardHeader className='flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row'>
				<div className='grid flex-1 gap-1'>
					<div className='flex items-center gap-2'>
						<Trophy className='h-5 w-5 text-gray-300' />
						<div className='h-6 w-32 rounded bg-gray-200 animate-pulse relative overflow-hidden'>
							<div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12 animate-shimmer' />
						</div>
					</div>
				</div>
				{/* Player selector skeleton */}
				<div className='hidden h-9 w-[200px] rounded-lg bg-gray-200 animate-pulse sm:ml-auto sm:flex relative overflow-hidden'>
					<div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12 animate-shimmer' />
				</div>
			</CardHeader>

			{/* Chart content skeleton */}
			<CardContent className='px-2 pt-4 sm:px-6 sm:pt-6'>
				<div className='aspect-auto h-[250px] w-full'>
					{/* Chart area with subtle grid pattern to simulate chart */}
					<div className='h-full w-full rounded-lg border bg-gray-50 relative overflow-hidden'>
						{/* Simulate chart grid lines */}
						<div className='absolute inset-0 opacity-30'>
							{/* Horizontal lines */}
							{Array.from({ length: 5 }).map((_, i) => (
								<div
									key={`h-${i}`}
									className='absolute w-full border-t border-gray-300'
									style={{ top: `${(i + 1) * 20}%` }}
								/>
							))}
							{/* Vertical lines */}
							{Array.from({ length: 6 }).map((_, i) => (
								<div
									key={`v-${i}`}
									className='absolute h-full border-l border-gray-300'
									style={{ left: `${(i + 1) * 16.66}%` }}
								/>
							))}
						</div>

						{/* Simulate chart curves */}
						<div className='absolute inset-4 flex items-end justify-between'>
							{Array.from({ length: 8 }).map((_, i) => {
								// Generate height once per render using a deterministic value
								const height = ((i * 7 + 13) % 60) + 20
								return (
									<div key={i} className='flex flex-col items-center space-y-1'>
										<div
											className='w-2 bg-gray-300 animate-pulse relative overflow-hidden'
											style={{ height: `${height}%` }}
										>
											<div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12 animate-shimmer' />
										</div>
									</div>
								)
							})}
						</div>

						{/* Main shimmer overlay for the entire chart area */}
						<div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 animate-shimmer' />
					</div>
				</div>
			</CardContent>
		</Card>
	</div>
)
