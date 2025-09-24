import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './globals.css'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from './components/ui/sonner.tsx'
import { ProvidersWrapper } from '@/providers'

ReactDOM.createRoot(document.getElementById('root')!).render(
	<ProvidersWrapper>
		<BrowserRouter>
			<App />
			<Toaster />
		</BrowserRouter>
	</ProvidersWrapper>
)
