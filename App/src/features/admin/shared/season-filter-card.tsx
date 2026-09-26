import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'

interface SeasonFilterCardProps {
	seasons: { id: string; name: string }[] | undefined
	selectedSeasonId: string
	onSeasonChange: (seasonId: string) => void
}

/** The "Filter by Season" card at the top of an admin list. */
export const SeasonFilterCard = ({
	seasons,
	selectedSeasonId,
	onSeasonChange,
}: SeasonFilterCardProps) => (
	<Card>
		<CardHeader>
			<CardTitle className='text-lg'>Filter by Season</CardTitle>
		</CardHeader>
		<CardContent>
			<Select
				value={selectedSeasonId}
				onValueChange={onSeasonChange}
				disabled={!seasons || seasons.length === 0}
			>
				<SelectTrigger className='w-full max-w-md'>
					<SelectValue placeholder='Select a season' />
				</SelectTrigger>
				<SelectContent>
					{seasons?.map((season) => (
						<SelectItem key={season.id} value={season.id}>
							{season.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</CardContent>
	</Card>
)
