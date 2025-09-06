import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { useSeasonsContext } from '@/providers'
import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/shared/utils'

export const SeasonSelect = ({
	mobile = false,
}: {
	mobile?: boolean
}) => {
	const {
		selectedSeasonQueryDocumentSnapshot,
		setSelectedSeasonQueryDocumentSnapshot,
		seasonsQuerySnapshot,
		seasonsQuerySnapshotLoading,
	} = useSeasonsContext()

	const [stringValue, setStringValue] = useState<string>('')
	const [initialSelection, setInitialSelection] = useState<boolean>(false)

	const handleSeasonChange = (season: string) => {
		setStringValue(season)
		const seasonDoc = seasonsQuerySnapshot?.docs.find(
			(doc) => doc.data().name === season
		)
		if (seasonDoc) {
			setSelectedSeasonQueryDocumentSnapshot(seasonDoc)
		}
	}

	useEffect(() => {
		if (selectedSeasonQueryDocumentSnapshot) {
			setStringValue(selectedSeasonQueryDocumentSnapshot.data().name)
		}
		if (!initialSelection) {
			setInitialSelection(true)
		}
	}, [selectedSeasonQueryDocumentSnapshot])

	return (
		<div className='w-full'>
			{seasonsQuerySnapshotLoading ? (
				<Skeleton className={`w-full ${mobile ? 'h-10' : 'h-9'} rounded-md`} />
			) : (
				<Select value={stringValue} onValueChange={handleSeasonChange}>
					<SelectTrigger
						className={cn(
							'w-full px-3 hover:bg-accent dark:hover:bg-accent dark:hover:text-accent-foreground dark:hover:[&_svg]:text-accent-foreground transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0 focus-visible:ring-inset rounded-md cursor-pointer',
							mobile ? '!h-10' : '!h-9'
						)}
					>
						<SelectValue placeholder='Select season' />
					</SelectTrigger>
					<SelectContent>
						{seasonsQuerySnapshot?.docs
							.sort(
								(a, b) =>
									b.data().dateStart.seconds - a.data().dateStart.seconds
							)
							.map((season) => (
								<SelectItem
									key={season.id}
									value={season.data().name}
									className='hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground transition-colors duration-200 focus:outline-none'
								>
									{season.data().name}
								</SelectItem>
							))}
					</SelectContent>
				</Select>
			)}
		</div>
	)
}
