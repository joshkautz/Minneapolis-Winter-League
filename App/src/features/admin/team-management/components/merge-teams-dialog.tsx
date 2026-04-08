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
import { toast } from 'sonner'
import { Combine, Loader2, AlertTriangle } from 'lucide-react'

import { logger } from '@/shared/utils'
import { allTeamsQuery, teamsInSeasonQuery } from '@/firebase/collections/teams'
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
	label: string
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

	// Load all team-season subdocs across all seasons so we can show a
	// friendly name next to each canonical team id. We use a non-season
	// filter by just walking the team-seasons collectionGroup — but the
	// simplest path here is to reuse teamsInSeasonQuery for the current
	// season if available. To keep this light we just read all team docs
	// and fall back to the id when no name is known.
	void teamsInSeasonQuery

	const [selectedLosingTeamId, setSelectedLosingTeamId] = useState<string>('')
	const [isMerging, setIsMerging] = useState(false)

	const teamOptions: CanonicalTeamOption[] = useMemo(() => {
		if (!allTeamsSnapshot) return []
		return allTeamsSnapshot.docs
			.filter((d) => d.id !== winningTeamId)
			.map((d) => ({ id: d.id, label: d.id }))
			.sort((a, b) => a.label.localeCompare(b.label))
	}, [allTeamsSnapshot, winningTeamId])

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
								disabled={allTeamsLoading || isMerging}
							>
								<SelectTrigger id='losing-team'>
									<SelectValue
										placeholder={
											allTeamsLoading
												? 'Loading teams...'
												: 'Select a team to merge in'
										}
									/>
								</SelectTrigger>
								<SelectContent>
									{teamOptions.map((t) => (
										<SelectItem key={t.id} value={t.id}>
											{t.label}
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
