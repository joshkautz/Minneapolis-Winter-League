/**
 * Site Settings Admin Page
 *
 * Allows administrators to configure site-wide settings like theme variants.
 */

import { useEffect, useState } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument } from 'react-firebase-hooks/firestore'
import { doc, setDoc } from 'firebase/firestore'
import { toast } from 'sonner'
import { Heart, Palette, Shield, Snowflake } from 'lucide-react'

import { auth } from '@/firebase/auth'
import { firestore } from '@/firebase/app'
import { getPlayerRef } from '@/firebase/collections/players'
import { getSiteSettingsRef } from '@/firebase/collections/site-settings'
import { Collections, ThemeVariant } from '@/types'
import { logger } from '@/shared/utils'
import { PageContainer, PageHeader } from '@/shared/components'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'

export const SiteSettings = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading] = useDocument(playerRef)
	const [settingsSnapshot, settingsLoading] = useDocument(getSiteSettingsRef())

	const [isUpdating, setIsUpdating] = useState(false)

	const isAdmin = playerSnapshot?.data()?.admin || false
	const currentVariant: ThemeVariant = settingsSnapshot?.data()?.themeVariant ?? 'default'
	const isValentine = currentVariant === 'valentine'

	const handleToggleValentine = async (checked: boolean) => {
		setIsUpdating(true)
		try {
			const newVariant: ThemeVariant = checked ? 'valentine' : 'default'
			await setDoc(
				doc(firestore, Collections.SITE_SETTINGS, 'theme'),
				{ themeVariant: newVariant },
				{ merge: true }
			)
			toast.success(
				checked
					? 'Valentine theme activated!'
					: 'Default theme restored'
			)
		} catch (error) {
			logger.error('Failed to update theme variant:', error)
			toast.error('Failed to update theme', {
				description: 'Please try again later.',
			})
		} finally {
			setIsUpdating(false)
		}
	}

	// Log errors
	useEffect(() => {
		// Placeholder for future error handling
	}, [])

	// Handle loading state
	if (playerLoading || settingsLoading) {
		return (
			<PageContainer withSpacing withGap>
				<PageHeader
					title='Site Settings'
					description='Configure site-wide settings and theme variants'
					icon={Palette}
				/>
				<Card>
					<CardHeader>
						<Skeleton className='h-6 w-48' />
						<Skeleton className='h-4 w-64' />
					</CardHeader>
					<CardContent>
						<Skeleton className='h-10 w-full' />
					</CardContent>
				</Card>
			</PageContainer>
		)
	}

	// Handle non-admin users
	if (!isAdmin) {
		return (
			<PageContainer withSpacing withGap>
				<PageHeader
					title='Site Settings'
					description='Configure site-wide settings and theme variants'
					icon={Palette}
				/>
				<Card>
					<CardContent className='p-6 text-center'>
						<div className='flex items-center justify-center gap-2 text-destructive mb-4'>
							<Shield className='h-6 w-6' />
							<h2 className='text-xl font-semibold'>Access Denied</h2>
						</div>
						<p className='text-muted-foreground'>
							You don't have permission to access site settings.
						</p>
					</CardContent>
				</Card>
			</PageContainer>
		)
	}

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title='Site Settings'
				description='Configure site-wide settings and theme variants'
				icon={Palette}
			/>

			<Alert>
				<Palette className='h-4 w-4' />
				<AlertDescription>
					Changes to site settings affect all users immediately.
				</AlertDescription>
			</Alert>

			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Heart className='h-5 w-5 text-pink-500' />
						Theme Variant
					</CardTitle>
					<CardDescription>
						Enable seasonal theme variants to change the site's color scheme for all users.
					</CardDescription>
				</CardHeader>
				<CardContent className='space-y-6'>
					<div className='flex items-center justify-between rounded-lg border p-4'>
						<div className='space-y-1'>
							<Label
								htmlFor='valentine-toggle'
								className='text-base font-medium flex items-center gap-2'
							>
								{isValentine ? (
									<Heart className='h-4 w-4 text-pink-500' />
								) : (
									<Snowflake className='h-4 w-4 text-sky-500' />
								)}
								Valentine's Day Theme
							</Label>
							<p className='text-sm text-muted-foreground'>
								{isValentine
									? 'Pink and rose colors are active across the site.'
									: 'Enable to switch from blue to pink/rose colors.'}
							</p>
						</div>
						<Switch
							id='valentine-toggle'
							checked={isValentine}
							onCheckedChange={handleToggleValentine}
							disabled={isUpdating}
							aria-label='Toggle Valentine theme'
						/>
					</div>

					<div className='rounded-lg border p-4 bg-muted/50'>
						<h4 className='text-sm font-medium mb-2'>Preview</h4>
						<div className='flex gap-4'>
							<div className='flex flex-col items-center gap-1'>
								<div className='w-12 h-12 rounded-lg bg-accent' />
								<span className='text-xs text-muted-foreground'>Accent</span>
							</div>
							<div className='flex flex-col items-center gap-1'>
								<div className='w-12 h-12 rounded-lg bg-primary' />
								<span className='text-xs text-muted-foreground'>Primary</span>
							</div>
							<div className='flex flex-col items-center gap-1'>
								<div className='w-12 h-12 rounded-lg border-2 border-ring' />
								<span className='text-xs text-muted-foreground'>Ring</span>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</PageContainer>
	)
}
