/**
 * One player's season: where they finished, their record, and every game
 * they played with what it did to their rating and season rank.
 */

import { TrendingDown, TrendingUp } from 'lucide-react'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { cn } from '@/shared/utils'
import type { SeasonRankingDocument } from '@/types'
import type { SeasonSlot } from './ranking-helpers'

const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
	<div className='rounded-lg border bg-muted/20 p-3 text-center'>
		<p className='text-xs font-medium uppercase text-muted-foreground'>
			{label}
		</p>
		<p className='mt-1 font-mono text-lg font-bold'>{value}</p>
	</div>
)

/** "+1.77" in green or "-0.12" in red, with an arrow for screen readers. */
export const RatingChange = ({ change }: { change: number }) => {
	if (Math.abs(change) < 0.005) {
		return <span className='text-muted-foreground'>0.00</span>
	}
	const up = change > 0
	const Arrow = up ? TrendingUp : TrendingDown
	return (
		<span
			className={cn(
				'inline-flex items-center justify-center gap-1',
				up ? 'text-green-600' : 'text-red-600'
			)}
		>
			<Arrow className='h-3 w-3' aria-hidden='true' />
			<span className='sr-only'>{up ? 'up' : 'down'}</span>
			{Math.abs(change).toFixed(2)}
		</span>
	)
}

const OUTCOME = {
	win: { letter: 'W', className: 'text-green-600' },
	loss: { letter: 'L', className: 'text-red-600' },
	tie: { letter: 'T', className: 'text-muted-foreground' },
} as const

export const PlayerSeasonSummary = ({
	seasonName,
	standing,
	slots,
}: {
	seasonName: string
	/** The player's standing at the end of the season (or so far) */
	standing: SeasonRankingDocument | undefined
	/** The season's rounds, oldest first, with each one's game */
	slots: SeasonSlot[]
}) => {
	const played = slots.filter(
		(slot): slot is SeasonSlot & { game: NonNullable<SeasonSlot['game']> } =>
			slot.game !== null
	)

	return (
		<div className='space-y-6'>
			{standing && (
				<div
					className='grid grid-cols-2 gap-3 sm:grid-cols-5'
					aria-label={`${seasonName} summary`}
				>
					<Stat label='Season rank' value={`#${standing.rank}`} />
					<Stat label='Rating' value={standing.rating.toFixed(2)} />
					<Stat
						label='Season change'
						value={<RatingChange change={standing.ratingChange} />}
					/>
					<Stat label='Record' value={`${standing.wins}–${standing.losses}`} />
					<Stat label='Games' value={standing.games} />
				</div>
			)}

			{played.length > 0 ? (
				<div className='overflow-x-auto'>
					<Table aria-label={`Games in ${seasonName}`}>
						<TableHeader>
							<TableRow>
								<TableHead scope='col'>Game</TableHead>
								<TableHead scope='col'>Opponent</TableHead>
								<TableHead scope='col' className='text-center'>
									Result
								</TableHead>
								<TableHead scope='col' className='text-center'>
									Rating change
								</TableHead>
								<TableHead scope='col' className='text-center'>
									Rating
								</TableHead>
								<TableHead scope='col' className='text-center'>
									Season rank
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{played.map(({ round, game }) => {
								const kickoff = round.date.toDate()
								const outcome = OUTCOME[game.outcome]
								return (
									<TableRow key={round.roundId}>
										<TableCell className='whitespace-nowrap'>
											{kickoff.toLocaleDateString('en-US', {
												month: 'short',
												day: 'numeric',
											})}{' '}
											<span className='text-muted-foreground'>
												{kickoff.toLocaleTimeString('en-US', {
													hour: 'numeric',
													minute: '2-digit',
												})}
											</span>
											{game.playoff && (
												<span className='ml-2 text-xs font-medium text-amber-600'>
													Playoff
												</span>
											)}
										</TableCell>
										<TableCell>{game.opponent}</TableCell>
										<TableCell className='text-center font-mono'>
											<span className={cn('font-bold', outcome.className)}>
												{outcome.letter}
											</span>{' '}
											{game.teamScore}–{game.opponentScore}
										</TableCell>
										<TableCell className='text-center font-mono'>
											<RatingChange change={round.change} />
										</TableCell>
										<TableCell className='text-center font-mono'>
											{round.rating.toFixed(2)}
										</TableCell>
										<TableCell className='text-center'>
											{round.seasonRank !== null ? `#${round.seasonRank}` : '—'}
										</TableCell>
									</TableRow>
								)
							})}
						</TableBody>
					</Table>
					<p className='mt-3 text-xs text-muted-foreground'>
						Each change is from the game in that time slot. Ratings also shift
						slightly in the slots a team sits out, so the game changes do not
						add up exactly to the season&apos;s change.
					</p>
				</div>
			) : (
				<p className='text-sm text-muted-foreground'>
					No completed games in {seasonName} yet.
				</p>
			)}
		</div>
	)
}
