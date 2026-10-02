import { useEffect, useMemo, useState } from 'react'
import { useCollection } from 'react-firebase-hooks/firestore'
import { getCountFromServer, type DocumentReference } from 'firebase/firestore'
import { Loader2, Lock } from 'lucide-react'
import { NotificationCard } from '@/shared/components'
import { allTeamsQuery } from '@/firebase/collections/teams'
import { badgeStatsQuery, teamBadgesQuery } from '@/firebase/collections/badges'
import {
	BADGES,
	TIER_LABELS,
	badgeImageUrl,
	type BadgeDefinition,
} from '@/shared/badges'
import { logger, cn } from '@/shared/utils'
import type {
	BadgeStatsDocument,
	TeamBadgeDocument,
	TeamDocument,
} from '@/types'
import { useSeasonsContext } from '@/providers'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerDescription,
} from '@/components/ui/drawer'
import { useIsMobile, useQueryErrorHandler } from '@/shared/hooks'

/** One season a team earned a badge in. */
interface Earning {
	seasonId: string
	seasonName: string
	reason: string
}

interface TeamBadge {
	definition: BadgeDefinition
	/** Newest first; empty when the team has not earned it. */
	earnings: Earning[]
	/** Share of every team that has earned it, 0–100. */
	share: number
}

/**
 * How many teams there have ever been, for the share of teams holding each
 * badge. Counted on the server, once: a live listener on every team would
 * cost a read per team.
 */
function useTotalTeams(): number | undefined {
	const [totalTeams, setTotalTeams] = useState<number>()
	useEffect(() => {
		let cancelled = false
		getCountFromServer(allTeamsQuery())
			.then((snapshot) => {
				if (!cancelled) setTotalTeams(snapshot.data().count)
			})
			.catch((error) => {
				logger.error('Failed to count teams', error, {
					component: 'TeamBadgesCard',
				})
				// Badges still show; their shares read 0%.
				if (!cancelled) setTotalTeams(0)
			})
		return () => {
			cancelled = true
		}
	}, [])
	return totalTeams
}

const BadgeImage = ({
	badge,
	className,
}: {
	badge: TeamBadge
	className?: string
}) => (
	<img
		src={badgeImageUrl(badge.definition.id)}
		alt=''
		role='presentation'
		className={cn(
			'object-cover rounded-full',
			badge.earnings.length === 0 && 'grayscale opacity-40',
			className
		)}
	/>
)

/** What a badge is, and when and how this team earned it. */
const BadgeDetails = ({ badge }: { badge: TeamBadge }) => (
	<div className='space-y-3 text-sm'>
		<div className='flex justify-between gap-4 text-xs text-muted-foreground'>
			<span>{TIER_LABELS[badge.definition.tier]}</span>
			<span>{badge.share.toFixed(0)}% of teams have earned it</span>
		</div>
		{badge.earnings.length === 0 ? (
			<p className='text-muted-foreground'>Not earned yet.</p>
		) : (
			<ul className='space-y-2 border-t pt-2'>
				{badge.earnings.map((earning) => (
					<li key={earning.seasonId}>
						<span className='font-medium'>{earning.seasonName}</span>
						<span className='text-muted-foreground'> — {earning.reason}</span>
					</li>
				))}
			</ul>
		)}
	</div>
)

/**
 * Every badge, earned ones first, each with how many seasons the team earned
 * it in. Details open in a popover on desktop and a drawer on mobile.
 */
export const TeamBadgesCard = ({
	teamRef,
}: {
	teamRef: DocumentReference<TeamDocument> | undefined
}) => {
	const { seasonsQuerySnapshot } = useSeasonsContext()
	const [awards, , awardsError] = useCollection(teamBadgesQuery(teamRef))
	const [stats, , statsError] = useCollection(badgeStatsQuery())
	const totalTeams = useTotalTeams()
	const isMobile = useIsMobile()
	const [selected, setSelected] = useState<TeamBadge | null>(null)

	useQueryErrorHandler({
		error: awardsError,
		component: 'TeamBadgesCard',
		errorLabel: 'team badges',
	})
	useQueryErrorHandler({
		error: statsError,
		component: 'TeamBadgesCard',
		errorLabel: 'badge totals',
	})

	const badges = useMemo((): TeamBadge[] | null => {
		if (!awards || !stats || totalTeams === undefined) return null
		const seasonNames = new Map(
			seasonsQuerySnapshot?.docs.map((doc) => [doc.id, doc.data().name]) ?? []
		)
		const teamsEarned = new Map(
			stats.docs.map((doc) => [
				doc.id,
				(doc.data() as BadgeStatsDocument).teamsEarned ?? 0,
			])
		)
		const earningsByBadge = new Map<string, Earning[]>()
		for (const doc of awards.docs) {
			const award = doc.data() as TeamBadgeDocument
			earningsByBadge.set(award.badgeId, [
				...(earningsByBadge.get(award.badgeId) ?? []),
				{
					seasonId: award.seasonId,
					seasonName: seasonNames.get(award.seasonId) ?? 'A past season',
					reason: award.reason,
				},
			])
		}
		const all = BADGES.map((definition) => ({
			definition,
			earnings: earningsByBadge.get(definition.id) ?? [],
			share:
				totalTeams > 0
					? ((teamsEarned.get(definition.id) ?? 0) / totalTeams) * 100
					: 0,
		}))
		// Earned first; the catalog's order, rarest first, within each.
		return [
			...all.filter((badge) => badge.earnings.length > 0),
			...all.filter((badge) => badge.earnings.length === 0),
		]
	}, [awards, stats, totalTeams, seasonsQuerySnapshot])

	const earnedCount = badges?.filter((b) => b.earnings.length > 0).length ?? 0

	return (
		<NotificationCard
			title='Badges'
			description={
				badges
					? `${earnedCount} of ${badges.length} earned`
					: 'Loading badges...'
			}
			className='flex-1 basis-full shrink-0 max-w-full min-w-[360px]'
		>
			{!badges ? (
				<div className='flex items-center justify-center py-8'>
					<Loader2
						className='h-8 w-8 animate-spin text-muted-foreground'
						aria-label='Loading badges'
					/>
				</div>
			) : (
				<div
					className='flex flex-wrap gap-3 py-2'
					role='list'
					aria-label='Team badges'
				>
					{badges.map((badge) => {
						const times = badge.earnings.length
						const button = (
							<button
								type='button'
								className='relative flex items-center justify-center w-16 h-16 cursor-pointer transition-shadow flex-shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 hover:ring-2 hover:ring-primary/50 hover:ring-offset-2'
								aria-label={
									times === 0
										? `${badge.definition.name}, not earned yet. Show details.`
										: `${badge.definition.name}, earned ${times === 1 ? 'once' : `${times} times`}. Show details.`
								}
								onClick={isMobile ? () => setSelected(badge) : undefined}
							>
								<BadgeImage badge={badge} className='w-full h-full' />
								{times === 0 && (
									<div className='absolute inset-0 flex items-center justify-center'>
										<div className='bg-background/80 backdrop-blur-sm rounded-full p-2'>
											<Lock className='h-4 w-4 text-muted-foreground' />
										</div>
									</div>
								)}
								{times > 1 && (
									<span className='absolute -bottom-1 -right-1 min-w-6 h-6 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center ring-2 ring-background'>
										×{times}
									</span>
								)}
							</button>
						)

						return (
							<div key={badge.definition.id} role='listitem'>
								{isMobile ? (
									button
								) : (
									<Popover>
										<PopoverTrigger asChild>{button}</PopoverTrigger>
										<PopoverContent
											className='w-80 z-40'
											side='top'
											align='center'
											collisionPadding={16}
										>
											<div className='space-y-2'>
												<div className='flex items-start justify-between gap-2'>
													<div>
														<h4 className='text-sm font-semibold'>
															{badge.definition.name}
														</h4>
														<p className='text-xs text-muted-foreground'>
															{badge.definition.description}
														</p>
													</div>
													<BadgeImage
														badge={badge}
														className='w-10 h-10 flex-shrink-0'
													/>
												</div>
												<BadgeDetails badge={badge} />
											</div>
										</PopoverContent>
									</Popover>
								)}
							</div>
						)
					})}
				</div>
			)}

			<Drawer
				open={selected !== null}
				onOpenChange={(open) => !open && setSelected(null)}
			>
				<DrawerContent>
					{selected && (
						<>
							<DrawerHeader className='text-left'>
								<div className='flex items-start justify-between gap-4'>
									<div className='flex-1'>
										<DrawerTitle>{selected.definition.name}</DrawerTitle>
										<DrawerDescription className='mt-2'>
											{selected.definition.description}
										</DrawerDescription>
									</div>
									<BadgeImage
										badge={selected}
										className='w-16 h-16 flex-shrink-0'
									/>
								</div>
							</DrawerHeader>
							<div className='px-4 pb-6'>
								<BadgeDetails badge={selected} />
							</div>
						</>
					)}
				</DrawerContent>
			</Drawer>
		</NotificationCard>
	)
}
