/**
 * Site Settings Admin Page
 *
 * Allows administrators to configure site-wide settings like theme variants.
 */

import { useState, useEffect } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument } from 'react-firebase-hooks/firestore'
import { toast } from 'sonner'
import {
	Heart,
	Palette,
	Shield,
	Snowflake,
	Sun,
	Moon,
	LucideIcon,
} from 'lucide-react'

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
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip'

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

/**
 * Theme color configuration
 * Colors with foreground pairs for demonstrating text contrast
 */
interface ThemeColor {
	name: string
	label: string
	bgVar: string
	fgVar?: string
	description: string
}

const THEME_COLORS: ThemeColor[] = [
	{
		name: 'background',
		label: 'Background',
		bgVar: '--background',
		fgVar: '--foreground',
		description: 'Main page background',
	},
	{
		name: 'primary',
		label: 'Primary',
		bgVar: '--primary',
		fgVar: '--primary-foreground',
		description: 'Primary actions and buttons',
	},
	{
		name: 'secondary',
		label: 'Secondary',
		bgVar: '--secondary',
		fgVar: '--secondary-foreground',
		description: 'Secondary UI elements',
	},
	{
		name: 'accent',
		label: 'Accent',
		bgVar: '--accent',
		fgVar: '--accent-foreground',
		description: 'Hover and highlight states',
	},
	{
		name: 'muted',
		label: 'Muted',
		bgVar: '--muted',
		fgVar: '--muted-foreground',
		description: 'Subtle and disabled elements',
	},
	{
		name: 'destructive',
		label: 'Destructive',
		bgVar: '--destructive',
		fgVar: '--destructive-foreground',
		description: 'Error and delete actions',
	},
	{
		name: 'warning',
		label: 'Warning',
		bgVar: '--warning',
		fgVar: '--warning-foreground',
		description: 'Warning states',
	},
	{
		name: 'card',
		label: 'Card',
		bgVar: '--card',
		fgVar: '--card-foreground',
		description: 'Card backgrounds',
	},
	{
		name: 'popover',
		label: 'Popover',
		bgVar: '--popover',
		fgVar: '--popover-foreground',
		description: 'Dropdown and tooltip backgrounds',
	},
	{
		name: 'section-invert',
		label: 'Section Invert',
		bgVar: '--section-invert',
		fgVar: '--section-invert-foreground',
		description: 'Inverted section backgrounds',
	},
]

const UTILITY_COLORS: ThemeColor[] = [
	{
		name: 'border',
		label: 'Border',
		bgVar: '--border',
		description: 'Border color',
	},
	{
		name: 'input',
		label: 'Input',
		bgVar: '--input',
		description: 'Input field borders',
	},
	{
		name: 'ring',
		label: 'Ring',
		bgVar: '--ring',
		description: 'Focus ring color',
	},
]

/**
 * Hardcoded theme color values from globals.css
 * This ensures accurate color display regardless of the current page theme
 */
type ThemeMode = 'light' | 'dark'
type ColorMap = Record<string, string>

const THEME_COLOR_VALUES: Record<ThemeVariant, Record<ThemeMode, ColorMap>> = {
	default: {
		light: {
			'--background': '210 40% 98%',
			'--foreground': '216 100% 11%',
			'--primary': '216 100% 11%',
			'--primary-foreground': '210 40% 98%',
			'--secondary': '210 40% 96.1%',
			'--secondary-foreground': '222.2 47.4% 11.2%',
			'--accent': '196 91% 74%',
			'--accent-foreground': '222.2 47.4% 11.2%',
			'--muted': '210 40% 96.1%',
			'--muted-foreground': '215.4 16.3% 46.9%',
			'--destructive': '0 84.2% 60.2%',
			'--destructive-foreground': '210 40% 98%',
			'--warning': '38 92% 50%',
			'--warning-foreground': '48 96% 89%',
			'--card': '0 0% 100%',
			'--card-foreground': '216 100% 11%',
			'--popover': '0 0% 100%',
			'--popover-foreground': '216 100% 11%',
			'--section-invert': '216 100% 11%',
			'--section-invert-foreground': '210 40% 98%',
			'--border': '214.3 31.8% 91.4%',
			'--input': '214.3 31.8% 91.4%',
			'--ring': '221.2 83.2% 53.3%',
		},
		dark: {
			'--background': '216 100% 11%',
			'--foreground': '210 40% 98%',
			'--primary': '196 91% 74%',
			'--primary-foreground': '222.2 47.4% 11.2%',
			'--secondary': '214 57.6% 15.6%',
			'--secondary-foreground': '210 40% 98%',
			'--accent': '196 91% 74%',
			'--accent-foreground': '216 100% 11%',
			'--muted': '214 57.6% 15.6%',
			'--muted-foreground': '215 20.2% 65.1%',
			'--destructive': '0 62.8% 30.6%',
			'--destructive-foreground': '210 40% 98%',
			'--warning': '48 96% 89%',
			'--warning-foreground': '38 92% 50%',
			'--card': '216 100% 12%',
			'--card-foreground': '210 40% 98%',
			'--popover': '216 100% 12%',
			'--popover-foreground': '210 40% 98%',
			'--section-invert': '216 100% 11%',
			'--section-invert-foreground': '210 40% 98%',
			'--border': '217.2 32.6% 17.5%',
			'--input': '217.2 32.6% 17.5%',
			'--ring': '224.3 76.3% 48%',
		},
	},
	valentine: {
		light: {
			'--background': '340 40% 98%',
			'--foreground': '352 100% 28%',
			'--primary': '352 100% 28%',
			'--primary-foreground': '340 40% 98%',
			'--secondary': '340 40% 96.1%',
			'--secondary-foreground': '352 50% 15%',
			'--accent': '340 80% 84%',
			'--accent-foreground': '352 50% 15%',
			'--muted': '340 40% 96.1%',
			'--muted-foreground': '340 20% 47%',
			'--destructive': '0 84.2% 60.2%',
			'--destructive-foreground': '340 40% 98%',
			'--warning': '38 92% 50%',
			'--warning-foreground': '48 96% 89%',
			'--card': '0 0% 100%',
			'--card-foreground': '352 100% 28%',
			'--popover': '0 0% 100%',
			'--popover-foreground': '352 100% 28%',
			'--section-invert': '1 100% 11%',
			'--section-invert-foreground': '340 40% 98%',
			'--border': '340 30% 91.4%',
			'--input': '340 30% 91.4%',
			'--ring': '340 82% 55%',
		},
		dark: {
			'--background': '352 75% 12%',
			'--foreground': '340 35% 95%',
			'--primary': '340 65% 60%',
			'--primary-foreground': '352 45% 18%',
			'--secondary': '340 42% 16%',
			'--secondary-foreground': '340 35% 95%',
			'--accent': '340 78% 75%',
			'--accent-foreground': '352 75% 12%',
			'--muted': '340 42% 16%',
			'--muted-foreground': '340 22% 62%',
			'--destructive': '0 62.8% 30.6%',
			'--destructive-foreground': '340 35% 95%',
			'--warning': '48 96% 89%',
			'--warning-foreground': '38 92% 50%',
			'--card': '352 75% 13%',
			'--card-foreground': '340 35% 95%',
			'--popover': '352 75% 13%',
			'--popover-foreground': '340 35% 95%',
			'--section-invert': '1 100% 11%',
			'--section-invert-foreground': '340 40% 98%',
			'--border': '340 28% 18%',
			'--input': '340 28% 18%',
			'--ring': '340 60% 48%',
		},
	},
}

/**
 * Convert HSL string (e.g., "210 40% 98%") to hex color
 */
const hslToHex = (hslString: string): string => {
	const parts = hslString.trim().split(/\s+/)
	if (parts.length < 3) return '#000000'

	const h = parseFloat(parts[0]) / 360
	const s = parseFloat(parts[1].replace('%', '')) / 100
	const l = parseFloat(parts[2].replace('%', '')) / 100

	const hue2rgb = (p: number, q: number, t: number) => {
		if (t < 0) t += 1
		if (t > 1) t -= 1
		if (t < 1 / 6) return p + (q - p) * 6 * t
		if (t < 1 / 2) return q
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
		return p
	}

	let r, g, b
	if (s === 0) {
		r = g = b = l
	} else {
		const q = l < 0.5 ? l * (1 + s) : l + s - l * s
		const p = 2 * l - q
		r = hue2rgb(p, q, h + 1 / 3)
		g = hue2rgb(p, q, h)
		b = hue2rgb(p, q, h - 1 / 3)
	}

	const toHex = (c: number) => {
		const hex = Math.round(c * 255).toString(16)
		return hex.length === 1 ? '0' + hex : hex
	}

	return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

/**
 * Individual color swatch with tooltip showing hex color code
 */
const ColorSwatch = ({
	label,
	bgColor,
	bgHsl,
	fgColor,
	fgHsl,
	description,
}: {
	label: string
	bgColor: string
	bgHsl: string
	fgColor?: string
	fgHsl?: string
	description: string
}) => {
	const bgHex = hslToHex(bgHsl)
	const fgHex = fgHsl ? hslToHex(fgHsl) : undefined

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className='flex flex-col gap-1 cursor-pointer'>
					<div
						className='w-full h-14 rounded-lg flex items-center justify-center border shadow-sm transition-transform hover:scale-105'
						style={{ backgroundColor: bgColor }}
						role='img'
						aria-label={`${label}: ${description}`}
					>
						{fgColor && (
							<span className='text-xs font-medium' style={{ color: fgColor }}>
								Aa
							</span>
						)}
					</div>
					<span className='text-xs text-muted-foreground text-center truncate'>
						{label}
					</span>
				</div>
			</TooltipTrigger>
			<TooltipContent side='top' className='text-center'>
				<div className='font-medium'>{label}</div>
				<div className='text-xs opacity-90'>{description}</div>
				<div className='mt-1 pt-1 border-t border-primary-foreground/20'>
					<div className='font-mono text-xs'>
						BG: {bgHex}
						{fgHex && (
							<>
								<br />
								FG: {fgHex}
							</>
						)}
					</div>
				</div>
			</TooltipContent>
		</Tooltip>
	)
}

/**
 * Color palette card showing all theme colors for a specific mode
 * Uses hardcoded color values to ensure accurate display
 */
const ColorPaletteCard = ({
	mode,
	themeVariant,
}: {
	mode: 'light' | 'dark'
	themeVariant: ThemeVariant
}) => {
	// Get the color values for this theme and mode
	const colorValues = THEME_COLOR_VALUES[themeVariant][mode]

	// Helper to get HSL color string
	const getHsl = (varName: string) => colorValues[varName] || ''
	const getColor = (varName: string) => {
		const hsl = getHsl(varName)
		return hsl ? `hsl(${hsl})` : 'transparent'
	}

	return (
		<Card>
			<CardHeader className='pb-3'>
				<CardTitle className='flex items-center gap-2 text-base'>
					{mode === 'light' ? (
						<Sun className='h-4 w-4 text-amber-500' />
					) : (
						<Moon className='h-4 w-4 text-blue-500' />
					)}
					{mode === 'light' ? 'Light Mode' : 'Dark Mode'}
				</CardTitle>
			</CardHeader>
			<CardContent className='space-y-4'>
				{/* Main color swatches */}
				<div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3'>
					{THEME_COLORS.map((color) => (
						<ColorSwatch
							key={color.name}
							label={color.label}
							bgColor={getColor(color.bgVar)}
							bgHsl={getHsl(color.bgVar)}
							fgColor={color.fgVar ? getColor(color.fgVar) : undefined}
							fgHsl={color.fgVar ? getHsl(color.fgVar) : undefined}
							description={color.description}
						/>
					))}
				</div>

				<Separator />

				{/* Utility colors */}
				<div>
					<h5 className='text-xs font-medium text-muted-foreground mb-3'>
						Utility Colors
					</h5>
					<div className='grid grid-cols-3 gap-3'>
						{UTILITY_COLORS.map((color) => (
							<ColorSwatch
								key={color.name}
								label={color.label}
								bgColor={getColor(color.bgVar)}
								bgHsl={getHsl(color.bgVar)}
								description={color.description}
							/>
						))}
					</div>
				</div>
			</CardContent>
		</Card>
	)
}

export const SiteSettings = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading] = useDocument(playerRef)
	const [settingsSnapshot, settingsLoading] = useDocument(getSiteSettingsRef())

	const [isUpdating, setIsUpdating] = useState(false)
	const [previewVariant, setPreviewVariant] = useState<ThemeVariant>('default')

	const isAdmin = playerSnapshot?.data()?.admin || false
	const savedVariant: ThemeVariant =
		settingsSnapshot?.data()?.themeVariant ?? 'default'

	// Get the theme being previewed for display
	const previewedTheme = THEME_OPTIONS.find((t) => t.id === previewVariant)

	// Sync preview with saved value when Firebase data changes or on initial load
	useEffect(() => {
		setPreviewVariant(savedVariant)
	}, [savedVariant])

	// Apply the previewed theme (save to Firebase)
	const applyTheme = async () => {
		if (previewVariant === savedVariant) return

		setIsUpdating(true)
		try {
			await updateSiteSettingsViaFunction({ themeVariant: previewVariant })
			toast.success(`${previewedTheme?.label ?? 'Theme'} activated!`)
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
						Select a theme to preview its colors. Click "Apply Theme" to save
						your selection for all users.
					</CardDescription>
				</CardHeader>
				<CardContent className='space-y-6'>
					<RadioGroup
						value={previewVariant}
						onValueChange={(value) => setPreviewVariant(value as ThemeVariant)}
						disabled={isUpdating}
						className='space-y-3'
						aria-label='Select theme variant to preview'
					>
						{THEME_OPTIONS.map((theme) => {
							const Icon = theme.icon
							const isSelected = previewVariant === theme.id
							const isSaved = savedVariant === theme.id
							const showApplyButton = isSelected && !isSaved
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
									<Icon className={`h-5 w-5 shrink-0 ${theme.iconColor}`} />
									<div className='flex-1 min-w-0 space-y-1'>
										<Label
											htmlFor={`theme-${theme.id}`}
											className='text-base font-medium cursor-pointer'
										>
											{theme.label}
											{isSaved && (
												<span className='ml-2 text-xs font-normal text-muted-foreground'>
													(Current)
												</span>
											)}
										</Label>
										<p className='text-sm text-muted-foreground'>
											{theme.description}
										</p>
									</div>
									{showApplyButton && (
										<Button
											size='sm'
											onClick={(e) => {
												e.preventDefault()
												applyTheme()
											}}
											disabled={isUpdating}
											className='shrink-0'
										>
											{isUpdating ? 'Applying...' : 'Apply'}
										</Button>
									)}
								</label>
							)
						})}
					</RadioGroup>

					{/* Comprehensive Theme Color Palette */}
					<div className='space-y-4'>
						<h4 className='text-sm font-medium'>Theme Color Palette</h4>
						<div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
							<ColorPaletteCard mode='light' themeVariant={previewVariant} />
							<ColorPaletteCard mode='dark' themeVariant={previewVariant} />
						</div>
					</div>
				</CardContent>
			</Card>
		</PageContainer>
	)
}
