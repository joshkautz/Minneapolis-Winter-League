import { Toaster as Sonner, ToasterProps } from 'sonner'
import { useThemeContext } from '@/providers/theme-context'

const Toaster = ({ ...props }: ToasterProps) => {
	// The app's own theme; next-themes was never set up here, so toasts
	// used to follow the OS whatever the player chose.
	const { resolvedTheme } = useThemeContext()

	return (
		<Sonner
			theme={resolvedTheme}
			className='toaster group'
			closeButton={false}
			expand={true}
			richColors={true}
			duration={4000}
			position='bottom-center'
			toastOptions={{
				style: {
					background: 'hsl(var(--card))',
					color: 'hsl(var(--card-foreground))',
					border: '1px solid hsl(var(--border))',
				},
			}}
			{...props}
		/>
	)
}

export { Toaster }
