export const Footer = () => {
	return (
		<footer className='flex flex-col items-center justify-center h-full py-8 space-y-28 md:space-y-8 dark:bg-foreground dark:text-background bg-background text-foreground'>
			<div className='container flex flex-col items-center justify-between md:items-end md:flex-row'>
				<div className='pb-8 md:pb-0'>
					<img className='w-[324px]' src={'/footer-logo.png'} />
				</div>
				<div className='space-y-2 max-w-[300px] flex flex-col w-full items-start'>
					<p className='text-2xl font-bold'>Contact Us</p>
					<div className='flex flex-col text-lg md:flex-row md:space-x-1'>
						<p className='font-bold'>Email:</p>
						<a href='mailto:leadership@mplsmallard.com'>
							<span>Leadership@mplsmallard.com</span>
						</a>
					</div>
				</div>
			</div>

			<div className='container flex flex-col items-center justify-between md:items-end md:flex-row space-y-14 md:space-y-0'>
				<div className='flex flex-col items-center space-y-4 max-w-[300px]'>
					<p className='text-lg'>
						Thank you for helping to make this league possible!
					</p>

					<div className='flex flex-row justify-center space-x-8'>
						<div>
							<a
								href='http://mplsmallard.com/'
								target='_blank'
								title='Minneapolis Mallard'
								rel='noreferrer'
							>
								<img
									src={'/mallard.png'}
									alt='Minneapolis Mallard'
									width={80}
								/>
							</a>
						</div>
					</div>
				</div>

				<div>
					<a
						href='https://lostyetidesign.com/'
						target='_blank'
						title='Lost Yeti Design Company'
						rel='noreferrer'
					>
						<img
							src='/lost-yeti.png'
							alt='Lost Yeti Design Company'
							width={296}
						/>
					</a>
				</div>
			</div>
		</footer>
	)
}
