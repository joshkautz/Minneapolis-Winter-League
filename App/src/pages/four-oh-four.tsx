import React from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

/**
 * 404 Not Found page component
 *
 * Displays a user-friendly error page when a route is not found.
 */
export const FourOhFour: React.FC = () => {
	return (
		<div className='flex flex-col items-center justify-center min-h-screen gap-12 p-4 sm:justify-start sm:p-16'>
			<div
				className={`w-full basis-[320px] rounded-lg justify-center items-center flex max-w-[640px] bg-[url('/hhholographic.webp')]`}
			>
				<div className='font-extrabold text-black text-8xl'>404</div>
			</div>
			<div className='max-w-[400px] flex-col flex gap-4 mx-auto items-center sm:items-start px-4 sm:p-0'>
				<p className='text-2xl font-bold'>
					We could not find the page you are looking for.
				</p>

				<p className='max-w-[380px]'>
					If you think something is wrong, send us a message at{' '}
					<a href='mailto:leadership@mplsmallard.com'>
						<u>leadership@mplsmallard.com</u>
					</a>
				</p>
				<Link className='mt-4' to={'/'}>
					<Button variant={'outline'}>Return to Home</Button>
				</Link>
			</div>
		</div>
	)
}
