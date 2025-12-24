import { useSeasonsContext } from '@/providers'
import { useEffect, useState, useMemo } from 'react'
import { Timestamp } from '@firebase/firestore'
import { Skeleton } from '@/components/ui/skeleton'

const HOURS = 1000 * 60 * 60
const MINUTES = 1000 * 60

enum SeasonState {
	BEFORE_REGISTRATION = 'BEFORE_REGISTRATION',
	REGISTRATION_OPEN = 'REGISTRATION_OPEN',
	BEFORE_SEASON = 'BEFORE_SEASON',
	SEASON_ACTIVE = 'SEASON_ACTIVE',
	SEASON_ENDED = 'SEASON_ENDED',
}

export const RegistrationCountdown = () => {
	const {
		currentSeasonQueryDocumentSnapshot,
		currentSeasonQueryDocumentSnapshotLoading,
	} = useSeasonsContext()
	const [remaining, setRemaining] = useState<number>()

	const seasonState = useMemo(() => {
		if (!currentSeasonQueryDocumentSnapshot) return null

		const now = Timestamp.now()
		const data = currentSeasonQueryDocumentSnapshot.data()
		const registrationStart = data.registrationStart
		const registrationEnd = data.registrationEnd
		const seasonStart = data.dateStart
		const seasonEnd = data.dateEnd

		if (now.seconds < registrationStart.seconds) {
			return SeasonState.BEFORE_REGISTRATION
		} else if (now.seconds < registrationEnd.seconds) {
			return SeasonState.REGISTRATION_OPEN
		} else if (now.seconds < seasonStart.seconds) {
			return SeasonState.BEFORE_SEASON
		} else if (now.seconds < seasonEnd.seconds) {
			return SeasonState.SEASON_ACTIVE
		} else {
			return SeasonState.SEASON_ENDED
		}
	}, [currentSeasonQueryDocumentSnapshot])

	const targetDate = useMemo(() => {
		if (!currentSeasonQueryDocumentSnapshot || seasonState === null)
			return null

		const data = currentSeasonQueryDocumentSnapshot.data()

		switch (seasonState) {
			case SeasonState.BEFORE_REGISTRATION:
				return data.registrationStart.toDate()
			case SeasonState.REGISTRATION_OPEN:
				return data.registrationEnd.toDate()
			case SeasonState.BEFORE_SEASON:
				return data.dateStart.toDate()
			case SeasonState.SEASON_ACTIVE:
				return data.dateEnd.toDate()
			case SeasonState.SEASON_ENDED:
				return null
		}
	}, [currentSeasonQueryDocumentSnapshot, seasonState])

	useEffect(() => {
		if (!targetDate) {
			// Schedule state update for next tick to avoid sync setState in effect
			const timer = setTimeout(() => setRemaining(undefined), 0)
			return () => clearTimeout(timer)
		}

		const updateRemaining = () => {
			const currentTime = new Date().getTime()
			const targetTime = targetDate.getTime()
			const timeDiff = targetTime - currentTime

			if (timeDiff <= 0) {
				setRemaining(0)
				return true // Signal that countdown is done
			} else {
				setRemaining(timeDiff)
				return false
			}
		}

		// Initial calculation
		const isDone = updateRemaining()
		if (isDone) return

		const interval = setInterval(() => {
			const isDone = updateRemaining()
			if (isDone) {
				clearInterval(interval)
			}
		}, 1000)

		return () => clearInterval(interval)
	}, [targetDate])

	const days =
		remaining !== undefined && remaining > 0
			? Math.floor(remaining / (HOURS * 24))
			: 0
	const hours =
		remaining !== undefined && remaining > 0
			? Math.floor((remaining % (HOURS * 24)) / HOURS)
			: 0
	const minutes =
		remaining !== undefined && remaining > 0
			? Math.floor((remaining % HOURS) / MINUTES)
			: 0
	const seconds =
		remaining !== undefined && remaining > 0
			? Math.floor((remaining % MINUTES) / 1000)
			: 0

	const seasonName = currentSeasonQueryDocumentSnapshot?.data()?.name

	const getSubtitleText = () => {
		switch (seasonState) {
			case SeasonState.BEFORE_REGISTRATION:
				return 'Registration opens in:'
			case SeasonState.REGISTRATION_OPEN:
				return 'Registration closes in:'
			case SeasonState.BEFORE_SEASON:
				return 'Season begins in:'
			case SeasonState.SEASON_ACTIVE:
				return 'Season ends in:'
			case SeasonState.SEASON_ENDED:
				return 'Season has ended'
			default:
				return ''
		}
	}

	// Loading state
	if (
		currentSeasonQueryDocumentSnapshotLoading ||
		!currentSeasonQueryDocumentSnapshot
	) {
		return (
			<div className='flex flex-col items-start'>
				<Skeleton className='h-10 w-56 mb-1' />
				<Skeleton className='h-5 w-44 mb-2' />
				<div className='flex mt-2 space-x-2'>
					{[...Array(4)].map((_, index) => (
						<div key={index} className='flex flex-col items-center min-w-16'>
							<Skeleton className='w-full h-12 rounded-lg' />
							<Skeleton className='h-4 w-12 mt-2' />
						</div>
					))}
				</div>
			</div>
		)
	}

	const showCountdown =
		seasonState !== SeasonState.SEASON_ENDED &&
		remaining !== undefined &&
		remaining > 0

	return (
		<section
			className='flex flex-col items-start'
			aria-label='Season countdown'
		>
			<h2 className='text-4xl font-bold tracking-tight'>{seasonName}</h2>
			<p className='text-lg text-muted-foreground mt-1 mb-2'>
				{getSubtitleText()}
			</p>
			{showCountdown && (
				<div className='flex mt-2 space-x-2'>
					<div className='flex flex-col items-center min-w-16'>
						<p className='w-full p-2 text-3xl text-center rounded-lg bg-accent text-accent-foreground'>
							{days}
						</p>
						<p className='text-sm font-bold'>days</p>
					</div>
					<div className='flex flex-col items-center min-w-16'>
						<p className='w-full p-2 text-3xl text-center rounded-lg bg-accent text-accent-foreground'>
							{hours}
						</p>
						<p className='text-sm font-bold'>hours</p>
					</div>
					<div className='flex flex-col items-center min-w-16'>
						<p className='w-full p-2 text-3xl text-center rounded-lg bg-accent text-accent-foreground'>
							{minutes}
						</p>
						<p className='text-sm font-bold'>minutes</p>
					</div>
					<div className='flex flex-col items-center min-w-16'>
						<p className='w-full p-2 text-3xl text-center rounded-lg bg-accent text-accent-foreground'>
							{seconds}
						</p>
						<p className='text-sm font-bold'>seconds</p>
					</div>
				</div>
			)}
		</section>
	)
}
