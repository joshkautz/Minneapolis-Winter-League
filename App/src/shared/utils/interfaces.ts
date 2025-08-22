import { DocumentData, DocumentReference } from '@/firebase/firestore'
import { Timestamp } from '@firebase/firestore'

export enum OfferCreator {
	CAPTAIN = 'captain',
	NONCAPTAIN = 'noncaptain',
}

export enum OfferStatus {
	PENDING = 'pending',
	ACCEPTED = 'accepted',
	REJECTED = 'rejected',
}

export enum OfferType {
	OUTGOING_INVITE = 'outgoingInvite',
	OUTGOING_REQUEST = 'outgoingRequest',
	INCOMING_INVITE = 'incomingInvite',
	INCOMING_REQUEST = 'incomingRequest',
}

export interface OfferAction {
	title: string
	action: (
		offerDocumentReference: DocumentReference<OfferData, DocumentData>
	) => void
}

export interface NotificationCardItemProps {
	type: OfferType
	data: ExtendedOfferData | DocumentData
	statusColor?: string
	message?: string
	actionOptions: {
		title: string
		action: (arg: DocumentReference<OfferData, DocumentData>) => void
	}[]
}

export enum Collections {
	PLAYERS = 'players',
	OFFERS = 'offers',
	GAMES = 'games',
	TEAMS = 'teams',
	SEASONS = 'seasons',
	WAIVERS = 'waivers',
}

export interface DropboxResult {
	result: {
		signatureRequestId: string
		signingUrl: string
		requesterEmailAddress: string
	}
}

export interface DropboxError {
	error: {
		message: string
		name: string
		statusCode: number
		statusText: string
	}
}

/////////////////////////////////////////////////////////////////
///////////////////////// Document Data /////////////////////////
/////////////////////////////////////////////////////////////////

export interface PlayerData extends DocumentData {
	admin: boolean
	email: string
	firstname: string
	lastname: string
	seasons: {
		banned: boolean
		captain: boolean
		paid: boolean
		season: DocumentReference<SeasonData, DocumentData>
		signed: boolean
		team: DocumentReference<TeamData, DocumentData> | null
	}[]
}

export interface TeamData extends DocumentData {
	logo: string | null
	name: string
	placement: number | null
	registered: boolean
	registeredDate: Timestamp
	roster: {
		captain: boolean
		player: DocumentReference<PlayerData, DocumentData>
	}[]
	season: DocumentReference<SeasonData, DocumentData>
	storagePath: string | null
	teamId: string
}

export interface SeasonData extends DocumentData {
	dateEnd: Timestamp
	dateStart: Timestamp
	name: string
	registrationEnd: Timestamp
	registrationStart: Timestamp
	teams: DocumentReference<TeamData, DocumentData>[]
}

export interface OfferData extends DocumentData {
	creator: OfferCreator
	creatorName: string
	player: DocumentReference<PlayerData, DocumentData>
	status: OfferStatus
	team: DocumentReference<TeamData, DocumentData>
}

export interface ExtendedOfferData extends OfferData {
	playerName: string
	teamName: string
}

export interface CheckoutSessionData extends DocumentData {
	cancel_url: string
	error: { message: string }
	client: string
	created: Timestamp
	mode: string
	price: string
	sessionId: string
	success_url: string
	url: string
}

export interface StandingsData extends DocumentData {
	wins: number
	losses: number
	pointsFor: number
	pointsAgainst: number
	differential: number
}

export interface GameData extends DocumentData {
	away: DocumentReference<TeamData, DocumentData>
	awayScore: number
	date: Timestamp
	field: number
	home: DocumentReference<TeamData, DocumentData>
	homeScore: number
	season: DocumentReference<SeasonData, DocumentData>
}

export interface WaiverData extends DocumentData {
	player: DocumentReference<PlayerData, DocumentData>
}
