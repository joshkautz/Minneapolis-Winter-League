/**
 * Site Settings Admin Page
 *
 * Allows administrators to configure site-wide settings like theme variants.
 */

import { useState } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument } from 'react-firebase-hooks/firestore'
import { toast } from 'sonner'
import { Heart, Palette, Shield, Snowflake, LucideIcon } from 'lucide-react'

import { auth } from '@/firebase/auth'
import { getPlayerRef } from '@/firebase/collections/players'
import { getSiteSettingsRef } from '@/firebase/collections/site-settings'
import { updateSiteSettingsViaFunction } from '@/firebase/collections/functions'
import { ThemeVariant } from '@/types'
import { logger } from '@/shared/utils'
import { PageContainer, PageHeader } from '@/shared/components'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Theme configuration - add new themes here
 * Each theme needs: id, label, description, icon, and iconColor
 */
interface ThemeOption {
	id: ThemeVariant
	label: string
	description: string
	icon: LucideIcon
	iconColor: string
}

const THEME_OPTIONS: ThemeOption[] = [
	{
		id: 'default',
		label: 'Default (Winter)',
		description: 'Blue and sky colors with falling snow particles',
		icon: Snowflake,
		iconColor: 'text-sky-500',
	},
	{
		id: 'valentine',
		label: "Valentine's Day",
		description: 'Pink and rose colors with floating heart particles',
		icon: Heart,
		iconColor: 'text-pink-500',
	},
]

export const SiteSettings = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading] = useDocument(playerRef)
	const [settingsSnapshot, settingsLoading] = useDocument(getSiteSettingsRef())

	const [isUpdating, setIsUpdating] = useState(false)

	const isAdmin = playerSnapshot?.data()?.admin || false
	const currentVariant: ThemeVariant =
		settingsSnapshot?.data()?.themeVariant ?? 'default'

	const handleThemeChange = async (value: string) => {
		const newVariant = value as ThemeVariant
		if (newVariant === currentVariant) return

		setIsUpdating(true)
		try {
			await updateSiteSettingsViaFunction({ themeVariant: newVariant })
			const selectedTheme = THEME_OPTIONS.find((t) => t.id === newVariant)
			toast.success(`${selectedTheme?.label ?? 'Theme'} activated!`)
		} catch (error) {
			logger.error('Failed to update theme variant:', error)
			toast.error('Failed to update theme', {
				description: 'Please try again later.',
			})
		} finally {
			setIsUpdating(false)
		}
	}

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
						<Palette className='h-5 w-5' />
						Theme Variant
					</CardTitle>
					<CardDescription>
						Select a theme to change the site's color scheme and particle
						effects for all users.
					</CardDescription>
				</CardHeader>
				<CardContent className='space-y-6'>
					<RadioGroup
						value={currentVariant}
						onValueChange={handleThemeChange}
						disabled={isUpdating}
						className='space-y-3'
						aria-label='Select theme variant'
					>
						{THEME_OPTIONS.map((theme) => {
							const Icon = theme.icon
							const isSelected = currentVariant === theme.id
							return (
								<label
									key={theme.id}
									htmlFor={`theme-${theme.id}`}
									className={`flex items-center gap-4 rounded-lg border p-4 cursor-pointer transition-colors hover:bg-muted/50 ${
										isSelected ? 'border-primary bg-muted/50' : ''
									} ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}
								>
									<RadioGroupItem
										value={theme.id}
										id={`theme-${theme.id}`}
										disabled={isUpdating}
									/>
									<Icon className={`h-5 w-5 ${theme.iconColor}`} />
									<div className='flex-1 space-y-1'>
										<Label
											htmlFor={`theme-${theme.id}`}
											className='text-base font-medium cursor-pointer'
										>
											{theme.label}
										</Label>
										<p className='text-sm text-muted-foreground'>
											{theme.description}
										</p>
									</div>
								</label>
							)
						})}
					</RadioGroup>

					<div className='rounded-lg border p-4 bg-muted/50'>
						<h4 className='text-sm font-medium mb-3'>Current Theme Preview</h4>
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
