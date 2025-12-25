import { useMemo } from 'react'
import { QueryDocumentSnapshot } from '@/firebase'
import { GameDocument } from '@/shared/utils'
import { useGamesContext } from '@/providers'

/**
 * useScheduleData Hook
 *
 * Custom hook to process schedule data and organize games into rounds.
 * Extracted from Schedule component for better separation of concerns.
 */
export const useScheduleData = () => {
	const { gamesQuerySnapshot } = useGamesContext()

	const rounds: GameDocument[][] = useMemo(() => {
		const result: GameDocument[][] = []
		let index: number = 0
		let previousTimestamp: number = 0

		gamesQuerySnapshot?.docs
			.sort((a, b) => a.data().date.seconds - b.data().date.seconds)
			.forEach((queryDocumentSnapshot: QueryDocumentSnapshot<GameDocument>) => {
				const currentTimestamp = queryDocumentSnapshot.data().date.seconds
				if (previousTimestamp === 0) {
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
			})
		return result
	}, [gamesQuerySnapshot])

	const { upcomingRounds, completedRounds } = useMemo(() => {
		const today = new Date()
		today.setHours(0, 0, 0, 0)

		const upcoming: Array<{ round: GameDocument[]; originalIndex: number }> = []
		const completed: Array<{ round: GameDocument[]; originalIndex: number }> =
			[]

		rounds.forEach((round, index) => {
			if (round.length === 0) return

			// All games in a round share the same timestamp, so check the first game's date
			const gameDate = round[0].date.toDate()
			gameDate.setHours(0, 0, 0, 0)

			if (gameDate < today) {
				completed.push({ round, originalIndex: index })
			} else {
				upcoming.push({ round, originalIndex: index })
			}
		})

		return {
			upcomingRounds: upcoming,
			completedRounds: completed,
		}
	}, [rounds])

	const generateRoundTitle = (index: number): string => {
		return `Week ${Math.ceil((index + 1) / 4)} | Round ${(index % 4) + 1}`
	}

	return {
		gamesQuerySnapshot,
		rounds,
		upcomingRounds,
		completedRounds,
		generateRoundTitle,
		isLoading: !gamesQuerySnapshot,
		hasGames: gamesQuerySnapshot && gamesQuerySnapshot.docs.length > 0,
	}
}
