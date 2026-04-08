/**
 * Merge Teams Dialog (admin)
 *
 * Allows an admin to pick a "losing" team and merge it into the currently
 * selected "winning" team. After a successful merge the losing team no
 * longer exists — all of its team-season history, rosters, badges, game
 * refs, offer refs, and player-season refs are attached to the winning
 * team.
 */

import { useMemo, useState } from 'react'
import { useCollection } from 'react-firebase-hooks/firestore'
import { collectionGroup, query, type Query } from 'firebase/firestore'
import { toast } from 'sonner'
import { Combine, Loader2, AlertTriangle } from 'lucide-react'

import { firestore } from '@/firebase/app'
import { logger, TeamSeasonDocument } from '@/shared/utils'
import { TEAM_SEASONS_SUBCOLLECTION } from '@/types'
import {
	allTeamsQuery,
	canonicalTeamIdFromTeamSeasonDoc,
} from '@/firebase/collections/teams'
import { useSeasonsContext } from '@/providers'
import { mergeTeamsViaFunction } from '@/firebase/collections/functions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface MergeTeamsDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	/** Winning team (the one the admin clicked on). */
	winningTeamId: string
	winningTeamName: string
}

type CanonicalTeamOption = {
	id: string
	/** Most-recent team-season name to display (or "Unknown team" fallback). */
	name: string
	/** Most-recent participating season's name (for the secondary line). */
	mostRecentSeasonName: string
	/** Sort key — most recent season's `dateStart.seconds`. */
	mostRecentSeasonStartSeconds: number
}

export const MergeTeamsDialog = ({
	open,
	onOpenChange,
	winningTeamId,
	winningTeamName,
}: MergeTeamsDialogProps) => {
	// Load all canonical teams (id list).
	const [allTeamsSnapshot, allTeamsLoading] = useCollection(
		open ? allTeamsQuery() : null
	)

	// Load every teamSeasons subdoc across the database so we can join each
	// canonical team to its most-recent name. This is one collection-group
	// read of ~30-50 docs in our scale, so it's cheap; gating on `open` makes
	// sure we only do it when the dialog is actually visible.
	const [allTeamSeasonsSnapshot, allTeamSeasonsLoading] = useCollection(
		open
			? (query(
					collectionGroup(firestore, TEAM_SEASONS_SUBCOLLECTION)
				) as Query<TeamSeasonDocument>)
			: null
	)

	// Map seasonId → dateStart seconds for "most recent" sorting.
	const { seasonsQuerySnapshot } = useSeasonsContext()
	const seasonStartByIdSeconds = useMemo(() => {
		const map = new Map<string, number>()
		seasonsQuerySnapshot?.docs.forEach((d) => {
			const data = d.data()
			if (data.dateStart?.seconds !== undefined) {
				map.set(d.id, data.dateStart.seconds)
			}
		})
		return map
	}, [seasonsQuerySnapshot])

	const [selectedLosingTeamId, setSelectedLosingTeamId] = useState<string>('')
	const [isMerging, setIsMerging] = useState(false)

	const teamOptions: CanonicalTeamOption[] = useMemo(() => {
		if (!allTeamsSnapshot) return []

		// Build canonicalTeamId → most-recent { name, seasonId, seasonStart }.
		const bestByCanonicalId = new Map<
			string,
			{ name: string; seasonId: string; seasonStartSeconds: number }
		>()
		allTeamSeasonsSnapshot?.docs.forEach((doc) => {
			const canonicalId = canonicalTeamIdFromTeamSeasonDoc(doc)
			const data = doc.data() as TeamSeasonDocument
			const seasonId = doc.id
			const seasonStartSeconds = seasonStartByIdSeconds.get(seasonId) ?? 0
			const existing = bestByCanonicalId.get(canonicalId)
			if (!existing || seasonStartSeconds > existing.seasonStartSeconds) {
				bestByCanonicalId.set(canonicalId, {
					name: data.name ?? 'Unknown team',
					seasonId,
					seasonStartSeconds,
				})
			}
		})

		return allTeamsSnapshot.docs
			.filter((d) => d.id !== winningTeamId)
			.map((d) => {
				const best = bestByCanonicalId.get(d.id)
				const seasonName = best?.seasonId
					? (seasonsQuerySnapshot?.docs
							.find((s) => s.id === best.seasonId)
							?.data().name ?? '')
					: ''
				return {
					id: d.id,
					name: best?.name ?? 'Unknown team',
					mostRecentSeasonName: seasonName,
					mostRecentSeasonStartSeconds: best?.seasonStartSeconds ?? 0,
				} satisfies CanonicalTeamOption
			})
			.sort((a, b) => {
				// Alphabetical by name; ties broken by most-recent season desc.
				const byName = a.name.localeCompare(b.name)
				if (byName !== 0) return byName
				return b.mostRecentSeasonStartSeconds - a.mostRecentSeasonStartSeconds
			})
	}, [
		allTeamsSnapshot,
		allTeamSeasonsSnapshot,
		seasonStartByIdSeconds,
		seasonsQuerySnapshot,
		winningTeamId,
	])

	const handleMerge = async () => {
		if (!selectedLosingTeamId) return
		setIsMerging(true)
		try {
			const result = await mergeTeamsViaFunction({
				winningTeamId,
				losingTeamId: selectedLosingTeamId,
			})
			toast.success('Teams merged successfully', {
				description: `Moved ${result.movedTeamSeasons} season(s), ${result.movedBadges} badge(s), rewrote ${result.rewrittenGames} game(s), ${result.rewrittenOffers} offer(s), ${result.rewrittenPlayerSeasons} player-season(s).`,
			})
			setSelectedLosingTeamId('')
			onOpenChange(false)
		} catch (error) {
			logger.error('Failed to merge teams:', error)
			let errorMessage = 'Failed to merge teams. Please try again.'
			if (error && typeof error === 'object' && 'message' in error) {
				errorMessage = (error as { message: string }).message
			}
			toast.error('Merge failed', { description: errorMessage })
		} finally {
			setIsMerging(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-lg max-h-[90vh] flex flex-col'>
				<DialogHeader>
					<DialogTitle className='flex items-center gap-2'>
						<Combine className='h-5 w-5' />
						Merge Team Into "{winningTeamName}"
					</DialogTitle>
					<DialogDescription>
						Select another team to merge into this one. The selected team will
						be permanently deleted and all of its history attached to "
						{winningTeamName}".
					</DialogDescription>
				</DialogHeader>

				<div className='flex-1 min-h-0 overflow-y-auto'>
					<div className='space-y-4 pr-1'>
						<Alert variant='destructive'>
							<AlertTriangle className='h-4 w-4' />
							<AlertDescription>
								This will permanently merge the selected team into "
								{winningTeamName}". The selected team will no longer exist after
								this operation. This cannot be undone.
							</AlertDescription>
						</Alert>

						<div className='space-y-2'>
							<Label htmlFor='losing-team'>
								Team to merge in (losing team)
							</Label>
							<Select
								value={selectedLosingTeamId}
								onValueChange={setSelectedLosingTeamId}
								disabled={allTeamsLoading || allTeamSeasonsLoading || isMerging}
							>
								<SelectTrigger id='losing-team'>
									<SelectValue
										placeholder={
											allTeamsLoading || allTeamSeasonsLoading
												? 'Loading teams...'
												: 'Select a team to merge in'
										}
									/>
								</SelectTrigger>
								<SelectContent>
									{teamOptions.map((t) => (
										<SelectItem key={t.id} value={t.id}>
											<div className='flex flex-col'>
												<span className='font-medium'>{t.name}</span>
												<span className='text-xs text-muted-foreground'>
													{t.mostRecentSeasonName
														? `${t.mostRecentSeasonName} • ${t.id}`
														: t.id}
												</span>
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className='text-xs text-muted-foreground'>
								If both teams have a record for the same season, the merge will
								be refused. Resolve the collision manually first.
							</p>
						</div>

						<div className='flex justify-end gap-2 pt-2'>
							<Button
								variant='outline'
								onClick={() => onOpenChange(false)}
								disabled={isMerging}
							>
								Cancel
							</Button>
							<Button
								variant='destructive'
								onClick={handleMerge}
								disabled={!selectedLosingTeamId || isMerging}
							>
								{isMerging ? (
									<>
										<Loader2 className='h-4 w-4 mr-2 animate-spin' />
										Merging...
									</>
								) : (
									<>
										<Combine className='h-4 w-4 mr-2' />
										Merge
									</>
								)}
							</Button>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
