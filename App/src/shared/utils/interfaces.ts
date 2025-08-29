// Import shared types from the @minneapolis-winter-league/shared package
import {
	PlayerDocument,
	TeamDocument,
	SeasonDocument,
	OfferDocument,
	CheckoutSessionDocument,
	GameDocument,
	WaiverDocument,
	OfferStatus,
	OfferType,
	OfferDirection,
	Collections,
} from '@minneapolis-winter-league/shared'

// Re-export for backward compatibility with Data suffix naming
export type PlayerData = PlayerDocument
export type TeamData = TeamDocument
export type SeasonData = SeasonDocument
export type OfferData = OfferDocument
export type CheckoutSessionData = CheckoutSessionDocument
export type GameData = GameDocument
export type WaiverData = WaiverDocument

// Re-export enums as values (not just types)
export { OfferStatus, OfferType, OfferDirection, Collections }
