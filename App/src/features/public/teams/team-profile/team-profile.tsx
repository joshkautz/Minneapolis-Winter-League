import { useMemo, useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCollection, useDocument } from 'react-firebase-hooks/firestore'
import { Timestamp } from '@firebase/firestore'
import { CheckCircledIcon } from '@radix-ui/react-icons'
import { Sparkles, Award, Lock } from 'lucide-react'
import { NotificationCard } from '@/shared/components'
import {
	DocumentReference,
	gamesByTeamQuery,
	teamsHistoryQuery,
	getTeamById,
	DocumentSnapshot,
	teamsBySeasonQuery,
} from '@/firebase/firestore'
import {
	teamBadgesQuery,
	allBadgesQuery,
} from '@/firebase/collections/badges'
import { allTeamsQuery } from '@/firebase/collections/teams'
import {
	GameDocument,
	PlayerDocument,
	TeamDocument,
	hasAssignedTeams,
	getTeamRole,
	formatTimestamp,
} from '@/shared/utils'
import { BadgeDocument, TeamBadgeDocument } from '@/types'
import { TeamRosterPlayer } from './team-roster-player'
import { TeamHistory } from './team-history'
import { useSeasonsContext } from '@/providers'
import { Badge } from '@/components/ui/badge'
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from '@/components/ui/hover-card'

const RESULT = {
	VS: 'vs',
	UNREPORTED: 'Unreported',
} as const

const formatGameResult = (
	team: DocumentSnapshot<TeamDocument> | undefined,
	gameData: GameDocument
) => {
	// Skip games with null team references (placeholder games)
	if (!hasAssignedTeams(gameData)) {
		return 'TBD'
	}

	const { homeScore, awayScore } = gameData
	const teamRole = team?.id ? getTeamRole(gameData, team.id) : null
	const isInFuture = gameData.date > Timestamp.now()
	const isScoreReported =
		Number.isInteger(homeScore) && Number.isInteger(awayScore)

	if (isInFuture) {
		return RESULT.VS
	}

	if (!isScoreReported) {
		return RESULT.UNREPORTED
	}

	// Return score from team's perspective
	return teamRole === 'home'
		? `${homeScore} - ${awayScore}`
		: `${awayScore} - ${homeScore}`
}

export const TeamProfile = () => {
	const { id } = useParams()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const [teamDocumentSnapshot, teamDocumentSnapshotLoading] = useDocument(
		getTeamById(id)
	)

	const [historyQuerySnapshot, historyQuerySnapshotLoading] = useCollection(
		teamsHistoryQuery(teamDocumentSnapshot?.data()?.teamId)
	)

	const [teamsQuerySnapshot, teamsQuerySnapshotLoading] = useCollection(
		teamsBySeasonQuery(teamDocumentSnapshot?.data()?.season)
	)

	const [gamesQuerySnapshot, gamesQuerySnapshotLoading] = useCollection(
		gamesByTeamQuery(teamDocumentSnapshot?.ref)
	)

	// Fetch team badges
	const [teamBadgesSnapshot] = useCollection(
		teamBadgesQuery(teamDocumentSnapshot?.ref)
	)

	// Fetch all badges
	const [allBadgesSnapshot] = useCollection(allBadgesQuery())

	// Fetch all teams to calculate unique teamIds
	const [allTeamsSnapshot] = useCollection(allTeamsQuery())

	// Enhanced badge interface with earned status and percentage
	interface EnhancedBadge {
		id: string
		name: string
		description: string
		imageUrl: string | null
		isEarned: boolean
		awardedAt: Date | null
		percentageEarned: number // Percentage of unique teams that have this badge
	}

	const [allBadgesWithStats, setAllBadgesWithStats] = useState<
		EnhancedBadge[]
	>([])

	// Process all badges with stats (percentage, earned status)
	useEffect(() => {
		const processAllBadgesWithStats = async () => {
			if (!allBadgesSnapshot || !allTeamsSnapshot || !teamBadgesSnapshot) {
				setAllBadgesWithStats([])
				return
			}

			// Calculate total unique teamIds across all teams
			const uniqueTeamIds = new Set<string>()
			allTeamsSnapshot.docs.forEach((teamDoc) => {
				const teamData = teamDoc.data() as TeamDocument
				uniqueTeamIds.add(teamData.teamId)
			})
			const totalUniqueTeams = uniqueTeamIds.size

			// Create a set of earned badge IDs for this team
			const earnedBadgeIds = new Set(
				teamBadgesSnapshot.docs.map((doc) => doc.id)
			)

			// Process each badge
			const results = await Promise.all(
				allBadgesSnapshot.docs.map(async (badgeDoc) => {
					const badgeData = badgeDoc.data() as BadgeDocument
					const badgeId = badgeDoc.id

					// Check if this team has earned this badge
					const isEarned = earnedBadgeIds.has(badgeId)

					// Get awarded date if earned
					let awardedAt: Date | null = null
					if (isEarned) {
						const teamBadgeDoc = teamBadgesSnapshot.docs.find(
							(doc) => doc.id === badgeId
						)
						if (teamBadgeDoc) {
							const teamBadgeData = teamBadgeDoc.data() as TeamBadgeDocument
							awardedAt = teamBadgeData.awardedAt.toDate()
						}
					}

					// Calculate percentage using pre-calculated stats
					// Fallback to 0 for badges created before stats field was added
					const totalTeamsAwarded = badgeData.stats?.totalTeamsAwarded ?? 0
					const percentageEarned =
						totalUniqueTeams > 0 ? (totalTeamsAwarded / totalUniqueTeams) * 100 : 0

					return {
						id: badgeId,
						name: badgeData.name,
						description: badgeData.description,
						imageUrl: badgeData.imageUrl,
						isEarned,
						awardedAt,
						percentageEarned,
					} as EnhancedBadge
				})
			)

			// Sort badges: earned first (alphabetical), then unearned (alphabetical)
			const sortedBadges = results.sort((a, b) => {
				// First, sort by earned status (earned = true comes first)
				if (a.isEarned !== b.isEarned) {
					return a.isEarned ? -1 : 1
				}
				// Then sort alphabetically by name within each group
				return a.name.localeCompare(b.name)
			})

			setAllBadgesWithStats(sortedBadges)
		}

		processAllBadgesWithStats()
	}, [allBadgesSnapshot, allTeamsSnapshot, teamBadgesSnapshot])

	const isLoading = useMemo(
		() =>
			teamDocumentSnapshotLoading ||
			historyQuerySnapshotLoading ||
			teamsQuerySnapshotLoading ||
			gamesQuerySnapshotLoading,
		[
			teamDocumentSnapshotLoading,
			historyQuerySnapshotLoading,
			teamsQuerySnapshotLoading,
			gamesQuerySnapshotLoading,
		]
	)

	const [imageError, setImageError] = useState(false)

	const registrationStatus = useMemo(
		() =>
			isLoading ? (
				<p className='text-sm text-muted-foreground'>Loading...</p>
			) : teamDocumentSnapshot?.data()?.registered ? (
				<p
					className={
						'text-sm text-muted-foreground inline-flex gap-2 items-center'
					}
				>
					{teamDocumentSnapshot?.data()?.name} is fully registered
					<CheckCircledIcon className='w-4 h-4' />
				</p>
			) : (
				<p className={'text-sm text-muted-foreground'}>
					You need 10 registered players in order to meet the minimum
					requirement. Registration ends{' '}
					{formatTimestamp(
						currentSeasonQueryDocumentSnapshot?.data().registrationEnd
					)}
					.
				</p>
			),
		[isLoading, teamDocumentSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	return (
		<div className={'container'}>
			<div className='w-full max-w-64 my-8 mx-auto group'>
				<div className='aspect-square w-full overflow-hidden rounded-lg bg-muted'>
					{teamDocumentSnapshot?.data()?.logo && !imageError ? (
						<img
							src={teamDocumentSnapshot.data()?.logo || undefined}
							alt={`${teamDocumentSnapshot.data()?.name || 'Team'} logo`}
							className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 rounded-lg'
							onError={() => setImageError(true)}
						/>
					) : (
						<div className='flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-sky-300'>
							<span className='text-4xl font-bold text-primary-foreground'>
								{teamDocumentSnapshot?.data()?.name?.charAt(0)?.toUpperCase() ||
									'T'}
							</span>
						</div>
					)}
				</div>
			</div>
			{/* Karma Display */}
			<div className='max-w-[1040px] mx-auto mb-4'>
				<div className='flex justify-center items-center'>
					{teamDocumentSnapshot?.data()?.karma !== undefined &&
					teamDocumentSnapshot.data()!.karma > 0 ? (
						<Badge
							variant='outline'
							className='text-sm font-normal border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-1.5'
						>
							<Sparkles className='h-4 w-4 mr-1.5' />
							{teamDocumentSnapshot.data()!.karma} Karma
						</Badge>
					) : null}
				</div>
			</div>

			<div className='max-w-[1040px] mx-auto'>
				<div className='flex justify-center items-start gap-4 flex-wrap mb-4'>
					{/* Badges Card */}
					<NotificationCard
						title={'Badges'}
						description={`${allBadgesWithStats.filter((b) => b.isEarned).length} of ${allBadgesWithStats.length} earned`}
						className={'flex-1 basis-full shrink-0 max-w-full min-w-[360px]'}
					>
						{allBadgesWithStats.length > 0 ? (
							<div
								className='flex flex-wrap gap-3 py-2'
								role='list'
								aria-label='Team badges'
							>
								{allBadgesWithStats.map((badge) => (
									<HoverCard key={badge.id} openDelay={200}>
										<HoverCardTrigger asChild>
											<div
												role='listitem'
												className='relative flex items-center justify-center w-16 h-16 cursor-pointer transition-transform hover:scale-110 flex-shrink-0'
												aria-label={
													badge.isEarned
														? `${badge.name} - Earned`
														: `${badge.name} - Locked`
												}
											>
												{/* Badge Image */}
												{badge.imageUrl ? (
													<img
														src={badge.imageUrl}
														alt=''
														role='presentation'
														className={`w-full h-full object-cover rounded-full ${
															!badge.isEarned ? 'grayscale opacity-40' : ''
														}`}
													/>
												) : (
													<div
														className={`w-full h-full bg-amber-100 dark:bg-amber-950 rounded-full flex items-center justify-center ${
															!badge.isEarned ? 'grayscale opacity-40' : ''
														}`}
														aria-hidden='true'
													>
														<Award
															className={`h-6 w-6 ${
																badge.isEarned
																	? 'text-amber-600'
																	: 'text-muted-foreground'
															}`}
														/>
													</div>
												)}

												{/* Lock Icon for Unearned Badges */}
												{!badge.isEarned && (
													<div className='absolute inset-0 flex items-center justify-center'>
														<div className='bg-background/80 backdrop-blur-sm rounded-full p-2'>
															<Lock className='h-4 w-4 text-muted-foreground' />
														</div>
													</div>
												)}
											</div>
										</HoverCardTrigger>
										<HoverCardContent
											className='w-80'
											side='top'
											align='center'
										>
											<div className='space-y-2'>
												<div className='flex items-start justify-between gap-2'>
													<h4 className='text-sm font-semibold'>{badge.name}</h4>
													{badge.imageUrl && (
														<img
															src={badge.imageUrl}
															alt=''
															role='presentation'
															className='w-8 h-8 object-cover rounded-full flex-shrink-0'
														/>
													)}
												</div>
												<p className='text-xs text-muted-foreground'>
													{badge.description}
												</p>
												<div className='pt-2 border-t space-y-1'>
													<div className='flex justify-between text-xs'>
														<span className='text-muted-foreground'>Status:</span>
														<span
															className={
																badge.isEarned
																	? 'text-green-600 dark:text-green-400 font-medium'
																	: 'text-muted-foreground'
															}
														>
															{badge.isEarned ? 'Earned' : 'Locked'}
														</span>
													</div>
													<div className='flex justify-between text-xs'>
														<span className='text-muted-foreground'>
															Date awarded:
														</span>
														<span className='text-muted-foreground'>
															{badge.isEarned && badge.awardedAt
																? badge.awardedAt.toLocaleDateString()
																: 'Locked'}
														</span>
													</div>
													<div className='flex justify-between text-xs'>
														<span className='text-muted-foreground'>
															Teams with badge:
														</span>
														<span className='text-muted-foreground'>
															{badge.percentageEarned.toFixed(1)}%
														</span>
													</div>
												</div>
											</div>
										</HoverCardContent>
									</HoverCard>
								))}
							</div>
						) : (
							<div className='text-center py-8'>
								<Award
									className='h-12 w-12 mx-auto text-muted-foreground/50 mb-3'
									aria-hidden='true'
								/>
								<p className='text-sm text-muted-foreground'>
									No badges in the system yet
								</p>
							</div>
						)}
					</NotificationCard>

					{/* Roster Card */}
					<NotificationCard
						title={'Roster'}
						description={
							teamDocumentSnapshot
								? `${teamDocumentSnapshot?.data()?.name} team players and captains`
								: ``
						}
						className={'flex-1 basis-[360px] shrink-0 min-w-[360px]'}
						footerContent={
							<div className='flex items-center justify-between gap-2'>
								<div className='flex-1'>{registrationStatus}</div>
							</div>
						}
					>
						{teamDocumentSnapshot?.data()?.roster?.map(
							(
								item: {
									captain: boolean
									player: DocumentReference<PlayerDocument>
								},
								index: number
							) => (
								<TeamRosterPlayer
									key={`team-${index}`}
									playerRef={item.player}
									seasonRef={teamDocumentSnapshot.data()?.season}
								/>
							)
						)}
					</NotificationCard>
					<NotificationCard
						title={'Record'}
						className={'flex-1 basis-[360px] shrink-0 min-w-[360px]'}
					>
						<div className='flex flex-col gap-3 py-2'>
							{gamesQuerySnapshot?.docs.map((game, index) => {
								const gameData = game.data()

								// Skip games with null team references (placeholder games)
								if (!hasAssignedTeams(gameData)) {
									return null
								}

								const teamRole = teamDocumentSnapshot?.id
									? getTeamRole(gameData, teamDocumentSnapshot.id)
									: null
								const opponentTeamRef = teamDocumentSnapshot?.id
									? teamRole === 'home'
										? gameData.away
										: gameData.home
									: null
								const result = formatGameResult(teamDocumentSnapshot, gameData)

								if (!opponentTeamRef) {
									return null
								}

								const gameDate = gameData.date.toDate()
								const opponentName =
									teamsQuerySnapshot?.docs
										.find((team) => team.id === opponentTeamRef.id)
										?.data().name || 'TBD'

								return (
									<div
										key={index}
										className='flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 pb-3 border-b last:border-b-0 last:pb-0'
									>
										{/* Date, Time, Field - Mobile: stacked, Desktop: inline */}
										<div className='flex items-center gap-2 text-xs text-muted-foreground min-w-0'>
											<time
												dateTime={gameDate.toISOString()}
												className='shrink-0'
											>
												{gameDate.toLocaleDateString('en-US', {
													month: 'short',
													day: 'numeric',
												})}
											</time>
											<span className='shrink-0'>•</span>
											<span className='shrink-0'>
												{gameDate.toLocaleTimeString('en-US', {
													hour: 'numeric',
													minute: '2-digit',
												})}
											</span>
											<span className='shrink-0'>•</span>
											<span className='shrink-0'>Field {gameData.field}</span>
										</div>

										{/* Score and Opponent - Mobile: full width, Desktop: flex */}
										<div className='flex items-center gap-3 min-w-0 sm:flex-1'>
											<p className='text-sm font-medium shrink-0 w-16 text-center'>
												{result}
											</p>
											<Link
												className='flex-1 min-w-0 text-sm transition-colors hover:text-primary truncate'
												to={`/teams/${opponentTeamRef.id}`}
												title={opponentName}
											>
												{opponentName}
											</Link>
										</div>
									</div>
								)
							})}
						</div>
					</NotificationCard>
				</div>
				{historyQuerySnapshot && (
					<TeamHistory
						teamDocumentSnapshot={teamDocumentSnapshot}
						historyQuerySnapshot={historyQuerySnapshot}
					/>
				)}
			</div>
		</div>
	)
}
