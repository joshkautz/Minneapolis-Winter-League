/**
 * Email Verification admin component
 *
 * Allows admins to mark user emails as verified
 */

import React, { useState, useMemo } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument, useCollection } from 'react-firebase-hooks/firestore'
import {
	query,
	collection,
	where,
	or,
	and,
	type Query,
} from 'firebase/firestore'
import { toast } from 'sonner'
import {
	ArrowLeft,
	CheckCircle,
	AlertTriangle,
	Mail,
	Shield,
	Search,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { auth } from '@/firebase/auth'
import { firestore } from '@/firebase/app'
import { getPlayerRef } from '@/firebase/collections/players'
import { verifyUserEmailViaFunction } from '@/firebase/collections/functions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { PageContainer, PageHeader } from '@/shared/components'
import { Collections, type PlayerDocument, logger } from '@/shared/utils'

export const EmailVerification: React.FC = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading] = useDocument(playerRef)

	const [searchTerm, setSearchTerm] = useState('')
	const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
	const [isVerifying, setIsVerifying] = useState(false)

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

	const [playersSnapshot, playersLoading] = useCollection(searchQuery)

	const searchResults = useMemo(() => {
		if (!playersSnapshot) return []

		return playersSnapshot.docs.map((doc) => ({
			id: doc.id,
			...doc.data(),
		})) as (PlayerDocument & { id: string })[]
	}, [playersSnapshot])

	const selectedPlayer = useMemo(() => {
		return searchResults.find((p) => p.id === selectedPlayerId)
	}, [searchResults, selectedPlayerId])

	const handleSelectPlayer = (playerId: string) => {
		setSelectedPlayerId(playerId)
	}

	const handleVerifyEmail = async () => {
		if (!selectedPlayerId) {
			toast.error('Please select a player')
			return
		}

		setIsVerifying(true)
		try {
			const result = await verifyUserEmailViaFunction({ uid: selectedPlayerId })

			if (result.success) {
				toast.success(result.message)
				// Keep player selected and search term intact
			}
		} catch (error: unknown) {
			logger.error(
				'Error verifying user email',
				error instanceof Error ? error : undefined,
				{ component: 'EmailVerification', action: 'verifyEmail' }
			)

			// Extract error message from Firebase Functions error
			let errorMessage = 'Failed to verify email. Please try again.'
			if (error && typeof error === 'object' && 'message' in error) {
				errorMessage = (error as { message: string }).message
			}

			toast.error(errorMessage)
		} finally {
			setIsVerifying(false)
		}
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
				title='Email Verification'
				description='Mark user email addresses as verified'
				icon={Shield}
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

			<Alert className='mt-6'>
				<AlertTriangle className='h-5 w-5' />
				<AlertTitle>Important Notes</AlertTitle>
				<AlertDescription>
					<ul className='space-y-1 list-disc list-inside mt-2'>
						<li>
							This action will mark the user's email as verified in Firebase
							Authentication.
						</li>
						<li>This action is logged for audit purposes.</li>
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

				{/* Player Details and Verify Panel */}
				<Card className='lg:col-span-2'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<CheckCircle className='h-5 w-5 text-green-600' />
							Verify Email Address
						</CardTitle>
					</CardHeader>
					<CardContent>
						{!selectedPlayerId && (
							<div className='text-center py-12'>
								<Mail className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
								<p className='text-muted-foreground'>
									Select a player from the search results to verify their email
									address
								</p>
							</div>
						)}

						{selectedPlayerId && selectedPlayer && (
							<div className='space-y-6'>
								{/* Player Information */}
								<div className='space-y-4'>
									<h3 className='text-lg font-semibold'>Player Information</h3>

									<div className='grid grid-cols-1 gap-4'>
										<div className='space-y-2'>
											<Label>Name</Label>
											<div className='p-3 bg-muted rounded-md'>
												{selectedPlayer.firstname} {selectedPlayer.lastname}
											</div>
										</div>

										<div className='space-y-2'>
											<Label>Email Address</Label>
											<div className='flex gap-2 items-center p-3 bg-muted rounded-md'>
												<Mail className='h-4 w-4 text-muted-foreground' />
												<span>{selectedPlayer.email}</span>
											</div>
										</div>

										<div className='space-y-2'>
											<Label>User ID</Label>
											<div className='p-3 bg-muted rounded-md font-mono text-sm'>
												{selectedPlayerId}
											</div>
										</div>
									</div>
								</div>

								{/* Action Button */}
								<Button
									onClick={handleVerifyEmail}
									disabled={isVerifying}
									className='w-full'
									size='lg'
								>
									<CheckCircle className='h-4 w-4 mr-2' />
									{isVerifying
										? 'Verifying Email...'
										: 'Mark Email as Verified'}
								</Button>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</PageContainer>
	)
}
