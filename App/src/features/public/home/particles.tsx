import { useId, useState, useMemo } from 'react'
import Particles, {
	ParticlesProvider,
	useParticlesProvider,
} from '@tsparticles/react'
import type { Engine, ISourceOptions } from '@tsparticles/engine'
import { loadSlim } from '@tsparticles/slim'
import { loadHeartShape } from '@tsparticles/shape-heart'
import { motion } from 'framer-motion'

/**
 * Registers the particle bundles this app uses.
 *
 * @tsparticles/react v4 replaced the imperative `initParticlesEngine(cb)` with
 * a `<ParticlesProvider init={...}>` that exposes readiness through
 * `useParticlesProvider()`. Both loaders are idempotent, so mounting more than
 * one provider is harmless.
 */
const registerParticlePlugins = async (engine: Engine): Promise<void> => {
	await loadSlim(engine)
	await loadHeartShape(engine)
}

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
 * Renders the particle canvas. Must be inside a ParticlesProvider, which
 * SparklesCore supplies.
 */
const SparklesCanvas = ({
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
	const { loaded: engineLoaded } = useParticlesProvider()
	const [particlesReady, setParticlesReady] = useState(false)
	const generatedId = useId()

	// Configuration based on variant
	const isHearts = variant === 'hearts'
	const direction = isHearts ? 'top' : 'bottom'
	const defaultColor = isHearts ? '#ff6b9d' : '#ffffff'
	const shapeType = isHearts ? 'heart' : 'circle'

	// Callback when particles finish loading - triggers fade-in animation
	const particlesLoaded = async () => {
		setParticlesReady(true)
	}

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
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: particlesReady ? 1 : 0 }}
			transition={{ duration: 1 }}
			className={className}
			aria-hidden='true'
			role='presentation'
		>
			{engineLoaded && (
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

/**
 * Animated particles component supporting multiple visual variants.
 *
 * Uses @tsparticles/react with the slim bundle and heart shape extension.
 * Purely decorative: if the engine fails to load, nothing renders and the
 * surrounding layout is unaffected.
 */
export const SparklesCore = (props: ParticlesProps) => (
	<ParticlesProvider init={registerParticlePlugins}>
		<SparklesCanvas {...props} />
	</ParticlesProvider>
)
