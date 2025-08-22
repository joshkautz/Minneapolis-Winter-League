import { ReactNode } from 'react'
import { 
	ThemeProvider,
	AuthContextProvider,
	SeasonsContextProvider,
	TeamsContextProvider,
	GamesContextProvider,
	OffersContextProvider
} from '@/providers'

interface ProvidersWrapperProps {
	children: ReactNode
}

/**
 * ProvidersWrapper Component
 * 
 * Centralizes all context providers to reduce nesting in main.tsx
 * and improve maintainability of the provider hierarchy.
 */
export const ProvidersWrapper = ({ children }: ProvidersWrapperProps) => {
	return (
		<ThemeProvider>
			<AuthContextProvider>
				<SeasonsContextProvider>
					<TeamsContextProvider>
						<GamesContextProvider>
							<OffersContextProvider>
								{children}
							</OffersContextProvider>
						</GamesContextProvider>
					</TeamsContextProvider>
				</SeasonsContextProvider>
			</AuthContextProvider>
		</ThemeProvider>
	)
}
