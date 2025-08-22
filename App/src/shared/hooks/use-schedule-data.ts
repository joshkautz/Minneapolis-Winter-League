import { useMemo } from 'react'
import { DocumentData, QueryDocumentSnapshot } from '@/firebase/firestore'
import { GameData } from '@/shared/utils'
import { useGamesContext } from '@/providers'

/**
 * useScheduleData Hook
 * 
 * Custom hook to process schedule data and organize games into rounds.
 * Extracted from Schedule component for better separation of concerns.
 */
export const useScheduleData = () => {
	const { gamesQuerySnapshot } = useGamesContext()

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

	const generateRoundTitle = (index: number): string => {
		return `Week ${Math.ceil((index + 1) / 4)} | Round ${(index % 4) + 1}`
	}

	return {
		gamesQuerySnapshot,
		rounds,
		generateRoundTitle,
		isLoading: !gamesQuerySnapshot,
		hasGames: gamesQuerySnapshot && gamesQuerySnapshot.docs.length > 0,
	}
}
