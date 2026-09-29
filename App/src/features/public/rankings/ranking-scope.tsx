/** The switch between all-time rankings and one season's; see use-ranking-scope.ts. */

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'

const ALL_TIME = 'all-time'

export interface ScopeSeason {
	id: string
	name: string
}

/** All time, then each season, newest first. */
export const RankingScopeSelect = ({
	seasonId,
	seasons,
	onChange,
}: {
	seasonId: string | null
	seasons: ScopeSeason[]
	onChange: (seasonId: string | null) => void
}) => (
	<Select
		value={seasonId ?? ALL_TIME}
		onValueChange={(value) => onChange(value === ALL_TIME ? null : value)}
	>
		<SelectTrigger className='w-full sm:w-[180px]' aria-label='Rankings for'>
			<SelectValue />
		</SelectTrigger>
		<SelectContent>
			<SelectItem value={ALL_TIME}>All time</SelectItem>
			{seasons.map((season) => (
				<SelectItem key={season.id} value={season.id}>
					{season.name}
				</SelectItem>
			))}
		</SelectContent>
	</Select>
)
