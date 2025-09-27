export enum Products {
	WinterLeagueRegistration2023 = 'price_1NkUnZHMbQIHBzSiRjN2Ms70',
	WinterLeagueRegistration2024 = 'price_1PjNZjHMbQIHBzSiEbtC32Rb',
	WinterLeagueRegistration2025 = 'price_1SAuaFHMbQIHBzSiwp4TwhKo',
	WinterLeagueRegistration2025Dev = 'price_1SAubwQarFlwv3Hfg4yS4QA4',
}

/**
 * Get the current season's product price based on environment
 */
export const getCurrentSeasonPrice = (): string => {
	const isDev =
		import.meta.env.DEV || import.meta.env.VITE_USE_EMULATORS === 'true'

	if (isDev) {
		return Products.WinterLeagueRegistration2025Dev
	}

	return Products.WinterLeagueRegistration2025
}
