import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './globals.css'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from './components/ui/sonner.tsx'
import { ThemeProvider } from './components/theme-context.tsx'
import { AuthContextProvider } from '@/contexts/auth-context.tsx'
import { SeasonsContextProvider } from '@/contexts/seasons-context.tsx'
import { TeamsContextProvider } from '@/contexts/teams-context.tsx'
import { GamesContextProvider } from './contexts/games-context.tsx'
import { OffersContextProvider } from '@/contexts/offers-context.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
	<ThemeProvider>
		<AuthContextProvider>
			<SeasonsContextProvider>
				<TeamsContextProvider>
					<GamesContextProvider>
						<OffersContextProvider>
							<BrowserRouter>
								<App />
								<Toaster />
							</BrowserRouter>
						</OffersContextProvider>
					</GamesContextProvider>
				</TeamsContextProvider>
			</SeasonsContextProvider>
		</AuthContextProvider>
	</ThemeProvider>
)
