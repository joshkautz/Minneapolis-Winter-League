import { Receipt } from 'lucide-react'
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { cn } from '@/shared/utils'
import { costBreakdown, LEAGUE_COSTS } from './league-costs'

/** "$760.02": always to the cent, so a column of amounts lines up. */
const dollars = (cents: number): string =>
	(cents / 100).toLocaleString('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2,
	})

const percent = (share: number): string =>
	share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`

/**
 * Where a team's fee goes: what running last season cost, split across the
 * teams, with whatever is left as the league reserve. A table rather than a
 * pie or a stacked bar: the field rental is three quarters of it, and the
 * small costs would vanish as slivers. Each row's bar is its share of the
 * fee, with the amount and percentage written beside it.
 */
export const LeagueCostsSection = () => {
	const lines = costBreakdown()
	const { seasonName, teams, teamFeeCents } = LEAGUE_COSTS

	return (
		<section
			id='costs'
			aria-labelledby='costs-heading'
			className='max-w-[968px] mx-auto px-6 pt-8 pb-28 lg:px-0'
		>
			<div className='flex flex-col gap-4 max-w-[800px] mx-auto'>
				<h2
					id='costs-heading'
					className='flex items-center gap-3 text-3xl font-bold'
				>
					<Receipt className='h-7 w-7 shrink-0' aria-hidden='true' />
					Where your team fee goes
				</h2>
				<p className='text-muted-foreground'>
					Each team pays {dollars(teamFeeCents)}. Here is what running{' '}
					{seasonName} costs, split evenly across its {teams} teams.
				</p>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Cost</TableHead>
							<TableHead className='text-right'>Per team</TableHead>
							<TableHead className='hidden text-right sm:table-cell'>
								Season
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{lines.map((line) => (
							<TableRow key={line.name}>
								<TableCell className='whitespace-normal'>
									<div className='font-medium'>{line.name}</div>
									<div className='text-sm text-muted-foreground'>
										{line.description}
									</div>
									<div className='mt-2 flex items-center gap-2'>
										<div
											className='h-2 flex-1 rounded-full bg-muted'
											aria-hidden='true'
										>
											<div
												className={cn(
													'h-2 rounded-full',
													line.isReserve
														? 'bg-muted-foreground/50'
														: 'bg-primary'
												)}
												style={{
													width: `${Math.max(line.share * 100, 1)}%`,
												}}
											/>
										</div>
										<span className='w-10 text-right text-xs tabular-nums text-muted-foreground'>
											{percent(line.share)}
										</span>
									</div>
								</TableCell>
								<TableCell className='text-right align-top tabular-nums'>
									{dollars(line.perTeamCents)}
								</TableCell>
								<TableCell className='hidden text-right align-top tabular-nums sm:table-cell'>
									{dollars(line.seasonCents)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
					<TableFooter>
						<TableRow>
							<TableCell className='font-bold'>Team fee</TableCell>
							<TableCell className='text-right font-bold tabular-nums'>
								{dollars(teamFeeCents)}
							</TableCell>
							<TableCell className='hidden text-right font-bold tabular-nums sm:table-cell'>
								{dollars(teamFeeCents * teams)}
							</TableCell>
						</TableRow>
					</TableFooter>
				</Table>
			</div>
		</section>
	)
}
