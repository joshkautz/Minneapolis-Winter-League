// import { useSeasonsContext } from '@/providers'
// import { useEffect, useState } from 'react'

// const HOURS = 1000 * 60 * 60
// const MINUTES = 1000 * 60

export const RegistrationCountdown = () => {
	// const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()
	// const [remaining, setRemaining] = useState<number>()

	// useEffect(() => {
	// 	if (currentSeasonQueryDocumentSnapshot === undefined) return

	// 	const currentDate = new Date()
	// 	const startDate = currentSeasonQueryDocumentSnapshot
	// 		?.data()
	// 		.registrationStart.toDate()

	// 	setRemaining(startDate.getTime() - currentDate.getTime())

	// 	const interval = setInterval(
	// 		() =>
	// 			setRemaining((prevTime) => {
	// 				if (prevTime === 0) {
	// 					clearInterval(interval)
	// 					return 0
	// 				} else if (prevTime === undefined) {
	// 					return startDate.getTime() - currentDate.getTime()
	// 				} else {
	// 					return prevTime - 1000
	// 				}
	// 			}),
	// 		1000
	// 	)

	// 	return () => clearInterval(interval)
	// }, [currentSeasonQueryDocumentSnapshot])

	// const days = remaining ? Math.floor(remaining / (HOURS * 24)) : '?'
	// const hours = remaining ? Math.floor((remaining % (HOURS * 24)) / HOURS) : '?'
	// const minutes = remaining ? Math.floor((remaining % HOURS) / MINUTES) : '?'
	// const seconds = remaining ? Math.floor((remaining % MINUTES) / 1000) : '?'

	return (
		<div className='flex flex-col items-start'>
			<div className='text-3xl font-bold'>Registration is closed!</div>
			{/* {remaining === undefined ? (
				<div className="text-3xl font-bold">Registration...</div>
			) : remaining <= 0 ? (
				<div className="text-3xl font-bold">Registration is open!</div>
			) : (
				<div className="text-3xl font-bold">Registration opens soon!</div>
			)} */}
			{/* <div className="flex mt-2 space-x-2">
				<div className="flex flex-col items-center min-w-16">
					<p className="w-full p-2 text-3xl text-center rounded-lg bg-accent dark:bg-primary text-accent-foreground dark:text-primary-foreground">
						{0}
					</p>
					<p className="text-sm font-bold">days</p>
				</div>
				<div className="flex flex-col items-center min-w-16">
					<p className="w-full p-2 text-3xl text-center rounded-lg bg-accent dark:bg-primary text-accent-foreground dark:text-primary-foreground">
						{0}
					</p>
					<p className="text-sm font-bold">hours</p>
				</div>
				<div className="flex flex-col items-center min-w-16">
					<p className="w-full p-2 text-3xl text-center rounded-lg bg-accent dark:bg-primary text-accent-foreground dark:text-primary-foreground">
						{0}
					</p>
					<p className="text-sm font-bold">minutes</p>
				</div>
				<div className="flex flex-col items-center min-w-16">
					<p className="w-full p-2 text-3xl text-center rounded-lg bg-accent dark:bg-primary text-accent-foreground dark:text-primary-foreground">
						{0}
					</p>
					<p className="text-sm font-bold">seconds</p>
				</div>
			</div> */}
		</div>
	)
}
