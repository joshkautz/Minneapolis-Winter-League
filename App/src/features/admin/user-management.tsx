/**
 * User Management admin component
 *
 * Provides admin tools for managing user accounts
 */

import React, { useState } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument } from 'react-firebase-hooks/firestore'
import { toast } from 'sonner'
import { ArrowLeft, Mail, Users, AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'

import { auth } from '@/firebase/auth'
import { getPlayerRef } from '@/firebase/collections/players'
import { updatePlayerEmailViaFunction } from '@/firebase/collections/functions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageContainer, PageHeader } from '@/shared/components'

export const UserManagement: React.FC = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading] = useDocument(playerRef)

	const [playerId, setPlayerId] = useState('')
	const [newEmail, setNewEmail] = useState('')
	const [isUpdating, setIsUpdating] = useState(false)

	const isAdmin = playerSnapshot?.data()?.admin || false

	const handleUpdateEmail = async (e: React.FormEvent) => {
		e.preventDefault()

		if (!playerId.trim()) {
			toast.error('Please enter a Player ID')
			return
		}

		if (!newEmail.trim()) {
			toast.error('Please enter a new email address')
			return
		}

		// Basic email validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (!emailRegex.test(newEmail.trim())) {
			toast.error('Please enter a valid email address')
			return
		}

		setIsUpdating(true)
		try {
			const result = await updatePlayerEmailViaFunction({
				playerId: playerId.trim(),
				newEmail: newEmail.trim(),
			})

			if (result.success) {
				toast.success(result.message)
				// Clear form
				setPlayerId('')
				setNewEmail('')
			}
		} catch (error: unknown) {
			console.error('Error updating player email:', error)

			// Extract error message from Firebase Functions error
			let errorMessage = 'Failed to update email. Please try again.'
			if (error && typeof error === 'object' && 'message' in error) {
				errorMessage = (error as { message: string }).message
			}

			toast.error(errorMessage)
		} finally {
			setIsUpdating(false)
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
				title='User Management'
				description='Manage user accounts and permissions'
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

			{/* Update Email Card */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Mail className='h-5 w-5 text-blue-600' />
						Update User Email Address
					</CardTitle>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleUpdateEmail} className='space-y-4'>
						<div className='space-y-2'>
							<Label htmlFor='playerId'>Player ID (User ID)</Label>
							<Input
								id='playerId'
								type='text'
								placeholder='Enter the Firebase Authentication User ID'
								value={playerId}
								onChange={(e) => setPlayerId(e.target.value)}
								disabled={isUpdating}
							/>
							<p className='text-sm text-muted-foreground'>
								The Firebase Authentication UID of the user whose email you want
								to update.
							</p>
						</div>

						<div className='space-y-2'>
							<Label htmlFor='newEmail'>New Email Address</Label>
							<Input
								id='newEmail'
								type='email'
								placeholder='user@example.com'
								value={newEmail}
								onChange={(e) => setNewEmail(e.target.value)}
								disabled={isUpdating}
							/>
							<p className='text-sm text-muted-foreground'>
								The new email address will be automatically marked as verified.
							</p>
						</div>

						<Button type='submit' disabled={isUpdating} className='w-full'>
							<Mail className='h-4 w-4 mr-2' />
							{isUpdating ? 'Updating Email...' : 'Update Email Address'}
						</Button>
					</form>

					<div className='mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md'>
						<div className='flex gap-2'>
							<AlertTriangle className='h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5' />
							<div className='space-y-2'>
								<p className='text-sm font-semibold text-yellow-800'>
									Important Notes:
								</p>
								<ul className='text-sm text-yellow-700 space-y-1 list-disc list-inside'>
									<li>
										This action will update the email in both Firebase
										Authentication and the Firestore player document.
									</li>
									<li>
										The new email will be marked as verified automatically.
									</li>
									<li>
										The user will be able to sign in with the new email address
										immediately.
									</li>
									<li>
										Make sure you have the correct Player ID before updating.
									</li>
									<li>This action is logged for audit purposes.</li>
								</ul>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</PageContainer>
	)
}
