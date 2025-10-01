/**
 * Email Verification admin component
 *
 * Allows admins to mark user emails as verified
 */

import React, { useState } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument } from 'react-firebase-hooks/firestore'
import { toast } from 'sonner'
import {
	ArrowLeft,
	CheckCircle,
	AlertTriangle,
	Mail,
	Shield,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { auth } from '@/firebase/auth'
import { getPlayerRef } from '@/firebase/collections/players'
import { verifyUserEmailViaFunction } from '@/firebase/collections/functions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageContainer, PageHeader } from '@/shared/components'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

export const EmailVerification: React.FC = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading] = useDocument(playerRef)

	const [identifierType, setIdentifierType] = useState<'email' | 'uid'>('email')
	const [emailInput, setEmailInput] = useState('')
	const [uidInput, setUidInput] = useState('')
	const [isVerifying, setIsVerifying] = useState(false)

	const isAdmin = playerSnapshot?.data()?.admin || false

	const handleVerifyEmail = async (e: React.FormEvent) => {
		e.preventDefault()

		const identifier = identifierType === 'email' ? emailInput : uidInput

		if (!identifier.trim()) {
			toast.error(
				`Please enter ${identifierType === 'email' ? 'an email address' : 'a User ID'}`
			)
			return
		}

		// Basic email validation if email is provided
		if (identifierType === 'email') {
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
			if (!emailRegex.test(emailInput.trim())) {
				toast.error('Please enter a valid email address')
				return
			}
		}

		setIsVerifying(true)
		try {
			const requestData =
				identifierType === 'email'
					? { email: emailInput.trim() }
					: { uid: uidInput.trim() }

			const result = await verifyUserEmailViaFunction(requestData)

			if (result.success) {
				toast.success(result.message)
				// Clear form
				setEmailInput('')
				setUidInput('')
			}
		} catch (error: unknown) {
			console.error('Error verifying user email:', error)

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

			{/* Verify Email Card */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<CheckCircle className='h-5 w-5 text-green-600' />
						Verify User Email Address
					</CardTitle>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleVerifyEmail} className='space-y-4'>
						<div className='space-y-2'>
							<Label>Identifier Type</Label>
							<RadioGroup
								value={identifierType}
								onValueChange={(value) =>
									setIdentifierType(value as 'email' | 'uid')
								}
								disabled={isVerifying}
							>
								<div className='flex items-center space-x-2'>
									<RadioGroupItem value='email' id='email' />
									<Label htmlFor='email' className='font-normal cursor-pointer'>
										Email Address
									</Label>
								</div>
								<div className='flex items-center space-x-2'>
									<RadioGroupItem value='uid' id='uid' />
									<Label htmlFor='uid' className='font-normal cursor-pointer'>
										User ID (UID)
									</Label>
								</div>
							</RadioGroup>
						</div>

						{identifierType === 'email' ? (
							<div className='space-y-2'>
								<Label htmlFor='emailInput'>Email Address</Label>
								<Input
									id='emailInput'
									type='email'
									placeholder='user@example.com'
									value={emailInput}
									onChange={(e) => setEmailInput(e.target.value)}
									disabled={isVerifying}
								/>
								<p className='text-sm text-muted-foreground'>
									The email address of the user whose email you want to verify.
								</p>
							</div>
						) : (
							<div className='space-y-2'>
								<Label htmlFor='uidInput'>User ID (UID)</Label>
								<Input
									id='uidInput'
									type='text'
									placeholder='Enter the Firebase Authentication User ID'
									value={uidInput}
									onChange={(e) => setUidInput(e.target.value)}
									disabled={isVerifying}
								/>
								<p className='text-sm text-muted-foreground'>
									The Firebase Authentication UID of the user whose email you
									want to verify.
								</p>
							</div>
						)}

						<Button type='submit' disabled={isVerifying} className='w-full'>
							<Mail className='h-4 w-4 mr-2' />
							{isVerifying ? 'Verifying Email...' : 'Verify Email Address'}
						</Button>
					</form>

					<div className='mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md'>
						<div className='flex gap-2'>
							<AlertTriangle className='h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5' />
							<div className='space-y-2'>
								<p className='text-sm font-semibold text-blue-800'>
									Important Notes:
								</p>
								<ul className='text-sm text-blue-700 space-y-1 list-disc list-inside'>
									<li>
										This action will mark the user's email as verified in
										Firebase Authentication.
									</li>
									<li>
										You can search by either email address or User ID (Firebase
										Auth UID).
									</li>
									<li>
										If the email is already verified, this operation will
										complete successfully without making changes.
									</li>
									<li>
										The user will not receive any notification about this
										change.
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
