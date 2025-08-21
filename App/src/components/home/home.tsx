import { PersonIcon, SketchLogoIcon } from '@radix-ui/react-icons'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from 'react-router-dom'
import { Snowflake } from './snowflake'

import { Footer } from './footer'
import { HeroSection } from './hero-section'

export const Home = () => {
	return (
		<div className={'w-full'}>
			<HeroSection />

			<div
				className={
					'w-full min-h-screen bg-background text-foreground dark:text-background dark:bg-foreground'
				}
			>
				<section id="league-details" className={'container pb-40'}>
					<div className="flex flex-row">
						<Snowflake className="-mt-32 max-w-[400px] flex-1 basis-[80px] shrink-0 fill-accent z-10 hidden lg:flex" />

						<div className={'flex flex-col flex-2 items-end gap-2 pt-24'}>
							<p className={'text-4xl font-bold max-w-[800px]'}>
								Our league is about community, growth, competition, and a whole
								lot of fun.
							</p>
							<div className="max-w-[800px] h-1 w-full flex items-start lg:justify-center justify-start">
								<div
									className={
										'mr-16 w-full max-w-[300px] lg:max-w-[475px] h-1 rounded bg-linear-to-r from-primary to-sky-300'
									}
								/>
							</div>
						</div>
					</div>
					<div className={'flex flex-wrap items-center gap-20 mt-32 w-full'}>
						<Card
							className={
								'flex flex-col flex-1 basis-[320px] shrink-0 rounded-2xl bg-foreground text-background dark:bg-background dark:text-foreground'
							}
						>
							<CardHeader>
								<CardTitle className={'text-2xl font-bold self-center'}>
									2025 Fall | Dates + Details
								</CardTitle>
							</CardHeader>
							<CardContent className={'flex flex-col gap-4'}>
								<div className={'flex'}>
									<p className={'w-16 mr-2 font-bold min-w-16'}>What:</p>
									<span>{`5v5 Open Ultimate on Artificial Grass Fields.`}</span>
								</div>
								<div className={'flex'}>
									<p className={'w-16 mr-2 font-bold min-w-16'}>When:</p>
									<span>{`Every Saturday, November 1st - December 20th.`}</span>
								</div>
								<div className={'flex'}>
									<p className={'w-16 mr-2 font-bold min-w-16'}>Where:</p>
									<span>
										<a
											href="https://maps.app.goo.gl/avAamyReCbGmz8jWA"
											target="_blank"
											rel="noreferrer"
										>
											<u>{`University of Minnesota | URW Sports Field Complex`}</u>
										</a>
									</span>
								</div>
								<div className={'flex'}>
									<p className={'w-16 mr-2 font-bold min-w-16'}>Skill:</p>
									<span>{`Open to all skill levels`}</span>
								</div>
								<div className={'flex'}>
									<p className={'w-16 mr-2 font-bold min-w-16'}>Games:</p>
									<span>{`Two 40-minute games every Saturday`}</span>
								</div>
								<div className={'flex'}>
									<p className={'w-16 mr-2 font-bold min-w-16'}>Cost:</p>
									<span>{`$100 for the 2025 Fall season. 7 weeks of games. 2 games a night.`}</span>
								</div>
								<div className={'flex'}>
									<p className={'w-16 mr-2 font-bold min-w-16'}>New!</p>
									<span>
										{`Certified athletic trainers present for all games! Waivers signed electronically! Additional dome time for warm-ups! League history! Ability to roll over teams from season to season!`}
									</span>
								</div>
							</CardContent>
						</Card>
						<div
							className={
								'flex flex-col flex-1 gap-12 p-8 basis-[320px] shrink-0'
							}
						>
							<div className={'flex flex-col gap-4'}>
								<p className={'text-2xl font-bold'}>Individuals</p>
								<p>
									{`If you're a solo player looking for a team, don't worry! Send some requests out to existing teams and see where you end up! We'll happily refund players who don't end up on a team.`}
									{` `}
									<Link to={'/#how-to-register'}>
										<u>Learn more about registration below.</u>
									</Link>
								</p>
							</div>
							<div className={'flex flex-col gap-4'}>
								<p className={'text-2xl font-bold'}>Teams</p>
								<p>
									Minneapolis Winter League has room for <b>12 teams.</b> Be
									sure to register your team before space fills up. There is a{' '}
									<b>10-player minimum</b> requirement for teams, with{' '}
									<u>no roster maximum.</u> The first twelve teams to meet this
									requirement of ten fully registered players will be
									successfully locked in. All other players have the option to:
								</p>
								<ul>
									<li>1. Request a roster spot on an existing team.</li>
									<li>
										2. Do nothing, and be fully refunded when the league starts.
									</li>
								</ul>
								<p>
									Visit the{' '}
									<Link to={'/teams'}>
										<u>Teams</u>
									</Link>{' '}
									page to see how many teams are currently fully registered.
								</p>
							</div>
						</div>
					</div>
				</section>
			</div>

			<div className="border border-transparent bg-foreground dark:bg-background">
				<section
					id="why-join"
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
									experience the camaraderie of sportsmanship against a variety
									of players in the area.
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
									The league is open to all skill levels, and is focused on
									making sure everyone has valuable opportunities during the
									winter months to continue playing, improving, and competing.
									Weekly play will be organized, avoiding rematches as best as
									possible, and results will be used to seed teams for the
									playoffs. At the end of the season, teams will compete to
									determine the league champion!
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
					<div className="absolute right-0 invisible md:visible -bottom-52 2xl:-bottom-52 2xl:-right-32">
						<Snowflake className="fill-background dark:fill-foreground max-w-[150px] 2xl:max-w-[300px]" />
					</div>
				</section>
			</div>

			<div
				className={
					'border border-transparent xl:max-w-none container dark:text-foreground dark:bg-background text-background bg-foreground'
				}
			>
				<section
					id="how-to-register"
					className={
						'my-32 flex justify-center md:items-stretch gap-8 flex-col md:flex-row items-center'
					}
				>
					<div className="flex items-center justify-center flex-1 rounded-lg overflow-clip bg-primary dark:bg-secondary max-w-[500px]">
						<img src="/Map.png" />
					</div>
					<div className="flex flex-col flex-1 gap-2 my-auto max-w-[500px]">
						<p className="pb-2 text-2xl font-bold">How to Register</p>
						<div className={'w-full flex'}>
							<span
								className={
									'bg-accent text-foreground dark:text-background flex shrink-0 w-4 h-4 mt-2 mr-2 text-xs items-center justify-center font-bold rounded-full -translate-y-0.5'
								}
							>
								1
							</span>
							<p>{`Click on the "Login" button to Log In or Sign Up.`}</p>
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

				<div className="max-w-[1040px] mx-auto flex items-center justify-start pb-24">
					<p className="text-2xl font-bold">See you on the field!</p>
				</div>
			</div>

			<Footer />
		</div>
	)
}
