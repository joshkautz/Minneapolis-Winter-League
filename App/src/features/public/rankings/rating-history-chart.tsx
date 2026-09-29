/**
 * A player's rank and rating over time: all time, or across one season,
 * where the rank is their place among that season's players and each point
 * can say which game moved it.
 */

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
	ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
} from '@/components/ui/chart'
import type { GameResult } from './ranking-helpers'

export interface ChartPoint {
	/** When the round was played, as an ISO timestamp */
	date: string
	/** The rank drawn: all-time, or within the season */
	ranking: number
	/** Skill rating after the round (TrueSkill μ) */
	rating: number
	/** The game the player's team played in the round, when known */
	game?: GameResult | null
}

const OUTCOME_LETTER = { win: 'W', loss: 'L', tie: 'T' } as const

export const RatingHistoryChart = ({
	data,
	rankLabel,
	description,
}: {
	data: ChartPoint[]
	/** "Rank Position" all time, "Season Rank" for a season */
	rankLabel: string
	/** Read by screen readers in place of the chart */
	description: string
}) => {
	const chartConfig = {
		ranking: { label: rankLabel, color: 'var(--chart-1)' },
		rating: { label: 'Skill Rating', color: 'var(--chart-2)' },
	} satisfies ChartConfig

	return (
		<ChartContainer
			config={chartConfig}
			className='aspect-auto h-[250px] w-full'
			role='img'
			aria-label={description}
		>
			<AreaChart data={data} aria-hidden='true'>
				<defs>
					<linearGradient id='fillRanking' x1='0' y1='0' x2='0' y2='1'>
						<stop
							offset='5%'
							stopColor='var(--color-ranking)'
							stopOpacity={0.8}
						/>
						<stop
							offset='95%'
							stopColor='var(--color-ranking)'
							stopOpacity={0.1}
						/>
					</linearGradient>
					<linearGradient id='fillRating' x1='0' y1='0' x2='0' y2='1'>
						<stop
							offset='5%'
							stopColor='var(--color-rating)'
							stopOpacity={0.8}
						/>
						<stop
							offset='95%'
							stopColor='var(--color-rating)'
							stopOpacity={0.1}
						/>
					</linearGradient>
				</defs>
				<CartesianGrid vertical={true} />
				<XAxis
					dataKey='date'
					tickLine={true}
					axisLine={true}
					tickMargin={8}
					minTickGap={32}
					tickFormatter={(value) =>
						new Date(value).toLocaleDateString('en-US', {
							month: 'short',
							day: 'numeric',
							year: 'numeric',
						})
					}
				/>
				<YAxis
					yAxisId='ranking'
					orientation='left'
					tickLine={true}
					axisLine={true}
					domain={[0, 'dataMax + 5']}
				/>
				<YAxis
					yAxisId='rating'
					orientation='right'
					tickLine={true}
					axisLine={true}
					domain={['dataMin - 5', 'dataMax + 5']}
					tickFormatter={(value) => Math.round(value).toString()}
				/>
				<ChartTooltip
					cursor={false}
					content={(props) => {
						if (!props.active || !props.payload?.length || !props.label) {
							return null
						}
						const point = props.payload[0].payload as ChartPoint
						const when = new Date(point.date)
						return (
							<div className='rounded-lg border bg-background p-3 shadow-md'>
								<p className='mb-2 text-sm font-medium'>
									{when.toLocaleDateString('en-US', {
										weekday: 'short',
										month: 'short',
										day: 'numeric',
										year: 'numeric',
									})}{' '}
									•{' '}
									{when.toLocaleTimeString('en-US', {
										hour: 'numeric',
										minute: '2-digit',
										hour12: true,
									})}
								</p>
								<div className='space-y-1 text-sm'>
									<div className='flex items-center gap-2'>
										<span className='text-muted-foreground'>{rankLabel}</span>
										<span className='font-medium'>#{point.ranking}</span>
									</div>
									<div className='flex items-center gap-2'>
										<span className='text-muted-foreground'>Rating</span>
										<span className='font-medium'>
											{point.rating.toFixed(2)}
										</span>
									</div>
									{point.game && (
										<div className='flex items-center gap-2'>
											<span className='text-muted-foreground'>Game</span>
											<span className='font-medium'>
												{OUTCOME_LETTER[point.game.outcome]}{' '}
												{point.game.teamScore}–{point.game.opponentScore} vs{' '}
												{point.game.opponent}
											</span>
										</div>
									)}
									{point.game === null && (
										<p className='text-muted-foreground'>Sat out this slot</p>
									)}
								</div>
							</div>
						)
					}}
				/>
				<Area
					dataKey='rating'
					type='natural'
					fill='url(#fillRating)'
					stroke='var(--color-rating)'
					yAxisId='rating'
				/>
				<Area
					dataKey='ranking'
					type='natural'
					fill='url(#fillRanking)'
					stroke='var(--color-ranking)'
					yAxisId='ranking'
				/>
				<ChartLegend content={<ChartLegendContent />} />
			</AreaChart>
		</ChartContainer>
	)
}
