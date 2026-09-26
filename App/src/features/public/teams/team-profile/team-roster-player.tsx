import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDocument } from 'react-firebase-hooks/firestore'
import { StarFilledIcon } from '@radix-ui/react-icons'

import { type DocumentReference } from 'firebase/firestore'
import { playerSeasonRef } from '@/firebase/collections/players'
import { Skeleton } from '@/components/ui/skeleton'
import { isPlayerRegisteredForSeason } from '@/shared/utils'
import { PlayerDocument, SeasonDocument } from '@/types'
import { Badge } from '@/components/ui/badge'
import { useSeasonsContext } from '@/providers'
import { useQueryErrorHandler } from '@/shared/hooks'

export const TeamRosterPlayer = ({
	playerRef,
	seasonRef,
}: {
	playerRef: DocumentReference<PlayerDocument>
	seasonRef: DocumentReference<SeasonDocument> | undefined
}) => {
	const [playerSnapshot, , playerError] = useDocument(playerRef)
	const [playerSeasonSnapshot] = useDocument(
		playerSeasonRef(playerRef.id, seasonRef?.id)
	)

	useQueryErrorHandler({
		error: playerError,
		component: 'TeamRosterPlayer',
		errorLabel: 'player',
		context: { playerId: playerRef.id },
	})

	const playerSeasonData = playerSeasonSnapshot?.data()

	const isPlayerCaptain = useMemo(
		() => playerSeasonData?.captain === true,
		[playerSeasonData]
	)
	// Registered means signed, plus paid under per-player pricing; the
	// season decides which.
	const { seasonsQuerySnapshot } = useSeasonsContext()
	const isPlayerRegistered = useMemo(
		() =>
			isPlayerRegisteredForSeason(
				playerSeasonData,
				seasonsQuerySnapshot?.docs
					.find((doc) => doc.id === seasonRef?.id)
					?.data()
			),
		[playerSeasonData, seasonsQuerySnapshot, seasonRef]
	)

	return (
		<div>
			{playerSnapshot ? (
				<div className='flex items-end gap-2 py-2'>
					<div className='flex flex-row items-center gap-2'>
						<Link
							to={`/players/${playerRef.id}`}
							className='hover:underline focus-visible:underline focus-visible:outline-none'
						>
							{playerSnapshot.data()?.firstname}{' '}
							{playerSnapshot.data()?.lastname}
						</Link>
						{isPlayerCaptain && <StarFilledIcon className='text-primary' />}
					</div>
					<div className='flex justify-end flex-1 gap-2'>
						<div className='flex items-center'>
							<Badge
								className={'select-none hover:bg-initial'}
								variant={isPlayerRegistered ? 'secondary' : 'outline'}
							>
								{isPlayerRegistered ? 'registered' : 'unregistered'}
							</Badge>
						</div>
					</div>
				</div>
			) : (
				<div className='flex items-end gap-2 py-2'>
					<div className='mr-2'>
						<Skeleton className='h-4 w-[250px]' />
					</div>
				</div>
			)}
		</div>
	)
}
