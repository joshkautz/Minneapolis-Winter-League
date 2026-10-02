import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { useSeasonsContext } from '@/providers'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/shared/utils'

export const SeasonSelect = ({ mobile = false }: { mobile?: boolean }) => {
	const {
		selectedSeasonQueryDocumentSnapshot,
		setSelectedSeasonQueryDocumentSnapshot,
		seasonsQuerySnapshot,
		seasonsQuerySnapshotLoading,
	} = useSeasonsContext()

	// Keyed by id, which is unique; the shown value follows the context, so
	// a change made anywhere else is reflected here without an effect.
	const handleSeasonChange = (seasonId: string) => {
		const seasonDoc = seasonsQuerySnapshot?.docs.find(
			(doc) => doc.id === seasonId
		)
		if (seasonDoc) {
			setSelectedSeasonQueryDocumentSnapshot(seasonDoc)
		}
	}

	// Newest first. Sorted as a copy: the snapshot's array is shared.
	const seasons = [...(seasonsQuerySnapshot?.docs ?? [])].sort(
		(a, b) => b.data().dateStart.seconds - a.data().dateStart.seconds
	)

	return (
		<div className='w-full'>
			{seasonsQuerySnapshotLoading ? (
				<Skeleton className={`w-full ${mobile ? 'h-10' : 'h-9'} rounded-md`} />
			) : (
				<Select
					value={selectedSeasonQueryDocumentSnapshot?.id ?? ''}
					onValueChange={handleSeasonChange}
				>
					<SelectTrigger
						className={cn(
							'w-full px-3 hover:bg-accent dark:hover:bg-accent dark:hover:text-accent-foreground dark:hover:[&_svg]:text-accent-foreground transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0 focus-visible:ring-inset rounded-md cursor-pointer',
							mobile ? '!h-10' : '!h-9'
						)}
					>
						<SelectValue placeholder='Select season' />
					</SelectTrigger>
					<SelectContent>
						{seasons.map((season) => (
							<SelectItem
								key={season.id}
								value={season.id}
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
