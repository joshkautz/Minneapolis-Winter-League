import { useSeasonsContext } from '@/providers'
import { useEffect, useState, useMemo } from 'react'
import { Timestamp } from '@firebase/firestore'
import { Skeleton } from '@/components/ui/skeleton'

const HOURS = 1000 * 60 * 60
const MINUTES = 1000 * 60

enum RegistrationState {
	BEFORE_START = 'BEFORE_START',
	OPEN = 'OPEN',
	CLOSED = 'CLOSED',
}

export const RegistrationCountdown = () => {
	const {
		currentSeasonQueryDocumentSnapshot,
		currentSeasonQueryDocumentSnapshotLoading,
	} = useSeasonsContext()
	const [remaining, setRemaining] = useState<number>()

	const registrationState = useMemo(() => {
		if (!currentSeasonQueryDocumentSnapshot) return null

		const now = Timestamp.now()
		const registrationStart =
			currentSeasonQueryDocumentSnapshot.data().registrationStart
		const registrationEnd =
			currentSeasonQueryDocumentSnapshot.data().registrationEnd

		if (now.seconds < registrationStart.seconds) {
			return RegistrationState.BEFORE_START
		} else if (
			now.seconds >= registrationStart.seconds &&
			now.seconds < registrationEnd.seconds
		) {
			return RegistrationState.OPEN
		} else {
			return RegistrationState.CLOSED
		}
	}, [currentSeasonQueryDocumentSnapshot])

	const targetDate = useMemo(() => {
		if (!currentSeasonQueryDocumentSnapshot || registrationState === null)
			return null

		if (registrationState === RegistrationState.BEFORE_START) {
			return currentSeasonQueryDocumentSnapshot
				.data()
				.registrationStart.toDate()
		} else if (registrationState === RegistrationState.OPEN) {
			return currentSeasonQueryDocumentSnapshot.data().registrationEnd.toDate()
		}
		return null
	}, [currentSeasonQueryDocumentSnapshot, registrationState])

	useEffect(() => {
		if (!targetDate) {
			setRemaining(undefined)
			return
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

	const getHeaderText = () => {
		if (registrationState === RegistrationState.BEFORE_START) {
			return 'Registration opens soon!'
		} else if (registrationState === RegistrationState.OPEN) {
			return 'Registration is open!'
		} else {
			return 'Registration is closed!'
		}
	}

	const getSubHeaderText = () => {
		if (registrationState === RegistrationState.BEFORE_START) {
			return 'Time until registration opens:'
		} else if (registrationState === RegistrationState.OPEN) {
			return 'Time until registration closes:'
		}
		return null
	}

	// Loading state
	if (
		currentSeasonQueryDocumentSnapshotLoading ||
		!currentSeasonQueryDocumentSnapshot
	) {
		return (
			<div className='flex flex-col items-start'>
				<Skeleton className='h-9 w-64 mb-2' />
				<Skeleton className='h-5 w-48 mb-4' />
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
		registrationState !== RegistrationState.CLOSED &&
		remaining !== undefined &&
		remaining > 0

	return (
		<div className='flex flex-col items-start'>
			<div className='text-3xl font-bold'>{getHeaderText()}</div>
			{getSubHeaderText() && (
				<div className='text-lg text-muted-foreground mt-1 mb-2'>
					{getSubHeaderText()}
				</div>
			)}
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
		</div>
	)
}
