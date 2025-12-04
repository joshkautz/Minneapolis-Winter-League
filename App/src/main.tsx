import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './globals.css'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from './components/ui/sonner.tsx'
import { ProvidersWrapper } from '@/providers'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

ReactDOM.createRoot(rootElement).render(
	<ProvidersWrapper>
		<BrowserRouter>
			<App />
			<Toaster />
		</BrowserRouter>
	</ProvidersWrapper>
)
