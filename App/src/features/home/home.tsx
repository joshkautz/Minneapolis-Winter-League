import { Footer } from './footer'
import { HeroSection } from './hero-section'
import { LeagueDetailsSection } from './league-details-section'
import { WhyJoinSection } from './why-join-section'
import { RegistrationSection } from './registration-section'

/**
 * Home Component
 *
 * Main landing page component that orchestrates all home page sections.
 * Refactored to use smaller, focused section components for better maintainability.
 */
export const Home = () => {
	return (
		<div className={'w-full bg-background text-foreground'}>
			<HeroSection />
			<LeagueDetailsSection />
			<WhyJoinSection />
			<RegistrationSection />
			<Footer />
		</div>
	)
}
