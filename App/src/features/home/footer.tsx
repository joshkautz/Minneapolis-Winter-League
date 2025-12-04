export const Footer = () => {
	return (
		<footer className='bg-muted/30 border-t border-border mt-20'>
			<div className='container mx-auto px-6 py-16'>
				<div className='flex items-center justify-start mb-12'>
					<img
						src={'/mpls-logo.png'}
						alt='Minneapolis Winter League Logo'
						className='w-full h-auto max-w-[573px]'
					/>
				</div>
				{/* Main Footer Content */}
				<div className='grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16 mb-12'>
					{/* Contact Info */}
					<div className='space-y-6 text-center'>
						<h3 className='text-lg font-semibold text-foreground'>Contact</h3>
						<a
							href='mailto:leadership@mplsmallard.com'
							className='inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200'
							aria-label='Send email to Minneapolis Winter League leadership'
						>
							<svg
								className='w-4 h-4 mr-3'
								fill='none'
								stroke='currentColor'
								viewBox='0 0 24 24'
								aria-hidden='true'
							>
								<path
									strokeLinecap='round'
									strokeLinejoin='round'
									strokeWidth={2}
									d='M3 8l7.89 7.89a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'
								/>
							</svg>
							leadership@mplsmallard.com
						</a>
					</div>

					{/* Partners */}
					<div className='space-y-6 text-center'>
						<h3 className='text-lg font-semibold text-foreground'>
							Our Partners
						</h3>
						<div className='flex items-center justify-center gap-6'>
							<a
								href='http://mplsmallard.com/'
								target='_blank'
								rel='noopener noreferrer'
								className='inline-block transition-transform duration-200 hover:scale-105 focus:scale-105 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded'
								aria-label='Visit Minneapolis Mallard website'
							>
								<img
									src='/mallard.png'
									alt='Minneapolis Mallard logo'
									width={80}
									height={80}
									className='w-20 h-auto'
								/>
							</a>

							<a
								href='https://lostyetidesign.com/'
								target='_blank'
								rel='noopener noreferrer'
								className='inline-block transition-transform duration-200 hover:scale-105 focus:scale-105 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded'
								aria-label='Visit Lost Yeti Design Company website'
							>
								<img
									src='/lost-yeti.png'
									alt='Lost Yeti Design Company logo'
									width={120}
									height={40}
									className='w-30 h-auto max-w-[120px]'
								/>
							</a>
						</div>
					</div>
				</div>

				{/* Footer Bottom */}
				<div className='pt-8 border-t border-border'>
					<div className='flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0'>
						<p className='text-xs text-muted-foreground'>
							© {new Date().getFullYear()} Minneapolis Winter League. All
							rights reserved.
						</p>
						<div className='flex space-x-8'>
							<a
								href='/privacy'
								className='text-xs text-muted-foreground hover:text-foreground transition-colors duration-200'
								aria-label='Privacy Policy'
							>
								Privacy Policy
							</a>
							<a
								href='/terms'
								className='text-xs text-muted-foreground hover:text-foreground transition-colors duration-200'
								aria-label='Terms of Service'
							>
								Terms of Service
							</a>
						</div>
					</div>
				</div>
			</div>
		</footer>
	)
}
