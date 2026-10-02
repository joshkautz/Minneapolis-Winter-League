/**
 * Badge Management admin component
 *
 * Every badge is defined in code and awarded by its rule, nightly at 11:30pm.
 * This page lists them with how often each has been earned, and rebuilds
 * the awards now: first as a preview of what would change, then for real.
 */

import { useState } from 'react'
import { useCollection } from 'react-firebase-hooks/firestore'
import { Award, RefreshCcw, Search } from 'lucide-react'
import { toast } from 'sonner'

import { badgeStatsQuery } from '@/firebase/collections/badges'
import {
	rebuildBadgesViaFunction,
	type RebuildBadgesResponse,
} from '@/firebase/collections/functions'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { LoadingButton, PageContainer, PageHeader } from '@/shared/components'
import { BADGES, TIER_LABELS, badgeImageUrl } from '@/shared/badges'
import { errorMessage, logger } from '@/shared/utils'
import { useQueryErrorHandler, usePendingAction } from '@/shared/hooks'
import type { BadgeStatsDocument } from '@/types'
import { BackToAdminButton } from '@/features/admin/shared'

const changes = (result: RebuildBadgesResponse): string =>
	`${result.created} new, ${result.updated} changed, ${result.removed} removed`

export const BadgeManagement = () => {
	const [stats, , statsError] = useCollection(badgeStatsQuery())
	const [preview, setPreview] = useState<RebuildBadgesResponse | null>(null)
	const previewing = usePendingAction()
	const rebuilding = usePendingAction()

	useQueryErrorHandler({
		error: statsError,
		component: 'BadgeManagement',
		errorLabel: 'badge totals',
	})

	const statsById = new Map(
		stats?.docs.map((doc) => [doc.id, doc.data() as BadgeStatsDocument]) ?? []
	)

	const rebuild = (dryRun: boolean) => async (): Promise<boolean> => {
		try {
			const result = await rebuildBadgesViaFunction({ dryRun })
			if (dryRun) {
				setPreview(result)
			} else {
				setPreview(null)
				toast.success('Badges rebuilt', { description: changes(result) })
			}
			return true
		} catch (error) {
			logger.error('Badges rebuild failed', error, { dryRun })
			toast.error(dryRun ? 'Preview failed' : 'Rebuild failed', {
				description: errorMessage(
					error,
					'The badges could not be rebuilt. Please try again.'
				),
			})
			return false
		}
	}

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title='Badge Management'
				description='Every badge is awarded automatically by its rule, every night at 11:30pm'
				icon={Award}
			/>

			<div className='flex items-center justify-between gap-4'>
				<BackToAdminButton />
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Rebuild now</CardTitle>
					<CardDescription>
						Works out every award from the games, rosters, registrations and
						ratings, then makes the teams' badges match. Preview first to see
						what would change; nothing is written until you rebuild.
					</CardDescription>
				</CardHeader>
				<CardContent className='space-y-4'>
					<div className='flex flex-wrap gap-2'>
						<LoadingButton
							variant='outline'
							loading={previewing.pending}
							loadingText='Previewing...'
							disabled={rebuilding.pending}
							onClick={() => previewing.run(rebuild(true))}
						>
							<Search className='h-4 w-4 mr-2' aria-hidden='true' />
							Preview changes
						</LoadingButton>
						<LoadingButton
							loading={rebuilding.pending}
							loadingText='Rebuilding...'
							disabled={previewing.pending}
							onClick={() => rebuilding.run(rebuild(false))}
						>
							<RefreshCcw className='h-4 w-4 mr-2' aria-hidden='true' />
							Rebuild badges
						</LoadingButton>
					</div>
					{preview && (
						<p className='text-sm' role='status'>
							A rebuild would award {preview.awards} badges in all:{' '}
							{changes(preview)}.
						</p>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Badges</CardTitle>
					<CardDescription>
						{BADGES.length} badges. A team can earn each one once a season.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Badge</TableHead>
								<TableHead>Tier</TableHead>
								<TableHead className='text-right'>Teams</TableHead>
								<TableHead className='text-right'>Times earned</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{BADGES.map((badge) => (
								<TableRow key={badge.id}>
									<TableCell>
										<div className='flex items-center gap-3'>
											<img
												src={badgeImageUrl(badge.id)}
												alt=''
												role='presentation'
												className='w-10 h-10 rounded-full flex-shrink-0'
											/>
											<div>
												<div className='font-medium'>{badge.name}</div>
												<div className='text-xs text-muted-foreground'>
													{badge.description}
												</div>
											</div>
										</div>
									</TableCell>
									<TableCell>{TIER_LABELS[badge.tier]}</TableCell>
									<TableCell className='text-right'>
										{statsById.get(badge.id)?.teamsEarned ?? 0}
									</TableCell>
									<TableCell className='text-right'>
										{statsById.get(badge.id)?.timesEarned ?? 0}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</PageContainer>
	)
}
