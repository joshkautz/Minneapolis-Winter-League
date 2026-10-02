/**
 * The selected season's generated schedule: the button that creates a
 * traditional season's regular season, after showing every game for
 * review, and, once it is generated, what the automatic playoffs are
 * waiting for. See docs/SCHEDULING.md.
 */

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { CalendarCog, RefreshCw, Trophy } from 'lucide-react'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { LoadingButton } from '@/shared/components'
import { usePendingAction } from '@/shared/hooks'
import { errorMessage, REGISTRATION_SPOTS } from '@/shared/utils'
import {
	generateScheduleViaFunction,
	updatePlayoffsViaFunction,
	type GenerateScheduleResponse,
} from '@/firebase/collections/functions'
import { SeasonFormat, type SeasonDocument } from '@/types'

type Season = SeasonDocument & { id: string }

/**
 * Kickoffs as the league's clock reads them, whatever the admin's browser
 * is set to; the server's league calendar uses the same zone.
 */
const kickoffTime = new Intl.DateTimeFormat('en-US', {
	hour: 'numeric',
	minute: '2-digit',
	timeZone: 'America/Chicago',
})

/** "Saturday, December 12", from "2026-12-12". */
const nightName = (day: string): string => format(parseISO(day), 'EEEE, MMMM d')

/** Every game of a generated preview, one table per night. */
const SchedulePreview = ({
	preview,
}: {
	preview: GenerateScheduleResponse
}) => (
	<div className='space-y-6'>
		{preview.regularNights.map((night) => {
			const games = preview.games.filter((game) => game.night === night)
			return (
				<section key={night} aria-label={nightName(night)}>
					<h3 className='text-sm font-semibold mb-2'>{nightName(night)}</h3>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Time</TableHead>
								<TableHead>Field</TableHead>
								<TableHead>Home</TableHead>
								<TableHead>Away</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{games.map((game) => (
								<TableRow key={`${game.date}-${game.field}`}>
									<TableCell>
										{kickoffTime.format(new Date(game.date))}
									</TableCell>
									<TableCell>{game.field}</TableCell>
									<TableCell>{game.homeName}</TableCell>
									<TableCell>{game.awayName}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</section>
			)
		})}
	</div>
)

/** Generates a season with no games yet, after a preview. */
const GenerateSchedule = ({ season }: { season: Season }) => {
	const [preview, setPreview] = useState<GenerateScheduleResponse | null>(null)
	const previewing = usePendingAction()
	const creating = usePendingAction()

	const openPreview = () =>
		previewing.run(async () => {
			try {
				setPreview(
					await generateScheduleViaFunction({
						seasonId: season.id,
						dryRun: true,
					})
				)
				return true
			} catch (error) {
				toast.error('Schedule not generated', {
					description: errorMessage(
						error,
						'The schedule could not be previewed. Please try again.'
					),
				})
				return false
			}
		})

	const create = () =>
		creating.run(async () => {
			try {
				const created = await generateScheduleViaFunction({
					seasonId: season.id,
				})
				toast.success('Schedule created', {
					description: `${created.games.length} games across ${created.regularNights.length} nights. Pool night and championship night will follow from the scores.`,
				})
				setPreview(null)
				return true
			} catch (error) {
				toast.error('Schedule not created', {
					description: errorMessage(
						error,
						'The schedule could not be created. Please try again.'
					),
				})
				return false
			}
		})

	return (
		<Card>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<CalendarCog className='h-5 w-5 text-indigo-600' />
					Generate {season.name}&apos;s schedule
				</CardTitle>
				<CardDescription>
					Creates every regular-season game for the {REGISTRATION_SPOTS}{' '}
					registered teams: two back-to-back games a night, no rematches, early
					and late nights shared evenly. Pool night, championship night and the
					final placements then follow from the scores on their own.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<LoadingButton
					onClick={openPreview}
					loading={previewing.pending}
					loadingText='Preparing...'
				>
					Preview schedule
				</LoadingButton>
			</CardContent>

			<Dialog
				open={preview !== null}
				onOpenChange={(open) => {
					if (!open && !creating.pending) setPreview(null)
				}}
			>
				<DialogContent className='max-w-3xl max-h-[85vh] overflow-y-auto'>
					<DialogHeader>
						<DialogTitle>{season.name} regular season</DialogTitle>
						{preview && (
							<DialogDescription>
								{preview.games.length} games. Pool night is{' '}
								{nightName(preview.poolNight)} and championship night{' '}
								{nightName(preview.championshipNight)}; their games are created
								once the scores before them are in.
							</DialogDescription>
						)}
					</DialogHeader>
					{preview && <SchedulePreview preview={preview} />}
					<DialogFooter>
						<Button
							variant='outline'
							onClick={() => setPreview(null)}
							disabled={creating.pending}
						>
							Cancel
						</Button>
						<LoadingButton
							onClick={create}
							loading={creating.pending}
							loadingText='Creating...'
						>
							Create {preview?.games.length ?? ''} games
						</LoadingButton>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	)
}

/** What a generated season's automatic playoffs do, and a way to run them now. */
const AutomaticPlayoffs = ({ season }: { season: Season }) => {
	const updating = usePendingAction()

	const update = () =>
		updating.run(async () => {
			try {
				const summary = await updatePlayoffsViaFunction({
					seasonId: season.id,
				})
				if (summary.conflicts.length > 0) {
					toast.warning('Some playoff games were not created', {
						description: `A game entered by hand already holds ${summary.conflicts.length === 1 ? 'that slot' : 'those slots'}: ${summary.conflicts.join(', ')}. Move it to another time or field, or delete it, then update again.`,
					})
				}
				if (summary.kept.length > 0) {
					toast.warning('Some playoff games kept their pairing', {
						description: `A corrected score would now pair ${summary.kept.join(', ')} differently, but their night has begun, so they were left as they are. Edit them by hand if they should change.`,
					})
				}
				const changed =
					summary.created + summary.updated + summary.placementsSet
				if (changed === 0) {
					toast.info('Playoffs are up to date', {
						description: summary.waitingFor
							? `Waiting for ${summary.waitingFor}.`
							: 'Every team has its final placement.',
					})
				} else {
					toast.success('Playoffs updated', {
						description: `${summary.created} games created, ${summary.updated} re-paired, ${summary.placementsSet} placements set.`,
					})
				}
				return true
			} catch (error) {
				toast.error('Playoffs not updated', {
					description: errorMessage(
						error,
						'The playoffs could not be updated. Please try again.'
					),
				})
				return false
			}
		})

	return (
		<Card>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<Trophy className='h-5 w-5 text-indigo-600' />
					Automatic playoffs
				</CardTitle>
				<CardDescription>
					Pool night is created as soon as the last regular-season score is
					entered, seeded by the standings. Championship night&apos;s first
					games follow the pool results, its last games each field&apos;s first
					two, and the final placements the last scores. Games already played
					are never changed.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<LoadingButton
					variant='outline'
					onClick={update}
					loading={updating.pending}
					loadingText='Updating...'
				>
					<RefreshCw className='h-4 w-4 mr-2' />
					Update playoffs now
				</LoadingButton>
			</CardContent>
		</Card>
	)
}

/**
 * The schedule card for the selected season: nothing for a Swiss season,
 * or for one already scheduled by hand.
 */
export const SeasonScheduleCard = ({
	season,
	gameCount,
}: {
	season: Season
	gameCount: number
}) => {
	if (season.format === SeasonFormat.SWISS) return null
	if (season.automaticPlayoffs) return <AutomaticPlayoffs season={season} />
	if (gameCount === 0) return <GenerateSchedule season={season} />
	return null
}
