import { useAnchorScroll } from '@/shared/hooks'
import { useMemo } from 'react'
import { CitySvg } from './city-svg'
import { SparklesCore } from './particles'
import { RegistrationCountdown } from './registration-countdown'

export const HeroSection = () => {
	useAnchorScroll()

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
			className={
				'h-[80vh] max-h-[620px] relative bg-background text-foreground z-10'
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
					</div>
				</div>
			</div>
			<div
				className='absolute inset-0 w-full pointer-events-none z-20'
				style={{ bottom: '0px' }}
			>
				{sparklesCore}
			</div>
			<div
				className='absolute inset-x-0 bottom-0 w-full -z-10'
				style={{ color: '#8893A6' }}
			>
				<CitySvg className='w-full h-auto max-h-[400px]' />
			</div>
			<img
				src={'/winter-duck.png'}
				alt={'A duck all dressed up for the winter.'}
				className={
					'absolute z-40 w-[120px] md:w-[240px] lg:w-[300px] h-auto -bottom-16 lg:-bottom-10 right-8 lg:right-[15%]'
				}
			/>
			<svg
				className='w-full h-auto absolute bottom-[-10px] inset-x-0 pointer-events-none'
				viewBox='0 0 1200 120'
				preserveAspectRatio='none'
				fill='#ffffff'
			>
				<path d='M0,80 C150,20 300,100 450,60 C600,20 750,80 900,40 C1050,0 1200,60 1200,60 L1200,120 L0,120 Z' />
				<path d='M0,100 C150,40 300,120 450,80 C600,40 750,100 900,60 C1050,20 1200,80 1200,80 L1200,120 L0,120 Z' />
			</svg>
		</section>
	)
}
