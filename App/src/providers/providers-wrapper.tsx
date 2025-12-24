import { ReactNode } from 'react'
import {
	ThemeProvider,
	AuthContextProvider,
	SeasonsContextProvider,
	TeamsContextProvider,
	GamesContextProvider,
	OffersContextProvider,
	BadgesContextProvider,
	SiteSettingsContextProvider,
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
			<SiteSettingsContextProvider>
				<AuthContextProvider>
					<SeasonsContextProvider>
						<TeamsContextProvider>
							<GamesContextProvider>
								<OffersContextProvider>
									<BadgesContextProvider>{children}</BadgesContextProvider>
								</OffersContextProvider>
							</GamesContextProvider>
						</TeamsContextProvider>
					</SeasonsContextProvider>
				</AuthContextProvider>
			</SiteSettingsContextProvider>
		</ThemeProvider>
	)
}
