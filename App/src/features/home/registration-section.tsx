/**
 * RegistrationSection Component
 *
 * Contains the "How to Register" section with step-by-step instructions
 * and the field map image. Extracted from main Home component.
 */
export const RegistrationSection = () => {
	return (
		<div
			className={
				'border border-transparent xl:max-w-none container dark:text-foreground dark:bg-background text-background bg-foreground'
			}
		>
			<section
				id='how-to-register'
				className={
					'my-32 flex justify-center md:items-stretch gap-8 flex-col md:flex-row items-center'
				}
			>
				<div className='flex items-center justify-center flex-1 rounded-lg overflow-clip bg-primary dark:bg-secondary max-w-[500px]'>
					<img
						src='/Map.png'
						alt='University of Minnesota URW Sports Field Complex Map'
					/>
				</div>
				<div className='flex flex-col flex-1 gap-2 my-auto max-w-[500px]'>
					<p className='pb-2 text-2xl font-bold'>How to Register</p>
					<div className={'w-full flex'}>
						<span
							className={
								'bg-accent text-foreground dark:text-background flex shrink-0 w-4 h-4 mt-2 mr-2 text-xs items-center justify-center font-bold rounded-full -translate-y-0.5'
							}
						>
							1
						</span>
						<p>{`Click on the "Log In" button to Log In or Sign Up.`}</p>
					</div>
					<div className={'w-full flex'}>
						<span
							className={
								'bg-accent text-foreground dark:text-background flex shrink-0 w-4 h-4 mt-2 mr-2 text-xs items-center justify-center font-bold rounded-full -translate-y-0.5'
							}
						>
							2
						</span>
						<p>
							{`Verify your email address by clicking the link in the email you receive.`}
						</p>
					</div>
					<div className={'w-full flex'}>
						<span
							className={
								'bg-accent text-foreground dark:text-background flex shrink-0 w-4 h-4 mt-2 mr-2 text-xs items-center justify-center font-bold rounded-full -translate-y-0.5'
							}
						>
							3
						</span>
						<p>
							{`Visit your profile to submit secure electronic payment via Stripe.`}
						</p>
					</div>
					<div className={'w-full flex'}>
						<span
							className={
								'bg-accent text-foreground dark:text-background flex shrink-0 w-4 h-4 mt-2 mr-2 text-xs items-center justify-center font-bold rounded-full -translate-y-0.5'
							}
						>
							4
						</span>
						<p>
							{`Electronically sign your Waiver of Liability that is emailed to you after paying.`}
						</p>
					</div>
					<div className={'w-full flex'}>
						<span
							className={
								'bg-accent text-foreground dark:text-background flex shrink-0 w-4 h-4 mt-2 mr-2 text-xs items-center justify-center font-bold rounded-full -translate-y-0.5'
							}
						>
							5
						</span>
						<p>
							{`Request to join an existing team, accept an invitation, or create your own team.`}
						</p>
					</div>
					<div className={'w-full flex'}>
						<span
							className={
								'bg-accent text-foreground dark:text-background flex shrink-0 w-4 h-4 mt-2 mr-2 text-xs items-center justify-center font-bold rounded-full -translate-y-0.5'
							}
						>
							6
						</span>
						<p>{`Receive confirmation and league updates via email.`}</p>
					</div>
				</div>
			</section>

			<div
				className={
					'flex flex-col gap-2 pb-8 items-center max-w-[1040px] mx-auto'
				}
			>
				<p className={'text-2xl max-w-[1040px] mx-auto'}>
					{`Don't miss out on this opportunity to keep playing year-round. Secure your spot today, and let's make this season of Minneapolis Winter League one to remember!`}
				</p>
			</div>

			<div className='max-w-[1040px] mx-auto flex items-center justify-start pb-24'>
				<p className='text-2xl font-bold'>See you on the field!</p>
			</div>
		</div>
	)
}
