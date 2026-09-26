/**
 * Season Management admin component
 *
 * Allows admin users to create, edit, and delete seasons
 */

import { useState } from 'react'
import { getDocs } from 'firebase/firestore'
import { Calendar, Plus, Edit, Trash2, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { format } from 'date-fns'

import {
	CENTS_PER_DOLLAR,
	formatDollars,
	logger,
	MIN_SIGNED_PLAYERS,
	usesTeamPayments,
	errorMessage,
} from '@/shared/utils'
import { useQueryErrorHandler, useResolvedSnapshot } from '@/shared/hooks'
import { useSeasonsContext } from '@/providers'
import { teamsInSeasonQuery } from '@/firebase/collections/teams'
import {
	createSeasonViaFunction,
	updateSeasonViaFunction,
	deleteSeasonViaFunction,
} from '@/firebase/collections/functions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageContainer, PageHeader, QueryError } from '@/shared/components'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { DestructiveConfirmationDialog } from '@/shared/components/destructive-confirmation-dialog'
import { SeasonDocument, SeasonFormat } from '@/types'
import { BackToAdminButton } from '@/features/admin/shared'

interface ProcessedSeason {
	id: string
	name: string
	dateStart: Date
	dateEnd: Date
	registrationStart: Date
	registrationEnd: Date
	teamCount: number
	stripe?: {
		priceId: string
		priceIdDev?: string
		returningPlayerCouponId?: string
		returningPlayerCouponIdDev?: string
	}
	format?: SeasonFormat
	teamRegistrationTotalCents?: number
}

type Pricing = 'player' | 'team'

type DialogMode = 'create' | 'edit' | null

export const SeasonManagement = () => {
	const navigate = useNavigate()

	// Get all seasons from context
	const {
		seasonsQuerySnapshot: seasonsSnapshot,
		seasonsQuerySnapshotLoading: seasonsLoading,
		seasonsQuerySnapshotError: seasonsError,
	} = useSeasonsContext()

	useQueryErrorHandler({
		error: seasonsError,
		component: 'SeasonManagement',
		errorLabel: 'seasons',
	})

	// Dialog state
	const [dialogMode, setDialogMode] = useState<DialogMode>(null)
	const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null)

	// Form state
	const [formName, setFormName] = useState('')
	const [formDateStart, setFormDateStart] = useState('')
	const [formDateEnd, setFormDateEnd] = useState('')
	const [formRegistrationStart, setFormRegistrationStart] = useState('')
	const [formRegistrationEnd, setFormRegistrationEnd] = useState('')

	// Stripe configuration form state
	const [formStripePriceId, setFormStripePriceId] = useState('')
	const [formStripePriceIdDev, setFormStripePriceIdDev] = useState('')
	const [formStripeCouponId, setFormStripeCouponId] = useState('')
	const [formStripeCouponIdDev, setFormStripeCouponIdDev] = useState('')

	// Season format state
	// Pricing: per player through a Stripe price, or per team on a total.
	const [formPricing, setFormPricing] = useState<Pricing>('player')
	const [formTeamTotalDollars, setFormTeamTotalDollars] = useState('')

	const [formFormat, setFormFormat] = useState<SeasonFormat>(
		SeasonFormat.TRADITIONAL
	)

	// Delete confirmation state
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [seasonToDelete, setSeasonToDelete] = useState<ProcessedSeason | null>(
		null
	)

	// Loading states
	const [isSubmitting, setIsSubmitting] = useState(false)

	// Process seasons

	// useResolvedSnapshot derives the loading state from which snapshot the
	// rows belong to, so there is no synchronous setState in an effect, and a
	// slow resolve for a superseded snapshot cannot overwrite newer rows.
	const { items: seasons } = useResolvedSnapshot(
		seasonsSnapshot,
		async (snapshot) => {
			const results = await Promise.all(
				snapshot.docs.map(async (seasonDoc) => {
					const seasonData = seasonDoc.data() as SeasonDocument
					const seasonId = seasonDoc.id

					try {
						// A season's teams are the teamSeasons documents that point
						// at it.
						const teamsQuery = teamsInSeasonQuery(seasonDoc.ref)
						const teamCount = teamsQuery ? (await getDocs(teamsQuery)).size : 0

						return {
							id: seasonId,
							name: seasonData.name,
							dateStart: seasonData.dateStart.toDate(),
							dateEnd: seasonData.dateEnd.toDate(),
							registrationStart: seasonData.registrationStart.toDate(),
							registrationEnd: seasonData.registrationEnd.toDate(),
							teamCount,
							stripe: seasonData.stripe,
							format: seasonData.format,
							teamRegistrationTotalCents: usesTeamPayments(seasonData)
								? seasonData.teamRegistrationTotalCents
								: undefined,
						} as ProcessedSeason
					} catch (error) {
						logger.error('Error processing season', error, { seasonId })
						return null
					}
				})
			)

			const validSeasons = results.filter(
				(r): r is ProcessedSeason => r !== null
			)
			return validSeasons
		}
	)

	const formatDateTime = (date: Date) => {
		return format(date, 'MMM dd, yyyy h:mm a')
	}

	const formatDateForInput = (date: Date) => {
		// Format as "YYYY-MM-DDTHH:mm" for datetime-local input
		const year = date.getFullYear()
		const month = String(date.getMonth() + 1).padStart(2, '0')
		const day = String(date.getDate()).padStart(2, '0')
		const hours = String(date.getHours()).padStart(2, '0')
		const minutes = String(date.getMinutes()).padStart(2, '0')
		return `${year}-${month}-${day}T${hours}:${minutes}`
	}

	const openCreateDialog = () => {
		setDialogMode('create')
		setSelectedSeasonId(null)
		setFormName('')
		setFormDateStart('')
		setFormDateEnd('')
		setFormRegistrationStart('')
		setFormRegistrationEnd('')
		// Reset Stripe fields
		setFormStripePriceId('')
		setFormStripePriceIdDev('')
		setFormStripeCouponId('')
		setFormStripeCouponIdDev('')
		// Reset format to default
		setFormFormat(SeasonFormat.TRADITIONAL)
		setFormPricing('player')
		setFormTeamTotalDollars('')
	}

	const openEditDialog = (season: ProcessedSeason) => {
		setDialogMode('edit')
		setSelectedSeasonId(season.id)
		setFormName(season.name)
		setFormDateStart(formatDateForInput(season.dateStart))
		setFormDateEnd(formatDateForInput(season.dateEnd))
		setFormRegistrationStart(formatDateForInput(season.registrationStart))
		setFormRegistrationEnd(formatDateForInput(season.registrationEnd))
		// Populate Stripe fields from existing data
		setFormStripePriceId(season.stripe?.priceId || '')
		setFormStripePriceIdDev(season.stripe?.priceIdDev || '')
		setFormStripeCouponId(season.stripe?.returningPlayerCouponId || '')
		setFormStripeCouponIdDev(season.stripe?.returningPlayerCouponIdDev || '')
		// Populate format
		setFormFormat(season.format || SeasonFormat.TRADITIONAL)
		setFormPricing(
			season.teamRegistrationTotalCents === undefined ? 'player' : 'team'
		)
		setFormTeamTotalDollars(
			season.teamRegistrationTotalCents === undefined
				? ''
				: String(season.teamRegistrationTotalCents / CENTS_PER_DOLLAR)
		)
	}

	const closeDialog = () => {
		setDialogMode(null)
		setSelectedSeasonId(null)
		setFormName('')
		setFormDateStart('')
		setFormDateEnd('')
		setFormRegistrationStart('')
		setFormRegistrationEnd('')
		// Reset Stripe fields
		setFormStripePriceId('')
		setFormStripePriceIdDev('')
		setFormStripeCouponId('')
		setFormStripeCouponIdDev('')
		// Reset format
		setFormFormat(SeasonFormat.TRADITIONAL)
		setFormPricing('player')
		setFormTeamTotalDollars('')
	}

	const handleSubmit = async () => {
		// Validation
		if (!formName.trim()) {
			toast.error('Season name is required')
			return
		}

		if (formName.length < 3 || formName.length > 100) {
			toast.error('Season name must be between 3 and 100 characters')
			return
		}

		if (
			!formDateStart ||
			!formDateEnd ||
			!formRegistrationStart ||
			!formRegistrationEnd
		) {
			toast.error('All date fields are required')
			return
		}

		// The server checks this too; this is to say so before the round trip.
		const teamTotalCents =
			formPricing === 'team'
				? Math.round(Number(formTeamTotalDollars) * CENTS_PER_DOLLAR)
				: undefined
		if (
			teamTotalCents !== undefined &&
			(!Number.isSafeInteger(teamTotalCents) ||
				teamTotalCents <= 0 ||
				teamTotalCents % CENTS_PER_DOLLAR !== 0)
		) {
			toast.error('Team total must be a whole number of dollars above $0')
			return
		}

		setIsSubmitting(true)

		try {
			// Build stripe config only if at least the production price ID is provided
			const stripeConfig = formStripePriceId
				? {
						priceId: formStripePriceId,
						...(formStripePriceIdDev && { priceIdDev: formStripePriceIdDev }),
						...(formStripeCouponId && {
							returningPlayerCouponId: formStripeCouponId,
						}),
						...(formStripeCouponIdDev && {
							returningPlayerCouponIdDev: formStripeCouponIdDev,
						}),
					}
				: undefined

			const data = {
				name: formName.trim(),
				dateStart: new Date(formDateStart),
				dateEnd: new Date(formDateEnd),
				registrationStart: new Date(formRegistrationStart),
				registrationEnd: new Date(formRegistrationEnd),
				// Per-team seasons do not use a Stripe price.
				stripe: formPricing === 'player' ? stripeConfig : undefined,
				format: formFormat,
			}

			if (dialogMode === 'create') {
				const result = await createSeasonViaFunction({
					...data,
					teamRegistrationTotalCents: teamTotalCents,
				})
				toast.success(result.message)
			} else if (dialogMode === 'edit' && selectedSeasonId) {
				const result = await updateSeasonViaFunction({
					seasonId: selectedSeasonId,
					...data,
					// Null returns the season to per-player pricing.
					teamRegistrationTotalCents: teamTotalCents ?? null,
				})
				toast.success(result.message)
			}

			closeDialog()
		} catch (error) {
			logger.error('Error submitting season', error)
			toast.error(
				errorMessage(error, 'The season could not be saved. Please try again.')
			)
		} finally {
			setIsSubmitting(false)
		}
	}

	const handleDeleteClick = (season: ProcessedSeason) => {
		setSeasonToDelete(season)
		setDeleteDialogOpen(true)
	}

	const handleDeleteConfirm = async () => {
		if (!seasonToDelete) return

		try {
			const result = await deleteSeasonViaFunction({
				seasonId: seasonToDelete.id,
			})
			toast.success(result.message)
			setDeleteDialogOpen(false)
			setSeasonToDelete(null)
		} catch (error) {
			logger.error('Error deleting season', error)
			toast.error(
				errorMessage(
					error,
					'The season could not be deleted. Please try again.'
				)
			)
		}
	}

	// Handle query errors
	if (seasonsError) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<QueryError
					error={seasonsError}
					title='Error Loading Seasons'
					onRetry={() => navigate(0)}
				/>
			</div>
		)
	}

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title='Season Management'
				description='Create, edit, and manage league seasons'
				icon={Calendar}
			/>

			{/* Back to Dashboard */}
			<div className='flex items-center justify-between'>
				<BackToAdminButton />
				<Button onClick={openCreateDialog}>
					<Plus className='h-4 w-4 mr-2' />
					Create Season
				</Button>
			</div>

			{/* Seasons Table */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Calendar className='h-5 w-5 text-purple-600' />
						All Seasons ({seasons.length})
					</CardTitle>
				</CardHeader>
				<CardContent>
					{seasonsLoading ? (
						<div className='text-center py-12'>
							<Loader2 className='h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground' />
							<p className='text-muted-foreground'>Loading seasons...</p>
						</div>
					) : seasons.length === 0 ? (
						<div className='text-center py-12'>
							<Calendar className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
							<p className='text-lg font-medium text-muted-foreground'>
								No Seasons Found
							</p>
							<p className='text-sm text-muted-foreground mt-2'>
								Create your first season to get started.
							</p>
						</div>
					) : (
						<div className='overflow-x-auto'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Name</TableHead>
										<TableHead>Season Dates</TableHead>
										<TableHead>Registration Dates</TableHead>
										<TableHead>Teams</TableHead>
										<TableHead className='text-right'>Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{seasons.map((season) => (
										<TableRow key={season.id}>
											<TableCell>
												<div className='flex items-center gap-2'>
													<span className='font-medium'>{season.name}</span>
													{season.format === SeasonFormat.SWISS && (
														<Badge variant='outline' className='text-xs'>
															Swiss
														</Badge>
													)}
													{season.teamRegistrationTotalCents !== undefined && (
														<Badge variant='outline' className='text-xs'>
															{formatDollars(season.teamRegistrationTotalCents)}{' '}
															per team
														</Badge>
													)}
												</div>
											</TableCell>
											<TableCell>
												<div className='text-sm space-y-1'>
													<div>
														<span className='text-muted-foreground'>
															Start:{' '}
														</span>
														{formatDateTime(season.dateStart)}
													</div>
													<div>
														<span className='text-muted-foreground'>End: </span>
														{formatDateTime(season.dateEnd)}
													</div>
												</div>
											</TableCell>
											<TableCell>
												<div className='text-sm space-y-1'>
													<div>
														<span className='text-muted-foreground'>
															Start:{' '}
														</span>
														{formatDateTime(season.registrationStart)}
													</div>
													<div>
														<span className='text-muted-foreground'>End: </span>
														{formatDateTime(season.registrationEnd)}
													</div>
												</div>
											</TableCell>
											<TableCell>
												<Badge variant='secondary'>
													{season.teamCount} teams
												</Badge>
											</TableCell>
											<TableCell className='text-right'>
												<div className='flex items-center justify-end gap-2'>
													<Button
														size='sm'
														variant='outline'
														onClick={() => openEditDialog(season)}
													>
														<Edit className='h-3 w-3 mr-1' />
														Edit
													</Button>
													<Button
														size='sm'
														variant='destructive'
														onClick={() => handleDeleteClick(season)}
													>
														<Trash2 className='h-3 w-3 mr-1' />
														Delete
													</Button>
												</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Create/Edit Dialog */}
			<Dialog
				open={dialogMode !== null}
				onOpenChange={(open) => !open && closeDialog()}
			>
				<DialogContent className='max-w-2xl max-h-[90vh] overflow-y-auto'>
					<DialogHeader>
						<DialogTitle>
							{dialogMode === 'create' ? 'Create New Season' : 'Edit Season'}
						</DialogTitle>
						<DialogDescription>
							{dialogMode === 'create'
								? 'Add a new season to the league. This will automatically be added to all existing players.'
								: 'Update season information. Changes will be reflected immediately.'}
						</DialogDescription>
					</DialogHeader>

					<div className='space-y-4 py-4'>
						{/* Season Name */}
						<div className='space-y-2'>
							<Label htmlFor='name'>
								Season Name <span className='text-red-500'>*</span>
							</Label>
							<Input
								id='name'
								placeholder='e.g., Winter 2025'
								value={formName}
								onChange={(e) => setFormName(e.target.value)}
								maxLength={100}
							/>
							<p className='text-xs text-muted-foreground'>
								{formName.length}/100 characters
							</p>
						</div>

						{/* Season Format */}
						<div className='space-y-2'>
							<Label>Season Format</Label>
							<RadioGroup
								value={formFormat}
								onValueChange={(value) => setFormFormat(value as SeasonFormat)}
								className='flex gap-6'
							>
								<div className='flex items-center space-x-2'>
									<RadioGroupItem
										value={SeasonFormat.TRADITIONAL}
										id='format-traditional'
									/>
									<Label
										htmlFor='format-traditional'
										className='font-normal cursor-pointer'
									>
										Traditional
									</Label>
								</div>
								<div className='flex items-center space-x-2'>
									<RadioGroupItem
										value={SeasonFormat.SWISS}
										id='format-swiss'
									/>
									<Label
										htmlFor='format-swiss'
										className='font-normal cursor-pointer'
									>
										Swiss
									</Label>
								</div>
							</RadioGroup>
							<p className='text-xs text-muted-foreground'>
								{formFormat === SeasonFormat.SWISS
									? 'Swiss format uses Wins × 2 + Buchholz for rankings'
									: 'Traditional format ranks by wins, then point differential'}
							</p>
						</div>

						{/* Pricing */}
						<div className='space-y-2'>
							<Label>Pricing</Label>
							<RadioGroup
								value={formPricing}
								onValueChange={(value) => setFormPricing(value as Pricing)}
								className='flex gap-6'
							>
								<div className='flex items-center space-x-2'>
									<RadioGroupItem value='player' id='pricing-player' />
									<Label
										htmlFor='pricing-player'
										className='font-normal cursor-pointer'
									>
										Per player
									</Label>
								</div>
								<div className='flex items-center space-x-2'>
									<RadioGroupItem value='team' id='pricing-team' />
									<Label
										htmlFor='pricing-team'
										className='font-normal cursor-pointer'
									>
										Per team
									</Label>
								</div>
							</RadioGroup>
							{formPricing === 'team' ? (
								<div className='space-y-1'>
									<Label htmlFor='teamTotal'>
										Team total (dollars) <span className='text-red-500'>*</span>
									</Label>
									<Input
										id='teamTotal'
										type='number'
										inputMode='numeric'
										min={1}
										step={1}
										placeholder='1000'
										value={formTeamTotalDollars}
										onChange={(e) => setFormTeamTotalDollars(e.target.value)}
									/>
									<p className='text-xs text-muted-foreground'>
										A team registers once {MIN_SIGNED_PLAYERS} players have
										signed and its roster has paid this much, in any split. It
										cannot be changed once any team is holding money.
									</p>
								</div>
							) : (
								<p className='text-xs text-muted-foreground'>
									Each player pays the Stripe price below.
								</p>
							)}
						</div>

						{/* Date Fields */}
						<div className='grid grid-cols-2 gap-4'>
							<div className='space-y-2'>
								<Label htmlFor='dateStart'>
									Season Start Date <span className='text-red-500'>*</span>
								</Label>
								<Input
									id='dateStart'
									type='datetime-local'
									value={formDateStart}
									onChange={(e) => setFormDateStart(e.target.value)}
								/>
							</div>
							<div className='space-y-2'>
								<Label htmlFor='dateEnd'>
									Season End Date <span className='text-red-500'>*</span>
								</Label>
								<Input
									id='dateEnd'
									type='datetime-local'
									value={formDateEnd}
									onChange={(e) => setFormDateEnd(e.target.value)}
								/>
							</div>
						</div>

						<div className='grid grid-cols-2 gap-4'>
							<div className='space-y-2'>
								<Label htmlFor='registrationStart'>
									Registration Start <span className='text-red-500'>*</span>
								</Label>
								<Input
									id='registrationStart'
									type='datetime-local'
									value={formRegistrationStart}
									onChange={(e) => setFormRegistrationStart(e.target.value)}
								/>
							</div>
							<div className='space-y-2'>
								<Label htmlFor='registrationEnd'>
									Registration End <span className='text-red-500'>*</span>
								</Label>
								<Input
									id='registrationEnd'
									type='datetime-local'
									value={formRegistrationEnd}
									onChange={(e) => setFormRegistrationEnd(e.target.value)}
								/>
							</div>
						</div>

						{/* Stripe Configuration (per-player pricing only) */}
						{formPricing === 'player' && (
							<div className='space-y-4 border-t pt-4 mt-4'>
								<h4 className='font-medium text-sm'>
									Stripe Payment Configuration
								</h4>
								<p className='text-xs text-muted-foreground'>
									Configure Stripe price and coupon IDs for this season. Players
									cannot pay until this is configured.
								</p>

								<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
									<div className='space-y-2'>
										<Label htmlFor='stripePriceId'>
											Price ID (Production){' '}
											<span className='text-red-500'>*</span>
										</Label>
										<Input
											id='stripePriceId'
											placeholder='price_...'
											value={formStripePriceId}
											onChange={(e) => setFormStripePriceId(e.target.value)}
										/>
										<p className='text-xs text-muted-foreground'>
											From Stripe Dashboard → Products
										</p>
									</div>
									<div className='space-y-2'>
										<Label htmlFor='stripePriceIdDev'>
											Price ID (Development)
										</Label>
										<Input
											id='stripePriceIdDev'
											placeholder='price_...'
											value={formStripePriceIdDev}
											onChange={(e) => setFormStripePriceIdDev(e.target.value)}
										/>
										<p className='text-xs text-muted-foreground'>
											Used when running locally
										</p>
									</div>
								</div>

								<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
									<div className='space-y-2'>
										<Label htmlFor='stripeCouponId'>
											Returning Player Coupon ID (Production)
										</Label>
										<Input
											id='stripeCouponId'
											placeholder='e.g., returning_player_2025'
											value={formStripeCouponId}
											onChange={(e) => setFormStripeCouponId(e.target.value)}
										/>
										<p className='text-xs text-muted-foreground'>
											Auto-applied for players who paid last season
										</p>
									</div>
									<div className='space-y-2'>
										<Label htmlFor='stripeCouponIdDev'>
											Returning Player Coupon ID (Development)
										</Label>
										<Input
											id='stripeCouponIdDev'
											placeholder='e.g., returning_player_dev'
											value={formStripeCouponIdDev}
											onChange={(e) => setFormStripeCouponIdDev(e.target.value)}
										/>
										<p className='text-xs text-muted-foreground'>
											Used when running locally
										</p>
									</div>
								</div>
							</div>
						)}
					</div>

					<DialogFooter>
						<Button
							variant='outline'
							onClick={closeDialog}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button onClick={handleSubmit} disabled={isSubmitting}>
							{isSubmitting ? (
								<>
									<Loader2 className='h-4 w-4 mr-2 animate-spin' />
									{dialogMode === 'create' ? 'Creating...' : 'Saving...'}
								</>
							) : (
								<>
									{dialogMode === 'create' ? 'Create Season' : 'Save Changes'}
								</>
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Dialog */}
			<DestructiveConfirmationDialog
				open={deleteDialogOpen}
				onOpenChange={setDeleteDialogOpen}
				onConfirm={handleDeleteConfirm}
				title='Delete Season'
				description={
					seasonToDelete
						? `Are you absolutely sure you want to delete "${seasonToDelete.name}"? This action cannot be undone and will remove the season from all player records. Associated teams, games, and offers will have orphaned references.`
						: ''
				}
				continueText='Delete Season'
			>
				<div />
			</DestructiveConfirmationDialog>
		</PageContainer>
	)
}
