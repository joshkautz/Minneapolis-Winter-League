import { useMemo, useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCollection, useDocument } from 'react-firebase-hooks/firestore'
import { Timestamp } from '@firebase/firestore'
import { getDoc } from 'firebase/firestore'
import { CheckCircledIcon } from '@radix-ui/react-icons'
import { Sparkles, Award } from 'lucide-react'
import { NotificationCard } from '@/shared/components'
import {
	DocumentReference,
	gamesByTeamQuery,
	teamsHistoryQuery,
	getTeamById,
	DocumentSnapshot,
	teamsBySeasonQuery,
} from '@/firebase/firestore'
import { teamBadgesQuery } from '@/firebase/collections/badges'
import {
	GameDocument,
	PlayerDocument,
	TeamDocument,
	BadgeDocument,
	TeamBadgeDocument,
	hasAssignedTeams,
	getTeamRole,
	formatTimestamp,
} from '@/shared/utils'
import { TeamRosterPlayer } from './team-roster-player'
import { TeamHistory } from './team-history'
import { useSeasonsContext } from '@/providers'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

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
	const [teamBadgesSnapshot, teamBadgesLoading] = useCollection(
		teamBadgesQuery(teamDocumentSnapshot?.ref)
	)

	// Process team badges to resolve badge references
	interface ProcessedBadge {
		id: string
		name: string
		description: string
		imageUrl: string | null
		awardedAt: Date
	}

	const [teamBadges, setTeamBadges] = useState<ProcessedBadge[]>([])

	useEffect(() => {
		if (!teamBadgesSnapshot) {
			setTeamBadges([])
			return
		}

		const processBadges = async () => {
			const results = await Promise.all(
				teamBadgesSnapshot.docs.map(async (teamBadgeDoc) => {
					const teamBadgeData = teamBadgeDoc.data() as TeamBadgeDocument

					try {
						// Fetch badge details
						const badgeDoc = await getDoc(teamBadgeData.badge)
						const badgeData = badgeDoc.data() as BadgeDocument | undefined

						if (!badgeData) {
							return null
						}

						return {
							id: teamBadgeDoc.id,
							name: badgeData.name,
							description: badgeData.description,
							imageUrl: badgeData.imageUrl,
							awardedAt: teamBadgeData.awardedAt.toDate(),
						} as ProcessedBadge
					} catch (error) {
						console.error(`Error processing badge ${teamBadgeDoc.id}:`, error)
						return null
					}
				})
			)

			setTeamBadges(results.filter((badge) => badge !== null) as ProcessedBadge[])
		}

		processBadges()
	}, [teamBadgesSnapshot])

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
			<div className={'w-1/2 md:w-1/4 my-8 mx-auto group'}>
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
			<div className='max-w-[1040px] mx-auto mb-4'>
				<Card className='border-muted'>
					<CardContent>
						<div className='flex justify-center items-center gap-3'>
							{teamDocumentSnapshot?.data()?.karma !== undefined &&
							teamDocumentSnapshot.data()!.karma > 0 ? (
								<Badge
									variant='outline'
									className='text-sm font-normal border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-1.5'
								>
									<Sparkles className='h-4 w-4 mr-1.5' />
									{teamDocumentSnapshot.data()!.karma} Karma
								</Badge>
							) : (
								<p className='text-sm text-muted-foreground'>
									No achievements yet
								</p>
							)}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Team Badges Section */}
			{teamBadges.length > 0 && (
				<div className='max-w-[1040px] mx-auto mb-4'>
					<Card className='border-muted'>
						<CardContent className='pt-6'>
							<div className='space-y-4'>
								<div className='flex items-center gap-2'>
									<Award className='h-5 w-5 text-amber-600' />
									<h3 className='text-lg font-semibold'>Team Badges</h3>
								</div>
								<div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'>
									{teamBadges.map((badge) => (
										<div
											key={badge.id}
											className='flex flex-col items-center p-4 rounded-lg border border-muted bg-card hover:bg-accent/50 transition-colors'
										>
											{badge.imageUrl ? (
												<img
													src={badge.imageUrl}
													alt={badge.name}
													className='w-16 h-16 object-cover rounded-full mb-3'
												/>
											) : (
												<div className='w-16 h-16 bg-amber-100 dark:bg-amber-950 rounded-full flex items-center justify-center mb-3'>
													<Award className='h-8 w-8 text-amber-600' />
												</div>
											)}
											<h4 className='font-semibold text-center mb-1'>
												{badge.name}
											</h4>
											<p className='text-xs text-muted-foreground text-center line-clamp-2'>
												{badge.description}
											</p>
										</div>
									))}
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			)}

			<div className='max-w-[1040px] mx-auto'>
				<div className='flex justify-center items-start gap-4 flex-wrap mb-4'>
					<NotificationCard
						title={'Roster'}
						description={
							teamDocumentSnapshot
								? `${teamDocumentSnapshot?.data()?.name} team players and captains`
								: ``
						}
						className={'flex-1 basis-[360px] shrink-0'}
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
						className={'flex-1 basis-[360px] shrink-0'}
					>
						<div className='flex flex-col items-end gap-2 py-2'>
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

								return (
									<div
										key={index}
										className={'flex items-center justify-between w-full h-8'}
									>
										<p
											className={
												'flex grow-1 select-none basis-[92px] shrink-0'
											}
										>
											{gameData.date.toDate().toLocaleDateString()}
										</p>
										<p
											className={
												'flex grow-1 text-center basis-[74px] shrink-0 select-none'
											}
										>
											{result}
										</p>
										<div className='flex grow-3 shrink-0 basis-[100px] overflow-hidden text-clip'>
											<Link
												className='flex flex-col transition duration-300 group w-max'
												to={`/teams/${opponentTeamRef.id}`}
											>
												{
													teamsQuerySnapshot?.docs
														.find((team) => team.id === opponentTeamRef.id)
														?.data().name
												}
												<span className='max-w-0 group-hover:max-w-full transition-all duration-500 h-0.5 bg-primary' />
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
