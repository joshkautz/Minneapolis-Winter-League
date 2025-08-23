// Import shared types from the @mwl/shared package
import {
	PlayerData,
	TeamData,
	SeasonData,
	OfferData,
	ExtendedOfferData,
	CheckoutSessionData,
	GameData,
	WaiverData,
	OfferCreator,
	OfferStatus,
	OfferType,
	Collections,
} from '@mwl/shared'

// Re-export for backward compatibility
export type {
	PlayerData,
	TeamData,
	SeasonData,
	OfferData,
	ExtendedOfferData,
	CheckoutSessionData,
	GameData,
	WaiverData,
}

// Re-export enums as values (not just types)
export { OfferCreator, OfferStatus, OfferType, Collections }
