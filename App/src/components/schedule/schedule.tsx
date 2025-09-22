import { useMemo } from 'react'
import { DocumentData, QueryDocumentSnapshot } from '@/firebase/firestore'
import { GameData } from '@/lib/interfaces'
import { ReloadIcon } from '@radix-ui/react-icons'
import { GradientHeader } from '../gradient-header'
import { ComingSoon } from '../coming-soon'
import { useGamesContext } from '@/contexts/games-context'
import { ScheduleCard } from './schedule-card'
import { useSeasonsContext } from '@/contexts/seasons-context'
import { formatTimestamp } from '@/lib/utils'
// import {
// 	Card,
// 	CardHeader,
// 	CardTitle,
// 	CardDescription,
// 	CardContent,
// } from '../ui/card'

export const Schedule = () => {
	const { gamesQuerySnapshot } = useGamesContext()
	const { selectedSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const rounds: GameData[][] = useMemo(() => {
		const result: GameData[][] = []
		let index: number = 0
		let previousTimestamp: number = 0
		gamesQuerySnapshot?.docs
			.sort((a, b) => a.data().date.seconds - b.data().date.seconds)
			.forEach(
				(
					queryDocumentSnapshot: QueryDocumentSnapshot<GameData, DocumentData>
				) => {
					const currentTimestamp = queryDocumentSnapshot.data().date.seconds
					if (previousTimestamp == 0) {
						previousTimestamp = currentTimestamp
					}
					if (previousTimestamp !== currentTimestamp) {
						previousTimestamp = currentTimestamp
						index++
					}
					if (!result[index]) {
						result[index] = []
					}
					result[index].push(queryDocumentSnapshot.data())
				}
			)
		return result
	}, [gamesQuerySnapshot])

	return (
		<div className="container">
			<GradientHeader>Schedule</GradientHeader>

			{!gamesQuerySnapshot ? (
				<div className={'flex absolute inset-0 justify-center items-center'}>
					<ReloadIcon className={'mr-2 w-10 h-10 animate-spin'} />
				</div>
			) : gamesQuerySnapshot.docs.length == 0 ? (
				<div className={'flex flex-wrap gap-8'}>
					<ComingSoon>
						<p className={'pt-6'}>
							{`There is no schedule to display. Please wait for registration to end on ${formatTimestamp(selectedSeasonQueryDocumentSnapshot?.data()?.registrationEnd)}.`}
						</p>
					</ComingSoon>
				</div>
			) : (
				<div className={'flex flex-wrap gap-8'}>
					{rounds.map((games, index) => (
						<ScheduleCard
							key={`schedule-card-${index}`}
							games={games}
							title={`Week ${Math.ceil((index + 1) / 4)} | Round ${
								(index % 4) + 1
							}`}
						/>
					))}

					{/* TEMPORARY */}
					{/* Hardcoded placeholder schedule for rounds 6 and 7 */}
					{/* <Card className={'flex-1 shrink-0 basis-80'}>
						<CardHeader>
							<CardTitle>Week 6 | Round 1</CardTitle>
							<CardDescription>
								Saturday, December 7th at 6:00 PM
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 1</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">Seed 1</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">Seed 8</p>
								</div>
							</div>
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 2</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">Seed 3</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">Seed 11</p>
								</div>
							</div>
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 3</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">Seed 7</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">Seed 10</p>
								</div>
							</div>
						</CardContent>
					</Card>
					<Card className={'flex-1 shrink-0 basis-80'}>
						<CardHeader>
							<CardTitle>Week 6 | Round 2</CardTitle>
							<CardDescription>
								Saturday, December 7th at 6:45 PM
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 1</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">Seed 1</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">Seed 9</p>
								</div>
							</div>
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 2</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">Seed 4</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">Seed 5</p>
								</div>
							</div>
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 3</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">Seed 6</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">Seed 11</p>
								</div>
							</div>
						</CardContent>
					</Card>
					<Card className={'flex-1 shrink-0 basis-80'}>
						<CardHeader>
							<CardTitle>Week 6 | Round 3</CardTitle>
							<CardDescription>
								Saturday, December 7th at 7:30 PM
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 1</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">Seed 8</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">Seed 9</p>
								</div>
							</div>
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 2</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">Seed 4</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">Seed 12</p>
								</div>
							</div>
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 3</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">Seed 2</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">Seed 7</p>
								</div>
							</div>
						</CardContent>
					</Card>
					<Card className={'flex-1 shrink-0 basis-80'}>
						<CardHeader>
							<CardTitle>Week 6 | Round 4</CardTitle>
							<CardDescription>
								Saturday, December 7th at 8:15 PM
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 1</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">Seed 3</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">Seed 6</p>
								</div>
							</div>
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 2</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">Seed 5</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">Seed 12</p>
								</div>
							</div>
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 3</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">Seed 2</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">Seed 10</p>
								</div>
							</div>
						</CardContent>
					</Card> */}
					{/* <Card className={'flex-1 shrink-0 basis-80'}>
						<CardHeader>
							<CardTitle>Week 7 | Round 1</CardTitle>
							<CardDescription>
								Saturday, December 14th at 6:00 PM
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 1</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">Pool 1 (1)</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">Pool 4 (1)</p>
								</div>
							</div>
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 2</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">Pool 1 (2)</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">Pool 4 (2)</p>
								</div>
							</div>
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 3</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">Pool 1 (3)</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">Pool 4 (3)</p>
								</div>
							</div>
						</CardContent>
					</Card>
					<Card className={'flex-1 shrink-0 basis-80'}>
						<CardHeader>
							<CardTitle>Week 7 | Round 2</CardTitle>
							<CardDescription>
								Saturday, December 14th at 6:45 PM
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 1</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">Pool 2 (1)</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">Pool 3 (1)</p>
								</div>
							</div>
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 2</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">Pool 2 (2)</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">Pool 3 (2)</p>
								</div>
							</div>
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 3</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">Pool 2 (3)</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">Pool 3 (3)</p>
								</div>
							</div>
						</CardContent>
					</Card> */}
					{/* <Card className={'flex-1 shrink-0 basis-80'}>
						<CardHeader>
							<CardTitle>Week 7 | Round 3</CardTitle>
							<CardDescription>
								Saturday, December 14th at 7:30 PM
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 1</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">L Round 1</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">L Round 2</p>
								</div>
							</div>
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 2</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">L Round 1</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">L Round 2</p>
								</div>
							</div>
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 3</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">L Round 1</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">L Round 2</p>
								</div>
							</div>
						</CardContent>
					</Card>
					<Card className={'flex-1 shrink-0 basis-80'}>
						<CardHeader>
							<CardTitle>Week 7 | Round 4</CardTitle>
							<CardDescription>
								Saturday, December 14th at 8:15 PM
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 1</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">W Round 1</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">W Round 2</p>
								</div>
							</div>
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 2</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">W Round 1</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">W Round 2</p>
								</div>
							</div>
							<div className={'flex justify-start items-center max-h-10'}>
								<div className={'flex-1'}>Field 3</div>
								<div className="flex gap-4 justify-center items-center flex-4">
									<p className="flex-1 text-center">W Round 1</p>
									<p className="flex-1 text-center select-none">vs</p>
									<p className="flex-1 text-center">W Round 2</p>
								</div>
							</div>
						</CardContent>
					</Card> */}
				</div>
			)}
		</div>
	)
}
