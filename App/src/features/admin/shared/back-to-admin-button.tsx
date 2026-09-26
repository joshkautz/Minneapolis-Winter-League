import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** The link every admin screen has back to the dashboard. */
export const BackToAdminButton = () => (
	<Button variant='outline' asChild>
		<Link to='/admin'>
			<ArrowLeft className='h-4 w-4 mr-2' />
			Back to Admin Dashboard
		</Link>
	</Button>
)
