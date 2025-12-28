/**
 * Player Management admin component
 *
 * Allows admins to search for, view, and edit player documents
 */

import { useState, useMemo, useEffect } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument, useCollection } from 'react-firebase-hooks/firestore'
import {
	doc,
	query,
	collection,
	where,
	or,
	and,
	type DocumentReference,
	type Query,
} from 'firebase/firestore'
import { toast } from 'sonner'
import {
	ArrowLeft,
	Users,
	AlertTriangle,
	Search,
	Save,
	Mail,
	Shield,
	UserCog,
	Loader2,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { auth } from '@/firebase/auth'
import { firestore } from '@/firebase/app'
import { getPlayerRef } from '@/firebase/collections/players'
import { useSeasonsContext } from '@/providers'
import { teamsBySeasonQuery } from '@/firebase/collections/teams'
import {
	updatePlayerAdminViaFunction,
	getPlayerAuthInfoViaFunction,
} from '@/firebase/collections/functions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { PageContainer, PageHeader, QueryError } from '@/shared/components'
import {
	Collections,
	type PlayerDocument,
	type PlayerSeason,
	type SeasonDocument,
	type TeamDocument,
	logger,
} from '@/shared/utils'
import { useQueryErrorHandler } from '@/shared/hooks'

interface SeasonFormData {
	seasonId: string
	captain: boolean
	paid: boolean
	signed: boolean
	banned: boolean
	lookingForTeam: boolean
	teamId: string | null
}

interface PlayerFormData {
	firstname: string
	lastname: string
	email: string
	admin: boolean
	emailVerified: boolean
	seasons: SeasonFormData[]
}

export const PlayerManagement = () => {
	const navigate = useNavigate()
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading, playerError] = useDocument(playerRef)

	const [searchTerm, setSearchTerm] = useState('')
	const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
	const [isSaving, setIsSaving] = useState(false)
	const [formData, setFormData] = useState<PlayerFormData | null>(null)
	const [originalFormData, setOriginalFormData] =
		useState<PlayerFormData | null>(null)

	// Check if form has changes compared to original data
	const hasChanges = useMemo(() => {
		if (!formData || !originalFormData) return false
		return JSON.stringify(formData) !== JSON.stringify(originalFormData)
	}, [formData, originalFormData])

	const isAdmin = playerSnapshot?.data()?.admin || false

	// Search for players by name or email
	const searchQuery = useMemo(() => {
		if (searchTerm === '') {
			return undefined
		}

		const trimmed = searchTerm.trim()
		const searchLower = trimmed.toLowerCase()

		// Check if it looks like an email (contains @)
		if (trimmed.includes('@')) {
			// Search by email only
			return query(
				collection(firestore, Collections.PLAYERS),
				where('email', '>=', searchLower),
				where('email', '<=', searchLower + '\uf8ff')
			) as Query<PlayerDocument>
		}

		// Check if searching by full name (contains space)
		if (trimmed.includes(' ')) {
			const [firstname, lastname] = trimmed.split(' ', 2)
			const firstCapitalized =
				firstname.charAt(0).toUpperCase() + firstname.slice(1).toLowerCase()
			const lastCapitalized =
				lastname.charAt(0).toUpperCase() + lastname.slice(1).toLowerCase()

			// Search by firstname AND lastname
			return query(
				collection(firestore, Collections.PLAYERS),
				where('firstname', '>=', firstCapitalized),
				where('firstname', '<=', firstCapitalized + '\uf8ff'),
				where('lastname', '>=', lastCapitalized),
				where('lastname', '<=', lastCapitalized + '\uf8ff')
			) as Query<PlayerDocument>
		}

		// Search by firstname OR lastname
		const searchCapitalized =
			trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()

		return query(
			collection(firestore, Collections.PLAYERS),
			or(
				and(
					where('firstname', '>=', searchCapitalized),
					where('firstname', '<=', searchCapitalized + '\uf8ff')
				),
				and(
					where('lastname', '>=', searchCapitalized),
					where('lastname', '<=', searchCapitalized + '\uf8ff')
				)
			)
		) as Query<PlayerDocument>
	}, [searchTerm])

	const [playersSnapshot, playersLoading, playersError] =
		useCollection(searchQuery)

	// Get all seasons from context
	const {
		seasonsQuerySnapshot: seasonsSnapshot,
		seasonsQuerySnapshotError: seasonsError,
	} = useSeasonsContext()

	// Log and notify on query errors
	useQueryErrorHandler({
		error: playerError,
		component: 'PlayerManagement',
		errorLabel: 'player',
	})
	useQueryErrorHandler({
		error: playersError,
		component: 'PlayerManagement',
		errorLabel: 'players',
	})
	useQueryErrorHandler({
		error: seasonsError,
		component: 'PlayerManagement',
		errorLabel: 'seasons',
	})

	// Fetch selected player - create document reference directly since we have a raw UID
	const [selectedPlayerSnapshot, , selectedPlayerError] = useDocument(
		selectedPlayerId
			? (doc(
					firestore,
					Collections.PLAYERS,
					selectedPlayerId
				) as DocumentReference<PlayerDocument>)
			: undefined
	)

	useQueryErrorHandler({
		error: selectedPlayerError,
		component: 'PlayerManagement',
		errorLabel: 'selected player',
		context: { playerId: selectedPlayerId },
	})

	// Fetch teams for all seasons (for dropdowns)
	const seasons = seasonsSnapshot?.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	})) as (SeasonDocument & { id: string })[] | undefined

	// Initialize form data when a player is selected
	useEffect(() => {
		const initializeFormData = async () => {
			if (selectedPlayerSnapshot?.exists() && selectedPlayerId) {
				const playerData = selectedPlayerSnapshot.data() as PlayerDocument

				// Fetch email verification status from Firebase Auth
				let emailVerified = false
				try {
					const authInfo = await getPlayerAuthInfoViaFunction({
						playerId: selectedPlayerId,
					})
					emailVerified = authInfo.emailVerified
				} catch (error) {
					logger.error('Failed to fetch player auth info:', {
						component: 'PlayerManagement',
						playerId: selectedPlayerId,
						error: error instanceof Error ? error.message : 'Unknown error',
					})
					// Default to false if we can't fetch the status
				}

				const newFormData = {
					firstname: playerData.firstname,
					lastname: playerData.lastname,
					email: playerData.email,
					admin: playerData.admin,
					emailVerified,
					seasons: playerData.seasons.map((ps: PlayerSeason) => ({
						seasonId: ps.season.id,
						captain: ps.captain,
						paid: ps.paid,
						signed: ps.signed,
						banned: ps.banned ?? false,
						lookingForTeam: ps.lookingForTeam ?? false,
						teamId: ps.team?.id || null,
					})),
				}
				setFormData(newFormData)
				setOriginalFormData(newFormData)
			}
		}

		initializeFormData()
	}, [selectedPlayerSnapshot, selectedPlayerId])

	const searchResults = useMemo(() => {
		if (!playersSnapshot) return []

		return playersSnapshot.docs.map((doc) => ({
			id: doc.id,
			...doc.data(),
		})) as (PlayerDocument & { id: string })[]
	}, [playersSnapshot])

	const handleSelectPlayer = (playerId: string) => {
		setSelectedPlayerId(playerId)
	}

	const handleSave = async () => {
		if (!formData || !selectedPlayerId) return

		// Validation
		if (!formData.firstname.trim()) {
			toast.error('First name is required')
			return
		}

		if (!formData.lastname.trim()) {
			toast.error('Last name is required')
			return
		}

		if (!formData.email.trim()) {
			toast.error('Email is required')
			return
		}

		// Email format validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (!emailRegex.test(formData.email.trim())) {
			toast.error('Please enter a valid email address')
			return
		}

		setIsSaving(true)
		try {
			const result = await updatePlayerAdminViaFunction({
				playerId: selectedPlayerId,
				firstname: formData.firstname,
				lastname: formData.lastname,
				email: formData.email,
				admin: formData.admin,
				emailVerified: formData.emailVerified,
				seasons: formData.seasons,
			})

			// Build detailed description of changes
			const changesList: string[] = []

			if (result.changes.firstname) {
				changesList.push(`Name changed to ${result.changes.firstname.to}`)
			}

			if (result.changes.lastname) {
				changesList.push(`Last name changed to ${result.changes.lastname.to}`)
			}

			if (result.changes.email) {
				changesList.push(`Email changed to ${result.changes.email.to}`)
			}

			if (result.changes.admin !== undefined) {
				changesList.push(
					`Admin status: ${result.changes.admin.to ? 'enabled' : 'disabled'}`
				)
			}

			if (result.changes.emailVerified !== undefined) {
				changesList.push(
					`Email verification: ${result.changes.emailVerified.to ? 'verified' : 'unverified'}`
				)
			}

			if (result.changes.seasons && result.changes.seasons.length > 0) {
				const seasonChanges = result.changes.seasons
					.map((sc) => {
						if (sc.updated && sc.changes) {
							const fields = Object.keys(sc.changes).join(', ')
							return `${sc.seasonName || sc.seasonId}: ${fields} updated`
						}
						return ''
					})
					.filter(Boolean)
					.join('; ')

				if (seasonChanges) {
					changesList.push(seasonChanges)
				}
			}

			const description =
				changesList.length > 0 ? changesList.join('. ') : 'No changes detected'

			toast.success(result.message, {
				description,
			})

			// Update original form data to reflect saved state
			setOriginalFormData(formData)
		} catch (error: unknown) {
			logger.error(
				'Error updating player',
				error instanceof Error ? error : undefined,
				{ component: 'PlayerManagement', action: 'updatePlayer' }
			)

			let errorMessage = 'Failed to update player. Please try again.'
			if (error && typeof error === 'object' && 'message' in error) {
				errorMessage = (error as { message: string }).message
			}

			toast.error(errorMessage)
		} finally {
			setIsSaving(false)
		}
	}

	const handleSeasonFieldChange = (
		seasonId: string,
		field: keyof SeasonFormData,
		value: boolean | string | null
	) => {
		if (!formData) return

		setFormData({
			...formData,
			seasons: formData.seasons.map((s) =>
				s.seasonId === seasonId ? { ...s, [field]: value } : s
			),
		})
	}

	// Handle authentication and data loading
	if (playerLoading) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<Card>
					<CardContent className='p-6 text-center'>
						<p>Loading...</p>
					</CardContent>
				</Card>
			</div>
		)
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

	// Handle non-admin users
	if (!isAdmin) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<Card>
					<CardContent className='p-6 text-center'>
						<div className='flex items-center justify-center gap-2 text-red-600 mb-4'>
							<AlertTriangle className='h-6 w-6' />
							<h2 className='text-xl font-semibold'>Access Denied</h2>
						</div>
						<p className='text-muted-foreground'>
							You don't have permission to access the admin dashboard.
						</p>
					</CardContent>
				</Card>
			</div>
		)
	}

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title='Player Management'
				description='Search, view, and edit player documents'
				icon={UserCog}
			/>

			{/* Back to Dashboard */}
			<div>
				<Button variant='outline' asChild>
					<Link to='/admin'>
						<ArrowLeft className='h-4 w-4 mr-2' />
						Back to Admin Dashboard
					</Link>
				</Button>
			</div>

			{/* Important Notes */}
			<Alert>
				<AlertTriangle className='h-5 w-5 text-yellow-600' />
				<AlertTitle>Important Notes</AlertTitle>
				<AlertDescription>
					<ul className='space-y-2 list-disc list-inside'>
						<li>
							Email changes will automatically update Firebase Authentication
							and mark the email as verified
						</li>
						<li>
							Team changes will automatically update the team document rosters
							in real-time
						</li>
						<li>
							Email verification status can be toggled in Basic Information and
							updates Firebase Authentication when saved
						</li>
					</ul>
				</AlertDescription>
			</Alert>

			<div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
				{/* Search Panel */}
				<Card className='lg:col-span-1'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Search className='h-5 w-5 text-blue-600' />
							Search Players
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<div className='space-y-2'>
							<Label htmlFor='search'>Player Name or Email</Label>
							<Input
								id='search'
								type='text'
								placeholder='Search by name or email...'
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
							/>
							<p className='text-xs text-muted-foreground'>
								Enter first name, last name, or email address
							</p>
						</div>

						{playersLoading && (
							<p className='text-sm text-muted-foreground'>Searching...</p>
						)}

						{searchResults.length > 0 && (
							<div className='space-y-2'>
								<Label>Search Results ({searchResults.length})</Label>
								<div className='max-h-96 overflow-y-auto space-y-2'>
									{searchResults.map((player) => (
										<Button
											key={player.id}
											variant={
												selectedPlayerId === player.id ? 'default' : 'outline'
											}
											className='w-full justify-start'
											onClick={() => handleSelectPlayer(player.id)}
										>
											<div className='flex flex-col items-start'>
												<span className='font-medium'>
													{player.firstname} {player.lastname}
												</span>
												<span className='text-xs text-muted-foreground'>
													{player.email}
												</span>
											</div>
										</Button>
									))}
								</div>
							</div>
						)}

						{searchTerm && !playersLoading && searchResults.length === 0 && (
							<p className='text-sm text-muted-foreground'>No players found</p>
						)}
					</CardContent>
				</Card>

				{/* Player Details Panel */}
				<Card className='lg:col-span-2'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Users className='h-5 w-5 text-green-600' />
							Player Details
						</CardTitle>
					</CardHeader>
					<CardContent>
						{!selectedPlayerId && (
							<div className='text-center py-12'>
								<Users className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
								<p className='text-muted-foreground'>
									Select a player from the search results to view and edit their
									details
								</p>
							</div>
						)}

						{selectedPlayerId && formData && (
							<div className='space-y-6'>
								{/* Basic Information */}
								<div className='space-y-4'>
									<h3 className='text-lg font-semibold'>Basic Information</h3>

									<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
										<div className='space-y-2'>
											<Label htmlFor='firstname'>First Name</Label>
											<Input
												id='firstname'
												value={formData.firstname}
												onChange={(e) =>
													setFormData({
														...formData,
														firstname: e.target.value,
													})
												}
											/>
										</div>

										<div className='space-y-2'>
											<Label htmlFor='lastname'>Last Name</Label>
											<Input
												id='lastname'
												value={formData.lastname}
												onChange={(e) =>
													setFormData({
														...formData,
														lastname: e.target.value,
													})
												}
											/>
										</div>

										<div className='space-y-2'>
											<Label htmlFor='email'>Email Address</Label>
											<div className='relative'>
												<Mail className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
												<Input
													id='email'
													type='email'
													value={formData.email}
													onChange={(e) =>
														setFormData({ ...formData, email: e.target.value })
													}
													className='pl-9'
												/>
											</div>
											<p className='text-xs text-muted-foreground'>
												Changing email updates Firebase Auth
											</p>
										</div>

										<div className='space-y-2'>
											<Label htmlFor='admin'>Admin Status</Label>
											<div
												role='button'
												tabIndex={0}
												onClick={() =>
													setFormData({
														...formData,
														admin: !formData.admin,
													})
												}
												onKeyDown={(e) => {
													if (e.key === 'Enter' || e.key === ' ') {
														e.preventDefault()
														setFormData({
															...formData,
															admin: !formData.admin,
														})
													}
												}}
												className='flex items-center h-9 px-3 border rounded-md bg-background cursor-pointer transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
												aria-pressed={formData.admin}
												aria-label='Toggle admin privileges'
											>
												<Checkbox
													id='admin'
													checked={formData.admin}
													onCheckedChange={(checked) =>
														setFormData({
															...formData,
															admin: checked as boolean,
														})
													}
													onClick={(e) => e.stopPropagation()}
													tabIndex={-1}
												/>
												<span className='flex items-center gap-2 ml-2 text-sm'>
													<Shield className='h-4 w-4 text-yellow-600' />
													Admin Privileges
												</span>
											</div>
										</div>

										<div className='space-y-2'>
											<Label htmlFor='emailVerified'>Email Verified</Label>
											<div
												role='button'
												tabIndex={0}
												onClick={() =>
													setFormData({
														...formData,
														emailVerified: !formData.emailVerified,
													})
												}
												onKeyDown={(e) => {
													if (e.key === 'Enter' || e.key === ' ') {
														e.preventDefault()
														setFormData({
															...formData,
															emailVerified: !formData.emailVerified,
														})
													}
												}}
												className='flex items-center justify-between h-9 px-3 border rounded-md bg-background cursor-pointer transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
												aria-pressed={formData.emailVerified}
												aria-label='Toggle email verification status'
											>
												<span className='flex items-center gap-2 text-sm'>
													<Mail className='h-4 w-4 text-muted-foreground' />
													{formData.emailVerified ? 'Verified' : 'Not Verified'}
												</span>
												<Switch
													id='emailVerified'
													checked={formData.emailVerified}
													onCheckedChange={(checked) =>
														setFormData({
															...formData,
															emailVerified: checked,
														})
													}
													onClick={(e) => e.stopPropagation()}
													tabIndex={-1}
												/>
											</div>
											<p className='text-xs text-muted-foreground'>
												Updates Firebase Authentication status
											</p>
										</div>
									</div>
								</div>

								<Separator />

								{/* Season Information */}
								<div className='space-y-4'>
									<h3 className='text-lg font-semibold'>Season Information</h3>

									{formData.seasons.length === 0 && (
										<p className='text-sm text-muted-foreground'>
											No seasons configured for this player
										</p>
									)}

									{formData.seasons.map((seasonData) => (
										<SeasonCard
											key={seasonData.seasonId}
											seasonData={seasonData}
											seasons={seasons}
											onFieldChange={handleSeasonFieldChange}
										/>
									))}
								</div>

								{/* Save Button */}
								<Button
									onClick={handleSave}
									disabled={isSaving || !hasChanges}
									className='w-full'
									size='lg'
								>
									{isSaving ? (
										<>
											<Loader2 className='h-4 w-4 mr-2 animate-spin' />
											Saving Changes...
										</>
									) : (
										<>
											<Save className='h-4 w-4 mr-2' />
											Save Changes
										</>
									)}
								</Button>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</PageContainer>
	)
}

interface SeasonCardProps {
	seasonData: SeasonFormData
	seasons: (SeasonDocument & { id: string })[] | undefined
	onFieldChange: (
		seasonId: string,
		field: keyof SeasonFormData,
		value: boolean | string | null
	) => void
}

const SeasonCard = ({
	seasonData,
	seasons,
	onFieldChange,
}: SeasonCardProps) => {
	const season = seasons?.find((s) => s.id === seasonData.seasonId)
	const seasonName = season?.name || 'Unknown Season'

	// Fetch teams for this season
	// We need to get the season snapshot to create the proper query
	const [seasonSnapshot, , seasonError] = useDocument(
		season
			? (doc(
					firestore,
					Collections.SEASONS,
					season.id
				) as DocumentReference<SeasonDocument>)
			: undefined
	)

	const [teamsSnapshot, , teamsError] = useCollection(
		seasonSnapshot ? teamsBySeasonQuery(seasonSnapshot.ref) : undefined
	)

	// Log and notify on query errors
	useEffect(() => {
		if (seasonError) {
			logger.error('Failed to load season:', {
				component: 'SeasonCard',
				seasonId: season?.id,
				error: seasonError.message,
			})
			toast.error('Failed to load season', {
				description: seasonError.message,
			})
		}
	}, [seasonError, season?.id])

	useEffect(() => {
		if (teamsError) {
			logger.error('Failed to load teams:', {
				component: 'SeasonCard',
				seasonId: season?.id,
				error: teamsError.message,
			})
			toast.error('Failed to load teams', {
				description: teamsError.message,
			})
		}
	}, [teamsError, season?.id])

	const teams = useMemo(() => {
		if (!teamsSnapshot) return []

		return teamsSnapshot.docs
			.map((doc) => ({
				id: doc.id,
				...doc.data(),
			}))
			.sort((a, b) => a.name.localeCompare(b.name)) as (TeamDocument & {
			id: string
		})[]
	}, [teamsSnapshot])

	return (
		<Card>
			<CardHeader className='pb-3'>
				<CardTitle className='text-base'>{seasonName}</CardTitle>
			</CardHeader>
			<CardContent className='space-y-4'>
				<div className='grid grid-cols-2 gap-4'>
					<div className='flex items-center space-x-2'>
						<Checkbox
							id={`captain-${seasonData.seasonId}`}
							checked={seasonData.captain}
							onCheckedChange={(checked) =>
								onFieldChange(
									seasonData.seasonId,
									'captain',
									checked as boolean
								)
							}
						/>
						<Label
							htmlFor={`captain-${seasonData.seasonId}`}
							className='cursor-pointer'
						>
							Captain
						</Label>
					</div>

					<div className='flex items-center space-x-2'>
						<Checkbox
							id={`paid-${seasonData.seasonId}`}
							checked={seasonData.paid}
							onCheckedChange={(checked) =>
								onFieldChange(seasonData.seasonId, 'paid', checked as boolean)
							}
						/>
						<Label
							htmlFor={`paid-${seasonData.seasonId}`}
							className='cursor-pointer'
						>
							Paid
						</Label>
					</div>

					<div className='flex items-center space-x-2'>
						<Checkbox
							id={`signed-${seasonData.seasonId}`}
							checked={seasonData.signed}
							onCheckedChange={(checked) =>
								onFieldChange(seasonData.seasonId, 'signed', checked as boolean)
							}
						/>
						<Label
							htmlFor={`signed-${seasonData.seasonId}`}
							className='cursor-pointer'
						>
							Signed Waiver
						</Label>
					</div>

					<div className='flex items-center space-x-2'>
						<Checkbox
							id={`banned-${seasonData.seasonId}`}
							checked={seasonData.banned}
							onCheckedChange={(checked) =>
								onFieldChange(seasonData.seasonId, 'banned', checked as boolean)
							}
						/>
						<Label
							htmlFor={`banned-${seasonData.seasonId}`}
							className='cursor-pointer text-red-600'
						>
							Banned
						</Label>
					</div>

					<div className='flex items-center space-x-2'>
						<Checkbox
							id={`lookingForTeam-${seasonData.seasonId}`}
							checked={seasonData.lookingForTeam}
							onCheckedChange={(checked) =>
								onFieldChange(
									seasonData.seasonId,
									'lookingForTeam',
									checked as boolean
								)
							}
						/>
						<Label
							htmlFor={`lookingForTeam-${seasonData.seasonId}`}
							className='cursor-pointer'
						>
							Looking for Team
						</Label>
					</div>
				</div>

				<div className='space-y-2'>
					<Label htmlFor={`team-${seasonData.seasonId}`}>Team</Label>
					<Select
						value={seasonData.teamId || 'none'}
						onValueChange={(value) =>
							onFieldChange(
								seasonData.seasonId,
								'teamId',
								value === 'none' ? null : value
							)
						}
					>
						<SelectTrigger
							id={`team-${seasonData.seasonId}`}
							className='w-full'
						>
							<SelectValue placeholder='No team' />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='none'>No team</SelectItem>
							{teams.map((team) => (
								<SelectItem key={team.id} value={team.id}>
									{team.name}
									{team.registered && (
										<Badge variant='outline' className='ml-2'>
											Registered
										</Badge>
									)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</CardContent>
		</Card>
	)
}
