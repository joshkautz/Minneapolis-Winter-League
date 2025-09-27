'use client'

import { useTheme } from 'next-themes'
import { Toaster as Sonner, ToasterProps } from 'sonner'

const Toaster = ({ ...props }: ToasterProps) => {
	const { theme = 'system' } = useTheme()

	return (
		<Sonner
			theme={theme as ToasterProps['theme']}
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
