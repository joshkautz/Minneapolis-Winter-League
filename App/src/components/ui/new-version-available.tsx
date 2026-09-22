/**
 * Shown when a tab is running against a deployment that no longer exists.
 *
 * This is not an error the reader did anything to cause, so it does not read
 * like one: no red, no warning triangle, no error text. It says what happened
 * and gives them the one button that fixes it.
 */

import { Button } from './button'
import { RefreshCw } from 'lucide-react'

const handleReload = () => {
	window.location.reload()
}

export const NewVersionAvailable = () => {
	return (
		<div className='container mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-12 text-center'>
			<img
				src='/winter-duck.png'
				alt=''
				aria-hidden='true'
				className='mb-6 h-auto w-[110px] md:w-[150px]'
			/>

			<h1 className='text-balance text-2xl font-semibold tracking-tight'>
				There&rsquo;s a newer version of the site
			</h1>

			<p className='text-muted-foreground mt-3 text-balance'>
				This page has been open since before we updated the site. Refresh to
				pick up the latest version &mdash; it only takes a second.
			</p>

			<Button onClick={handleReload} size='lg' className='mt-8 gap-2'>
				<RefreshCw className='h-4 w-4' />
				Refresh the page
			</Button>
		</div>
	)
}
