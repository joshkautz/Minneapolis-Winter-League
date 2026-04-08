import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDocument } from 'react-firebase-hooks/firestore'
import { toast } from 'sonner'
import { StarFilledIcon } from '@radix-ui/react-icons'

import { DocumentReference } from '@/firebase'
import { playerSeasonRef } from '@/firebase/collections/players'
import { Skeleton } from '@/components/ui/skeleton'
import { PlayerDocument, SeasonDocument, logger } from '@/shared/utils'
import { Badge } from '@/components/ui/badge'

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

	// Log and notify on query errors
	useEffect(() => {
		if (playerError) {
			logger.error('Failed to load player:', {
				component: 'TeamRosterPlayer',
				playerId: playerRef.id,
				error: playerError.message,
			})
			toast.error('Failed to load player', {
				description: playerError.message,
			})
		}
	}, [playerError, playerRef.id])

	const playerSeasonData = playerSeasonSnapshot?.data()

	const isPlayerCaptain = useMemo(
		() => playerSeasonData?.captain === true,
		[playerSeasonData]
	)
	const isPlayerPaid = useMemo(
		() => playerSeasonData?.paid === true,
		[playerSeasonData]
	)
	const isPlayerSigned = useMemo(
		() => playerSeasonData?.signed === true,
		[playerSeasonData]
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
								variant={
									isPlayerPaid && isPlayerSigned ? 'secondary' : 'outline'
								}
							>
								{isPlayerPaid && isPlayerSigned ? 'registered' : 'unregistered'}
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
