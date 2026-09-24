import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { Snowflake } from './snowflake'

/**
 * LeagueDetailsSection Component
 *
 * Contains the league overview, the season details card, and how teams
 * register. Extracted from main Home component.
 */
export const LeagueDetailsSection = () => {
	return (
		<div
			className={
				'w-full bg-background text-foreground dark:text-background dark:bg-foreground'
			}
		>
			<section id='league-details' className={'container pb-32'}>
				<div className='flex flex-row'>
					<Snowflake className='-mt-32 max-w-[400px] flex-1 basis-[80px] shrink-0 fill-accent z-10 hidden lg:flex' />

					<div className={'flex flex-col flex-2 items-end gap-2 pt-16'}>
						<p className={'text-4xl font-bold max-w-[800px]'}>
							Our league is about community, growth, competition, and a whole
							lot of fun.
						</p>
						<div className='max-w-[800px] h-1 w-full flex items-start lg:justify-center justify-start'>
							<div
								className={
									'mr-16 w-full max-w-[300px] lg:max-w-[475px] h-1 rounded bg-accent'
								}
							/>
						</div>
					</div>
				</div>
				<div
					className={
						'flex flex-wrap items-center gap-12 lg:gap-20 mt-16 w-full'
					}
				>
					<Card
						className={
							'flex flex-col flex-1 basis-[320px] shrink-0 rounded-2xl bg-section-invert text-section-invert-foreground border-off-white/20'
						}
					>
						<CardHeader>
							<CardTitle className={'text-2xl font-bold self-center'}>
								2026 Fall Season
							</CardTitle>
						</CardHeader>
						<CardContent className={'flex flex-col gap-4'}>
							<div className={'flex'}>
								<p className={'w-16 mr-2 font-bold min-w-16'}>What:</p>
								<span>{`5v5 Indoor Open Ultimate on Artificial Grass Fields.`}</span>
							</div>
							<div className={'flex'}>
								<p className={'w-16 mr-2 font-bold min-w-16'}>When:</p>
								<span>
									{`Saturdays, November 7th, 14th, 21st and December 5th, 12th, 19th. No games November 28th or December 26th.`}
								</span>
							</div>
							<div className={'flex'}>
								<p className={'w-16 mr-2 font-bold min-w-16'}>Where:</p>
								<span>
									<a
										href='https://maps.app.goo.gl/avAamyReCbGmz8jWA'
										target='_blank'
										rel='noreferrer'
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
								<span>
									{`Two 40-minute games every Saturday, 5:30–9:00pm. Fields open at 5:30 for warm-ups; the first games start at 6:00pm.`}
								</span>
							</div>
							<div className={'flex'}>
								<p className={'w-16 mr-2 font-bold min-w-16'}>Cost:</p>
								<span>
									{`$1,000 per team for 6 weeks of games, split however your team likes.`}
								</span>
							</div>
							<div className={'flex'}>
								<p className={'w-16 mr-2 font-bold min-w-16'}>What's New?</p>
								<span>
									{`Teams pay together: one team fee instead of paying per player.`}
								</span>
							</div>
						</CardContent>
					</Card>
					<div
						className={'flex flex-col flex-1 gap-6 p-8 basis-[320px] shrink-0'}
					>
						<p className={'text-2xl font-bold'}>Teams</p>
						<p>
							Minneapolis Winter League has room for <b>12 teams</b>, with a{' '}
							<b>10-player minimum</b> and no roster maximum. A team registers
							once <b>10 of its players have signed their waiver</b> and the
							team has committed <b>$1,000</b>, split however it likes. The
							first twelve teams to do both are in.
						</p>
						<div className='flex gap-3 rounded-xl border border-accent/60 bg-accent/15 p-4'>
							<ShieldCheck
								className='h-6 w-6 shrink-0 text-accent'
								aria-hidden='true'
							/>
							<p>
								<b>
									Didn&apos;t get a spot? You&apos;re always fully refunded.
								</b>{' '}
								Payments are only held on the card until your team is confirmed,
								so a team that misses out gets every dollar back, usually
								without ever being charged.
							</p>
						</div>
						<p>
							Visit the{' '}
							<Link to={'/teams'}>
								<u>Teams</u>
							</Link>{' '}
							page to see how many teams are registered so far.
						</p>
					</div>
				</div>
			</section>
		</div>
	)
}
