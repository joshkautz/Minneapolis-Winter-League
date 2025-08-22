import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './globals.css'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from './components/ui/sonner.tsx'
import { 
	ThemeProvider,
	AuthContextProvider,
	SeasonsContextProvider,
	TeamsContextProvider,
	GamesContextProvider,
	OffersContextProvider
} from '@/providers'

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
