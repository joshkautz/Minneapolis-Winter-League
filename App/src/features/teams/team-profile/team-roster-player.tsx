import { DocumentReference } from '@/firebase/firestore'

import { StarFilledIcon } from '@radix-ui/react-icons'
import { useMemo } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
	PlayerDocument,
	SeasonDocument,
	isPlayerCaptainForSeason,
	isPlayerPaidForSeason,
	isPlayerSignedForSeason,
} from '@/shared/utils'
import { useDocument } from 'react-firebase-hooks/firestore'
import { Badge } from '@/components/ui/badge'

export const TeamRosterPlayer = ({
	playerRef,
	seasonRef,
}: {
	playerRef: DocumentReference<PlayerDocument>
	seasonRef: DocumentReference<SeasonDocument> | undefined
}) => {
	const [playerSnapshot] = useDocument(playerRef as any)

	const playerData = playerSnapshot?.data() as PlayerDocument | undefined

	const isPlayerCaptain = useMemo(
		() => isPlayerCaptainForSeason(playerData, seasonRef),
		[playerData, seasonRef]
	)

	const isPlayerPaid = useMemo(
		() => isPlayerPaidForSeason(playerData, seasonRef),
		[playerData, seasonRef]
	)

	const isPlayerSigned = useMemo(
		() => isPlayerSignedForSeason(playerData, seasonRef),
		[playerData, seasonRef]
	)

	return (
		<div>
			{playerSnapshot ? (
				<div className='flex items-end gap-2 py-2'>
					<div className='flex flex-row items-center'>
						<p className='mr-2 select-none'>
							{playerSnapshot.data()?.firstname}{' '}
							{playerSnapshot.data()?.lastname}{' '}
						</p>
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
