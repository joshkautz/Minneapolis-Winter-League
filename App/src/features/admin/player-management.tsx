/**
 * Player Management admin component
 *
 * Allows admins to search for, view, and edit player documents
 */

import React, { useState, useMemo, useEffect } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument, useCollection } from 'react-firebase-hooks/firestore'
import { doc } from 'firebase/firestore'
import type { DocumentReference } from 'firebase/firestore'
import { toast } from 'sonner'
import {
	ArrowLeft,
	Users,
	AlertTriangle,
	Search,
	Edit,
	Save,
	X,
	Mail,
	Shield,
	UserCog,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { auth } from '@/firebase/auth'
import { firestore } from '@/firebase/app'
import { getPlayerRef, getPlayersQuery } from '@/firebase/collections/players'
import { seasonsQuery } from '@/firebase/collections/seasons'
import { teamsBySeasonQuery } from '@/firebase/collections/teams'
import { updatePlayerAdminViaFunction } from '@/firebase/collections/functions'
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
import { PageContainer, PageHeader } from '@/shared/components'
import {
	Collections,
	type PlayerDocument,
	type PlayerSeason,
	type SeasonDocument,
	type TeamDocument,
} from '@/shared/utils'

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
	seasons: SeasonFormData[]
}

export const PlayerManagement: React.FC = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading] = useDocument(playerRef)

	const [searchTerm, setSearchTerm] = useState('')
	const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
	const [isEditing, setIsEditing] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [formData, setFormData] = useState<PlayerFormData | null>(null)

	const isAdmin = playerSnapshot?.data()?.admin || false

	// Search for players
	const searchQuery = useMemo(() => getPlayersQuery(searchTerm), [searchTerm])
	const [playersSnapshot, playersLoading] = useCollection(searchQuery)

	// Fetch all seasons
	const [seasonsSnapshot] = useCollection(seasonsQuery())

	// Fetch selected player
	const [selectedPlayerSnapshot] = useDocument(
		selectedPlayerId
			? (getPlayerRef({
					uid: selectedPlayerId,
				} as any) as any)
			: undefined
	)

	// Fetch teams for all seasons (for dropdowns)
	const seasons = seasonsSnapshot?.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	})) as (SeasonDocument & { id: string })[] | undefined

	// Initialize form data when a player is selected
	useEffect(() => {
		if (selectedPlayerSnapshot?.exists() && !isEditing) {
			const playerData = selectedPlayerSnapshot.data() as PlayerDocument
			setFormData({
				firstname: playerData.firstname,
				lastname: playerData.lastname,
				email: playerData.email,
				admin: playerData.admin,
				seasons: playerData.seasons.map((ps: PlayerSeason) => ({
					seasonId: ps.season.id,
					captain: ps.captain,
					paid: ps.paid,
					signed: ps.signed,
					banned: ps.banned ?? false,
					lookingForTeam: ps.lookingForTeam ?? false,
					teamId: ps.team?.id || null,
				})),
			})
		}
	}, [selectedPlayerSnapshot, isEditing])

	const searchResults = useMemo(() => {
		if (!playersSnapshot) return []

		return playersSnapshot.docs.map((doc) => ({
			id: doc.id,
			...doc.data(),
		})) as (PlayerDocument & { id: string })[]
	}, [playersSnapshot])

	const handleSelectPlayer = (playerId: string) => {
		setSelectedPlayerId(playerId)
		setIsEditing(false)
	}

	const handleEdit = () => {
		setIsEditing(true)
	}

	const handleCancel = () => {
		setIsEditing(false)
		// Reset form data to current player data
		if (selectedPlayerSnapshot?.exists()) {
			const playerData = selectedPlayerSnapshot.data() as PlayerDocument
			setFormData({
				firstname: playerData.firstname,
				lastname: playerData.lastname,
				email: playerData.email,
				admin: playerData.admin,
				seasons: playerData.seasons.map((ps: PlayerSeason) => ({
					seasonId: ps.season.id,
					captain: ps.captain,
					paid: ps.paid,
					signed: ps.signed,
					banned: ps.banned ?? false,
					lookingForTeam: ps.lookingForTeam ?? false,
					teamId: ps.team?.id || null,
				})),
			})
		}
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

			setIsEditing(false)
		} catch (error: unknown) {
			console.error('Error updating player:', error)

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
							<Label htmlFor='search'>Player Name</Label>
							<Input
								id='search'
								type='text'
								placeholder='Search by name...'
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
							/>
							<p className='text-xs text-muted-foreground'>
								Enter first name, last name, or both
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
						<div className='flex items-center justify-between'>
							<CardTitle className='flex items-center gap-2'>
								<Users className='h-5 w-5 text-green-600' />
								Player Details
							</CardTitle>
							{selectedPlayerId && !isEditing && (
								<Button onClick={handleEdit} size='sm'>
									<Edit className='h-4 w-4 mr-2' />
									Edit
								</Button>
							)}
							{isEditing && (
								<div className='flex gap-2'>
									<Button
										onClick={handleSave}
										disabled={isSaving}
										size='sm'
										variant='default'
									>
										<Save className='h-4 w-4 mr-2' />
										{isSaving ? 'Saving...' : 'Save'}
									</Button>
									<Button
										onClick={handleCancel}
										disabled={isSaving}
										size='sm'
										variant='outline'
									>
										<X className='h-4 w-4 mr-2' />
										Cancel
									</Button>
								</div>
							)}
						</div>
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
												disabled={!isEditing}
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
												disabled={!isEditing}
											/>
										</div>
									</div>

									<div className='space-y-2'>
										<Label htmlFor='email'>Email Address</Label>
										<div className='flex gap-2 items-center'>
											<Mail className='h-4 w-4 text-muted-foreground' />
											<Input
												id='email'
												type='email'
												value={formData.email}
												onChange={(e) =>
													setFormData({ ...formData, email: e.target.value })
												}
												disabled={!isEditing}
												className='flex-1'
											/>
										</div>
										{isEditing && (
											<p className='text-xs text-muted-foreground'>
												Changing the email will also update Firebase
												Authentication and mark it as verified
											</p>
										)}
									</div>

									<div className='flex items-center space-x-2'>
										<Checkbox
											id='admin'
											checked={formData.admin}
											onCheckedChange={(checked) =>
												setFormData({
													...formData,
													admin: checked as boolean,
												})
											}
											disabled={!isEditing}
										/>
										<Label
											htmlFor='admin'
											className='flex items-center gap-2 cursor-pointer'
										>
											<Shield className='h-4 w-4 text-yellow-600' />
											Admin Privileges
										</Label>
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
											isEditing={isEditing}
											onFieldChange={handleSeasonFieldChange}
										/>
									))}
								</div>
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
	isEditing: boolean
	onFieldChange: (
		seasonId: string,
		field: keyof SeasonFormData,
		value: boolean | string | null
	) => void
}

const SeasonCard: React.FC<SeasonCardProps> = ({
	seasonData,
	seasons,
	isEditing,
	onFieldChange,
}) => {
	const season = seasons?.find((s) => s.id === seasonData.seasonId)
	const seasonName = season?.name || 'Unknown Season'

	// Fetch teams for this season
	// We need to get the season snapshot to create the proper query
	const [seasonSnapshot] = useDocument(
		season
			? (doc(
					firestore,
					Collections.SEASONS,
					season.id
				) as DocumentReference<SeasonDocument>)
			: undefined
	)

	const [teamsSnapshot] = useCollection(
		seasonSnapshot ? teamsBySeasonQuery(seasonSnapshot.ref) : undefined
	)

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
							disabled={!isEditing}
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
							disabled={!isEditing}
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
							disabled={!isEditing}
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
							disabled={!isEditing}
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
							disabled={!isEditing}
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
						disabled={!isEditing}
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
