import { PersonIcon, SketchLogoIcon } from '@radix-ui/react-icons'
import { Snowflake } from './snowflake'

/**
 * WhyJoinSection Component
 *
 * Displays the "Why Join?" section with benefits like friends and competition.
 * Extracted from main Home component for better organization.
 */
export const WhyJoinSection = () => {
	return (
		<div className='border border-transparent bg-background'>
			<section
				id='why-join'
				className={
					'relative bg-accent text-accent-foreground min-h-[600px] rounded-2xl max-w-[968px] mx-auto -mt-20 p-8 lg:py-16 lg:px-0'
				}
			>
				<div className={'flex flex-col gap-8 max-w-[800px] mx-auto'}>
					<div className={'text-4xl font-bold '}>Why Join?</div>
					<div className={'flex flex-row gap-4'}>
						<div>
							<PersonIcon className={'w-8 h-8'} />
						</div>
						<div className={'flex flex-col gap-2'}>
							<div className={'text-2xl font-bold'}>Friends</div>
							<p>
								Form your own team with friends, or join as an individual, and
								experience the camaraderie of sportsmanship against a variety of
								players in the area.
							</p>
						</div>
					</div>

					<div className={'flex flex-row gap-4'}>
						<div>
							<SketchLogoIcon className={'w-8 h-8'} />
						</div>
						<div className={'flex flex-col gap-2'}>
							<div className={'text-2xl font-bold'}>Competition</div>
							<div>
								The league is open to all skill levels, and is focused on making
								sure everyone has valuable opportunities during the winter
								months to continue playing, improving, and competing. Weekly
								play will be organized, avoiding rematches as best as possible,
								and results will be used to seed teams for the playoffs. At the
								end of the season, teams will compete to determine the league
								champion!
							</div>
						</div>
					</div>
					<div className={'mt-8 text-2xl font-light '}>
						{`Whether you're perfecting your throws, working on your defense, or
						just out to have a great time, `}
						<span className={'font-bold'}>
							Minneapolis Winter League is the place to be.
						</span>
					</div>
				</div>
				<div className='absolute right-0 invisible md:visible -bottom-52 2xl:-bottom-52 2xl:-right-32'>
					<Snowflake className='fill-accent-foreground max-w-[150px] 2xl:max-w-[300px]' />
				</div>
			</section>
		</div>
	)
}
