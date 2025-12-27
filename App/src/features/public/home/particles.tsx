import { useId, useEffect, useState, useMemo, useCallback } from 'react'
import Particles, { initParticlesEngine } from '@tsparticles/react'
import type { Container, ISourceOptions } from '@tsparticles/engine'
import { loadSlim } from '@tsparticles/slim'
import { loadHeartShape } from '@tsparticles/shape-heart'
import { cn } from '@/shared/utils'
import { motion, useAnimation } from 'framer-motion'

type ParticlesProps = {
	id?: string
	className?: string
	background?: string
	minSize?: number
	maxSize?: number
	speed?: number
	particleColor?: string
	particleDensity?: number
	/** Particle style variant: 'snow' for falling snowflakes, 'hearts' for floating hearts */
	variant?: 'snow' | 'hearts'
}

/**
 * Animated particles component supporting multiple visual variants.
 *
 * Uses @tsparticles/react with the slim bundle and heart shape extension.
 * Engine initialization happens once globally via initParticlesEngine.
 */
export const SparklesCore = ({
	id,
	className,
	background = 'transparent',
	minSize = 1,
	maxSize = 3,
	speed = 4,
	particleColor,
	particleDensity = 120,
	variant = 'snow',
}: ParticlesProps) => {
	const [init, setInit] = useState(false)
	const controls = useAnimation()
	const generatedId = useId()

	// Configuration based on variant
	const isHearts = variant === 'hearts'
	const direction = isHearts ? 'top' : 'bottom'
	const defaultColor = isHearts ? '#ff6b9d' : '#ffffff'
	const shapeType = isHearts ? 'heart' : 'circle'

	// Initialize particles engine once (idempotent - safe to call multiple times)
	useEffect(() => {
		initParticlesEngine(async (engine) => {
			await loadSlim(engine)
			await loadHeartShape(engine)
		})
			.then(() => setInit(true))
			.catch(() => {
				// Silently ignore initialization errors - particles are decorative
			})
	}, [])

	// Memoize callback to prevent unnecessary re-renders
	const particlesLoaded = useCallback(
		async (container?: Container) => {
			if (container) {
				controls.start({
					opacity: 1,
					transition: { duration: 1 },
				})
			}
		},
		[controls]
	)

	// Memoize options to prevent recreation on each render
	const options: ISourceOptions = useMemo(
		() => ({
			background: {
				color: { value: background },
			},
			fullScreen: {
				enable: false,
				zIndex: 1,
			},
			fpsLimit: 120,
			interactivity: {
				events: {
					onClick: {
						enable: true,
						mode: 'push',
					},
					onHover: {
						enable: false,
					},
					resize: {
						enable: true,
					},
				},
				modes: {
					push: {
						quantity: 4,
					},
				},
			},
			particles: {
				color: {
					value: particleColor || defaultColor,
				},
				move: {
					direction: direction,
					enable: true,
					outModes: {
						default: 'out',
					},
					speed: {
						min: 0.1,
						max: 1,
					},
				},
				number: {
					density: {
						enable: true,
						width: 400,
						height: 400,
					},
					value: particleDensity,
				},
				opacity: {
					value: {
						min: 0.1,
						max: 1,
					},
					animation: {
						enable: true,
						speed: speed,
						sync: false,
						startValue: 'random',
					},
				},
				shape: {
					type: shapeType,
				},
				size: {
					value: {
						min: minSize,
						max: maxSize,
					},
				},
			},
			detectRetina: true,
		}),
		[
			background,
			particleColor,
			defaultColor,
			direction,
			particleDensity,
			speed,
			shapeType,
			minSize,
			maxSize,
		]
	)

	return (
		<motion.div animate={controls} className={cn('opacity-0', className)}>
			{init && (
				<Particles
					id={id || generatedId}
					className='h-full w-full'
					particlesLoaded={particlesLoaded}
					options={options}
				/>
			)}
		</motion.div>
	)
}
