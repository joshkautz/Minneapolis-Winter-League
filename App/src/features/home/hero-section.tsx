import { useAuthContext } from '@/providers'
import { useSeasonsContext } from '@/providers'
import { useAnchorScroll } from '@/shared/hooks'
import { useMemo } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { OutletContext } from '@/shared/components'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CitySvg } from './city-svg'
import { SparklesCore } from './particles'
import type { PlayerSeason } from '@minneapolis-winter-league/shared'
import { RegistrationCountdown } from './registration-countdown'

export const HeroSection = () => {
	useAnchorScroll()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()
	const { openAuthModal } = useOutletContext<OutletContext>()
	const navigate = useNavigate()
	const {
		authStateUser,
		authStateLoading,
		authenticatedUserSnapshot,
		authenticatedUserSnapshotLoading,
	} = useAuthContext()

	const isLoading = useMemo(
		() =>
			(!authStateUser &&
				authStateLoading &&
				!authenticatedUserSnapshot &&
				authenticatedUserSnapshotLoading) ||
			(!authStateUser &&
				authStateLoading &&
				!authenticatedUserSnapshot &&
				!authenticatedUserSnapshotLoading) ||
			(authStateUser &&
				!authStateLoading &&
				!authenticatedUserSnapshot &&
				!authenticatedUserSnapshotLoading) ||
			(authStateUser &&
				!authStateLoading &&
				!authenticatedUserSnapshot &&
				authenticatedUserSnapshotLoading),
		[
			authStateUser,
			authStateLoading,
			authenticatedUserSnapshot,
			authenticatedUserSnapshotLoading,
		]
	)

	const isAuthenticated = useMemo(
		() => authenticatedUserSnapshot,
		[authenticatedUserSnapshot]
	)

	const isAuthenticatedUserRostered = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.some(
					(item: PlayerSeason) =>
						item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
						item.team
				),
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const handleCallToAction = () => {
		if (!authenticatedUserSnapshot) {
			openAuthModal()
			return
		}
		navigate('/manage')
	}

	const sparklesCore = useMemo(() => {
		return (
			<SparklesCore
				background='transparent'
				minSize={0.6}
				maxSize={1.4}
				particleDensity={100}
				className='w-full h-full'
				particleColor='#FFFFFF'
			/>
		)
	}, [])

	return (
		<section
			id='welcome'
			className={
				'h-[80vh] max-h-[620px] relative bg-foreground text-background dark:text-foreground dark:bg-background z-10'
			}
		>
			<div className='container'>
				<div className='flex flex-col items-stretch h-full md:flex-row justify-stretch'>
					<div className='flex-1 mt-8'>
						<div
							className={'flex flex-col gap-4 pt-2 sm:pt-16 pb-2 max-w-[680px]'}
						>
							<p className={'text-5xl font-bold'}>Minneapolis Winter League</p>
							<p className={'text-2xl font-light '}>
								Bundle up, lace up your cleats, and experience Minneapolis
								winter ultimate like never before.
							</p>
						</div>
						<div
							className={
								'w-[220px] h-1 rounded bg-linear-to-r from-primary to-sky-300'
							}
						/>
						<div className='flex mt-4 sm:mt-12'>
							<RegistrationCountdown />
						</div>
						{/* TEMPORARILY REMOVING THIS PARAGRAPH */}
						{/* <div className={'mt-4 sm:mt-12 max-w-[490px] flex-1'}>
							{`Join us this season for unforgettable Saturday nights of
								organized league play. Whether you're a seasoned club veteran,
								or a rookie learning the sport, `}
							<span className={'font-bold'}>
								{`we can't wait to welcome you to the league.`}
							</span>
						</div> */}

						{isLoading ? (
							<Skeleton className='w-24 mt-8 rounded sm:mt-12 bg-accent h-9' />
						) : (
							<Button
								className='z-50 mt-8 sm:mt-12 bg-accent text-foreground hover:bg-accent/90 dark:text-background'
								onClick={handleCallToAction}
							>
								{!isAuthenticated
									? 'Join our League'
									: isAuthenticatedUserRostered
										? 'Your Team'
										: 'Join a Team'}
							</Button>
						)}
					</div>
				</div>
			</div>
			<div className='absolute inset-y-0 right-0 w-full h-screen pointer-events-none md:w-1/2'>
				{sparklesCore}
			</div>
			<CitySvg className='absolute right-0 bottom-0 w-auto h-full max-h-[400px] -z-10' />
			<img
				src={'/snowman.png'}
				alt={'A snowman shaped like a duck.'}
				className={
					'absolute z-40 w-[120px] md:w-[240px] lg:w-[300px] h-auto -bottom-16 lg:-bottom-10 right-8 lg:right-[15%]'
				}
			/>
			<img
				src={'/wave.png'}
				alt={'A white wave of snow.'}
				className={
					'w-full h-auto absolute bottom-[-10px] inset-x-0 pointer-events-none'
				}
			/>
		</section>
	)
}
