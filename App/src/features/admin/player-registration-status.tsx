/**
 * Player Registration Status admin component
 *
 * Displays all players with their email verification, payment, and waiver status
 */

import React, { useState, useMemo } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument, useCollection } from 'react-firebase-hooks/firestore'
import { collection } from 'firebase/firestore'
import {
	ArrowLeft,
	Users,
	Search,
	CheckCircle,
	XCircle,
	AlertTriangle,
	Filter,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { auth } from '@/firebase/auth'
import { firestore } from '@/firebase/app'
import { getPlayerRef } from '@/firebase/collections/players'
import { seasonsQuery } from '@/firebase/collections/seasons'
import { Collections } from '@/shared/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { PageContainer, PageHeader } from '@/shared/components'
import type { PlayerDocument } from '@/types'

type FilterType =
	| 'all'
	| 'incomplete'
	| 'complete'
	| 'missing-verification'
	| 'missing-payment'
	| 'missing-waiver'

interface PlayerStatus {
	id: string
	firstname: string
	lastname: string
	email: string
	emailVerified: boolean
	paid: boolean
	signed: boolean
	teamName: string | null
	isComplete: boolean
}

export const PlayerRegistrationStatus: React.FC = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading] = useDocument(playerRef)
	const [searchTerm, setSearchTerm] = useState('')
	const [filterType, setFilterType] = useState<FilterType>('all')

	const isAdmin = playerSnapshot?.data()?.admin || false

	// Fetch all players - use collection directly since we need all players
	const [playersSnapshot, playersLoading] = useCollection(
		collection(firestore, Collections.PLAYERS)
	)

	// Fetch current season - get the first season from the list (most recent)
	const [seasonsSnapshot, seasonsLoading] = useCollection(seasonsQuery())

	const currentSeason =
		seasonsSnapshot?.docs.find((doc) => doc.data().current === true) ||
		seasonsSnapshot?.docs[0]

	// Process player data
	const playerStatuses = useMemo(() => {
		if (!playersSnapshot || !currentSeason) return []

		const statuses: PlayerStatus[] = []

		playersSnapshot.docs.forEach((doc) => {
			const playerData = doc.data() as PlayerDocument
			const playerId = doc.id

			// Find current season data for this player
			const currentSeasonData = playerData.seasons?.find(
				(season) => season.season.id === currentSeason.id
			)

			const emailVerified = playerData.emailVerified || false
			const paid = currentSeasonData?.paid || false
			const signed = currentSeasonData?.signed || false
			const isComplete = emailVerified && paid && signed

			// Get team name if available
			let teamName: string | null = null
			if (currentSeasonData?.team) {
				// We'll need to handle this asynchronously or store team names in player data
				teamName = null // For now, we'll leave this as null
			}

			statuses.push({
				id: playerId,
				firstname: playerData.firstname,
				lastname: playerData.lastname,
				email: playerData.email,
				emailVerified,
				paid,
				signed,
				teamName,
				isComplete,
			})
		})

		// Sort by last name
		return statuses.sort((a, b) => a.lastname.localeCompare(b.lastname))
	}, [playersSnapshot, currentSeason])

	// Filter players based on search term and filter type
	const filteredPlayers = useMemo(() => {
		let filtered = playerStatuses

		// Apply search filter
		if (searchTerm) {
			const searchLower = searchTerm.toLowerCase()
			filtered = filtered.filter(
				(player) =>
					player.firstname.toLowerCase().includes(searchLower) ||
					player.lastname.toLowerCase().includes(searchLower) ||
					player.email.toLowerCase().includes(searchLower)
			)
		}

		// Apply status filter
		switch (filterType) {
			case 'incomplete':
				filtered = filtered.filter((player) => !player.isComplete)
				break
			case 'complete':
				filtered = filtered.filter((player) => player.isComplete)
				break
			case 'missing-verification':
				filtered = filtered.filter((player) => !player.emailVerified)
				break
			case 'missing-payment':
				filtered = filtered.filter((player) => !player.paid)
				break
			case 'missing-waiver':
				filtered = filtered.filter((player) => !player.signed)
				break
			case 'all':
			default:
				// No additional filtering
				break
		}

		return filtered
	}, [playerStatuses, searchTerm, filterType])

	// Calculate statistics
	const stats = useMemo(() => {
		const total = playerStatuses.length
		const complete = playerStatuses.filter((p) => p.isComplete).length
		const missingVerification = playerStatuses.filter(
			(p) => !p.emailVerified
		).length
		const missingPayment = playerStatuses.filter((p) => !p.paid).length
		const missingWaiver = playerStatuses.filter((p) => !p.signed).length

		return {
			total,
			complete,
			incomplete: total - complete,
			missingVerification,
			missingPayment,
			missingWaiver,
		}
	}, [playerStatuses])

	// Handle authentication and data loading
	if (playerLoading || playersLoading || seasonsLoading) {
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

	if (!currentSeason) {
		return (
			<PageContainer withSpacing withGap>
				<PageHeader
					title='Player Registration Status'
					description='Monitor player registration progress'
					icon={Users}
				/>
				<Card>
					<CardContent className='p-6 text-center'>
						<AlertTriangle className='h-12 w-12 text-yellow-500 mx-auto mb-4' />
						<p className='text-lg font-medium text-muted-foreground'>
							No current season found
						</p>
					</CardContent>
				</Card>
			</PageContainer>
		)
	}

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title='Player Registration Status'
				description={`Monitor player registration progress for ${currentSeason.data()?.name || 'current season'}`}
				icon={Users}
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

			{/* Statistics Cards */}
			<div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4'>
				<Card>
					<CardHeader className='pb-2'>
						<CardTitle className='text-sm font-medium text-muted-foreground'>
							Total Players
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold'>{stats.total}</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className='pb-2'>
						<CardTitle className='text-sm font-medium text-green-600'>
							Complete
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold text-green-600'>
							{stats.complete}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className='pb-2'>
						<CardTitle className='text-sm font-medium text-red-600'>
							Incomplete
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold text-red-600'>
							{stats.incomplete}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className='pb-2'>
						<CardTitle className='text-sm font-medium text-muted-foreground'>
							No Verification
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold'>
							{stats.missingVerification}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className='pb-2'>
						<CardTitle className='text-sm font-medium text-muted-foreground'>
							No Payment
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold'>{stats.missingPayment}</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className='pb-2'>
						<CardTitle className='text-sm font-medium text-muted-foreground'>
							No Waiver
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold'>{stats.missingWaiver}</div>
					</CardContent>
				</Card>
			</div>

			{/* Filters and Search */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Filter className='h-5 w-5' />
						Filters
					</CardTitle>
				</CardHeader>
				<CardContent className='space-y-4'>
					<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
						<div className='space-y-2'>
							<label className='text-sm font-medium'>Search</label>
							<div className='relative'>
								<Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
								<Input
									placeholder='Search by name or email...'
									value={searchTerm}
									onChange={(e) => setSearchTerm(e.target.value)}
									className='pl-10'
								/>
							</div>
						</div>

						<div className='space-y-2'>
							<label className='text-sm font-medium'>Status Filter</label>
							<Select
								value={filterType}
								onValueChange={(value) => setFilterType(value as FilterType)}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value='all'>All Players</SelectItem>
									<SelectItem value='incomplete'>
										Incomplete Registration
									</SelectItem>
									<SelectItem value='complete'>
										Complete Registration
									</SelectItem>
									<SelectItem value='missing-verification'>
										Missing Email Verification
									</SelectItem>
									<SelectItem value='missing-payment'>
										Missing Payment
									</SelectItem>
									<SelectItem value='missing-waiver'>Missing Waiver</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className='text-sm text-muted-foreground'>
						Showing {filteredPlayers.length} of {stats.total} players
					</div>
				</CardContent>
			</Card>

			{/* Players Table */}
			<Card>
				<CardHeader>
					<CardTitle>Player Registration Status</CardTitle>
				</CardHeader>
				<CardContent>
					<div className='overflow-x-auto'>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Email</TableHead>
									<TableHead className='text-center'>Email Verified</TableHead>
									<TableHead className='text-center'>Payment</TableHead>
									<TableHead className='text-center'>Waiver</TableHead>
									<TableHead className='text-center'>Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filteredPlayers.length === 0 ? (
									<TableRow>
										<TableCell colSpan={6} className='text-center py-8'>
											<p className='text-muted-foreground'>No players found</p>
										</TableCell>
									</TableRow>
								) : (
									filteredPlayers.map((player) => (
										<TableRow key={player.id}>
											<TableCell className='font-medium'>
												{player.firstname} {player.lastname}
											</TableCell>
											<TableCell className='text-sm text-muted-foreground'>
												{player.email}
											</TableCell>
											<TableCell className='text-center'>
												{player.emailVerified ? (
													<CheckCircle className='h-5 w-5 text-green-500 inline-block' />
												) : (
													<XCircle className='h-5 w-5 text-red-500 inline-block' />
												)}
											</TableCell>
											<TableCell className='text-center'>
												{player.paid ? (
													<CheckCircle className='h-5 w-5 text-green-500 inline-block' />
												) : (
													<XCircle className='h-5 w-5 text-red-500 inline-block' />
												)}
											</TableCell>
											<TableCell className='text-center'>
												{player.signed ? (
													<CheckCircle className='h-5 w-5 text-green-500 inline-block' />
												) : (
													<XCircle className='h-5 w-5 text-red-500 inline-block' />
												)}
											</TableCell>
											<TableCell className='text-center'>
												{player.isComplete ? (
													<Badge
														variant='default'
														className='bg-green-100 text-green-800 hover:bg-green-200'
													>
														Complete
													</Badge>
												) : (
													<Badge
														variant='default'
														className='bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
													>
														Incomplete
													</Badge>
												)}
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>

			{/* Legend */}
			<Card>
				<CardHeader>
					<CardTitle className='text-base'>Legend</CardTitle>
				</CardHeader>
				<CardContent>
					<div className='grid grid-cols-1 md:grid-cols-3 gap-4 text-sm'>
						<div className='flex items-center gap-2'>
							<CheckCircle className='h-4 w-4 text-green-500' />
							<span className='text-muted-foreground'>Step completed</span>
						</div>
						<div className='flex items-center gap-2'>
							<XCircle className='h-4 w-4 text-red-500' />
							<span className='text-muted-foreground'>Step not completed</span>
						</div>
						<div className='flex items-center gap-2'>
							<Badge
								variant='default'
								className='bg-green-100 text-green-800 hover:bg-green-200'
							>
								Complete
							</Badge>
							<span className='text-muted-foreground'>All steps completed</span>
						</div>
					</div>
				</CardContent>
			</Card>
		</PageContainer>
	)
}
