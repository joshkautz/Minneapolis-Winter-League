import { useSeasonsContext } from '@/providers'
import {
	formatDollars,
	MIN_SIGNED_PLAYERS,
	usesTeamPayments,
} from '@/shared/utils'

/**
 * The steps to register, in the order they happen. A waiver is emailed when
 * a player joins a team, so joining comes before signing; what paying means
 * depends on whether the season is paid per player or per team.
 */
const registrationSteps = (teamTotalCents: number | undefined): string[] => [
	'Click on the "Log In" button to Log In or Sign Up.',
	'Verify your email address by clicking the link in the email you receive.',
	'Request to join an existing team, accept an invitation, or create your own team.',
	'Electronically sign your Waiver of Liability, which is emailed to you when you join a team.',
	teamTotalCents === undefined
		? 'Visit your profile to submit secure electronic payment via Stripe.'
		: `Chip in toward your team's ${formatDollars(teamTotalCents)} from My Team, split however your team likes. Your team registers once ${MIN_SIGNED_PLAYERS} players have signed and the total is committed.`,
	'Receive confirmation and league updates via email.',
]

/**
 * RegistrationSection Component
 *
 * Contains the "How to Register" section with step-by-step instructions
 * and the field map image. Extracted from main Home component.
 */
export const RegistrationSection = () => {
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()
	const season = currentSeasonQueryDocumentSnapshot?.data()
	const steps = registrationSteps(
		usesTeamPayments(season) ? season.teamRegistrationTotalCents : undefined
	)

	return (
		<div
			className={
				'border border-transparent xl:max-w-none container text-section-invert-foreground bg-section-invert'
			}
		>
			<section
				id='how-to-register'
				className={
					'my-20 flex justify-center md:items-stretch gap-8 flex-col md:flex-row items-center'
				}
			>
				<div className='group flex items-center justify-center flex-1 rounded-lg overflow-hidden bg-section-invert/80 max-w-[500px] cursor-pointer'>
					<img
						src='/Map.png'
						alt='University of Minnesota URW Sports Field Complex Map'
						className='transition-transform duration-300 group-hover:scale-105'
					/>
				</div>
				<div className='flex flex-col flex-1 gap-2 my-auto max-w-[500px]'>
					<p className='pb-2 text-2xl font-bold'>How to Register</p>
					{steps.map((step, index) => (
						<div key={step} className={'w-full flex'}>
							<span
								className={
									'bg-accent text-accent-foreground flex shrink-0 w-4 h-4 mt-2 mr-2 text-xs items-center justify-center font-bold rounded-full -translate-y-0.5'
								}
							>
								{index + 1}
							</span>
							<p>{step}</p>
						</div>
					))}
				</div>
			</section>
		</div>
	)
}
