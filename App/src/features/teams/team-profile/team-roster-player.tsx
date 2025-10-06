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
import { Sparkles } from 'lucide-react'

const KARMA_BONUS_FOR_LOOKING_FOR_TEAM = 100

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

	const isLookingForTeam = useMemo(() => {
		if (!playerData || !seasonRef) return false
		const seasonData = playerData.seasons?.find(
			(s) => s.season.id === seasonRef.id
		)
		return seasonData?.lookingForTeam || false
	}, [playerData, seasonRef])

	const isFullyRegistered = useMemo(
		() => isPlayerPaid && isPlayerSigned,
		[isPlayerPaid, isPlayerSigned]
	)

	return (
		<div>
			{playerSnapshot ? (
				<div className='flex items-end gap-2 py-2'>
					<div className='flex flex-row items-center gap-2'>
						<p className='select-none'>
							{playerSnapshot.data()?.firstname}{' '}
							{playerSnapshot.data()?.lastname}{' '}
						</p>
						{isPlayerCaptain && <StarFilledIcon className='text-primary' />}
						{isLookingForTeam && (
							<Badge
								variant='outline'
								className={
									isFullyRegistered
										? 'text-xs font-normal border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20'
										: 'text-xs font-normal border-muted-foreground/20 text-muted-foreground bg-muted/50'
								}
							>
								<Sparkles className='h-3 w-3 mr-1' />+
								{KARMA_BONUS_FOR_LOOKING_FOR_TEAM}
							</Badge>
						)}
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
