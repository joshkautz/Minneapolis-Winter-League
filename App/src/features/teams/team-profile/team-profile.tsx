import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { NotificationCard } from '@/shared/components'
import {
	DocumentReference,
	DocumentData,
	gamesByTeamQuery,
	teamsHistoryQuery,
	getTeamById,
	DocumentSnapshot,
	teamsBySeasonQuery,
} from '@/firebase/firestore'
import { GameData, PlayerData, TeamData } from '@/shared/utils'
import { TeamRosterPlayer } from './team-roster-player'
import { useCollection, useDocument } from 'react-firebase-hooks/firestore'
import { Timestamp } from '@firebase/firestore'

import { CheckCircledIcon } from '@radix-ui/react-icons'
import { Skeleton } from '@/components/ui/skeleton'
import { TeamHistory } from './team-history'
import {
	TeamRecordRoot,
	TeamRecordRow,
	TeamRecordRowDate,
	TeamRecordRowResult,
} from './team-record'
import { useSeasonsContext } from '@/providers'
import { formatTimestamp } from '@/shared/utils'

const OPPONENT = {
	HOME: 'HOME',
	AWAY: 'AWAY',
} as const

const RESULT = {
	VS: 'vs',
	UNREPORTED: 'Unreported',
} as const

const formatGameResult = (
	team: DocumentSnapshot<TeamData, DocumentData> | undefined,
	gameData: GameData
) => {
	const { homeScore, awayScore } = gameData
	const opponent = team?.id == gameData.home.id ? OPPONENT.AWAY : OPPONENT.HOME
	const isInFuture = gameData.date > Timestamp.now()
	const isScoreReported =
		Number.isInteger(homeScore) && Number.isInteger(awayScore)
	return isInFuture
		? RESULT.VS
		: isScoreReported
			? opponent == OPPONENT.AWAY
				? `${homeScore} - ${awayScore}`
				: `${awayScore} - ${homeScore}`
			: RESULT.UNREPORTED
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

	const [teamProfileImageLoaded, setTeamProfileImageLoaded] = useState(false)
	const [imgSrc, setImgSrc] = useState<string | undefined>()

	useEffect(() => {
		setImgSrc(teamDocumentSnapshot?.data()?.logo + `&date=${Date.now()}`)
	}, [teamDocumentSnapshot])

	const registrationStatus = useMemo(
		() =>
			isLoading ? (
				<p className="text-sm text-muted-foreground">Loading...</p>
			) : teamDocumentSnapshot?.data()?.registered ? (
				<p
					className={
						'text-sm text-muted-foreground inline-flex gap-2 items-center'
					}
				>
					{teamDocumentSnapshot?.data()?.name} is fully registered
					<CheckCircledIcon className="w-4 h-4" />
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
		[isLoading, teamDocumentSnapshot]
	)

	return (
		<div className={'container'}>
			<div className={'w-1/2 md:w-1/4 my-8 mx-auto'}>
				{teamProfileImageLoaded ? null : (
					<Skeleton className="h-[100px] md:h-[250px] md:w-1/4" />
				)}
				<img
					onError={() => {
						setTeamProfileImageLoaded(false)
					}}
					style={teamProfileImageLoaded ? {} : { display: 'none' }}
					src={imgSrc}
					onLoad={() => {
						setTeamProfileImageLoaded(true)
					}}
					alt={'team logo'}
					className={'rounded-md'}
				/>
			</div>

			<div className="flex justify-center items-start gap-8 flex-wrap max-w-[1040px] mx-auto">
				<NotificationCard
					title={'Roster'}
					description={
						teamDocumentSnapshot
							? `${teamDocumentSnapshot?.data()?.name} team players and captains`
							: ``
					}
					className={'flex-1 basis-[360px] shrink-0'}
					footerContent={registrationStatus}
				>
					{teamDocumentSnapshot?.data()?.roster?.map(
						(
							item: {
								captain: boolean
								player: DocumentReference<PlayerData, DocumentData>
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
				<TeamRecordRoot>
					{gamesQuerySnapshot?.docs.map((game, index) => {
						const gameData = game.data()
						const opponent =
							teamDocumentSnapshot?.id == gameData.home.id
								? OPPONENT.AWAY
								: OPPONENT.HOME
						const result = formatGameResult(teamDocumentSnapshot, gameData)

						return (
							<TeamRecordRow key={index}>
								<TeamRecordRowDate>
									{gameData.date.toDate().toLocaleDateString()}
								</TeamRecordRowDate>
								<TeamRecordRowResult>{result}</TeamRecordRowResult>
								<div className="flex grow-3 shrink-0 basis-[100px] overflow-hidden text-clip">
									<Link
										className="flex flex-col transition duration-300 group w-max"
										to={
											opponent == OPPONENT.AWAY
												? `/teams/${gameData.away.id}`
												: `/teams/${gameData.home.id}`
										}
									>
										{opponent == OPPONENT.AWAY
											? teamsQuerySnapshot?.docs
													.find((team) => team.id === gameData.away.id)
													?.data().name
											: teamsQuerySnapshot?.docs
													.find((team) => team.id === gameData.home.id)
													?.data().name}
										<span className="max-w-0 group-hover:max-w-full transition-all duration-500 h-0.5 bg-primary"></span>
									</Link>
								</div>
							</TeamRecordRow>
						)
					})}
				</TeamRecordRoot>
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
