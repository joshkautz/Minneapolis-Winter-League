import {
	addDoc,
	deleteDoc,
	doc,
	query,
	where,
	getDoc,
	setDoc,
	getFirestore,
	DocumentData,
	FirestoreError,
	orderBy,
	updateDoc,
	UpdateData,
	getDocs,
	collection,
	onSnapshot,
	or,
	and,
	DocumentSnapshot,
	QueryDocumentSnapshot,
	DocumentReference,
	QuerySnapshot,
	Timestamp,
	Query,
	documentId,
	CollectionReference,
} from 'firebase/firestore'

import { app } from './app'
import { User, UserCredential } from './auth'
import { Products } from './stripe'
import {
	CheckoutSessionData,
	GameData,
	OfferData,
	PlayerData,
	TeamData,
	SeasonData,
	OfferStatus,
	OfferCreator,
	Collections,
} from '@/shared/utils'
import { deleteImage, ref, storage } from './storage'
import { v4 as uuidv4 } from 'uuid'

const firestore = getFirestore(app)

const acceptOffer = (
	offerDocumentReference: DocumentReference<OfferData, DocumentData>
): Promise<void> => {
	return updateDoc(offerDocumentReference, {
		status: OfferStatus.ACCEPTED,
	})
}

const rejectOffer = (
	offerDocumentReference: DocumentReference<OfferData, DocumentData>
): Promise<void> => {
	return updateDoc(offerDocumentReference, {
		status: OfferStatus.REJECTED,
	})
}

// Audited: September 4, 2024.
const createTeam = async (
	playerRef: DocumentReference<PlayerData, DocumentData> | undefined,
	name: string | undefined,
	logo: string | undefined,
	seasonRef: DocumentReference<SeasonData, DocumentData> | undefined,
	storagePath: string | undefined
) => {
	if (!playerRef) return
	if (!name) return
	if (!seasonRef) return

	return (
		// Create the team document so we can upate the player document.
		addDoc(
			collection(firestore, Collections.TEAMS) as CollectionReference<
				TeamData,
				DocumentData
			>,
			{
				logo: logo ? logo : null,
				name: name,
				placement: null,
				registered: false,
				registeredDate: Timestamp.now(),
				roster: [{ captain: true, player: playerRef }],
				season: seasonRef,
				storagePath: storagePath ? storagePath : null,
				teamId: uuidv4(),
			}
		)
			// Get the player document so we can update the player document.
			.then((teamDocumentReference) =>
				Promise.all([teamDocumentReference, getDoc(playerRef)])
			)
			// Get the season document so we can update the season document.
			.then(([teamDocumentReference, playerDocumentSnapshot]) =>
				Promise.all([
					teamDocumentReference,
					playerDocumentSnapshot,
					getDoc(seasonRef),
				])
			)
			.then(
				([
					teamDocumentReference,
					playerDocumentSnapshot,
					seasonDocumentSnapshot,
				]) =>
					Promise.all([
						// Updated the player document.
						updateDoc(playerRef, {
							seasons: playerDocumentSnapshot.data()?.seasons.map((item) => ({
								captain: item.season.id === seasonRef.id ? true : item.captain,
								paid: item.paid,
								season: item.season,
								signed: item.signed,
								team:
									item.season.id === seasonRef.id
										? teamDocumentReference
										: item.team,
							})),
						}),
						// Updated the season document.
						updateDoc(seasonRef, {
							teams: seasonDocumentSnapshot
								.data()
								?.teams.concat(teamDocumentReference),
						}),
					])
			)
	)
}

const rolloverTeam = async (
	playerRef: DocumentReference<PlayerData, DocumentData> | undefined,
	name: string | undefined,
	logo: string | undefined,
	seasonRef: DocumentReference<SeasonData, DocumentData> | undefined,
	storagePath: string | undefined,
	teamId: string | undefined
) => {
	if (!playerRef) return
	if (!name) return
	if (!seasonRef) return
	if (!teamId) return

	// Create the team document so we can upate the player document.
	const teamDocumentReference = (await addDoc(
		collection(firestore, Collections.TEAMS),
		{
			logo: logo ? logo : null,
			name: name,
			placement: null,
			registered: false,
			registeredDate: Timestamp.now(),
			roster: [{ captain: true, player: playerRef }],
			season: seasonRef,
			storagePath: storagePath ? storagePath : null,
			teamId: teamId,
		}
	)) as DocumentReference<TeamData, DocumentData>

	// Get the player document so we can update the player document.
	const playerDocumentSnapshot = await getDoc(playerRef)

	// Get the season document so we can update the season document.
	const seasonDocumentSnapshot = await getDoc(seasonRef)

	return Promise.all([
		// Updated the player document.
		updateDoc(playerRef, {
			seasons: playerDocumentSnapshot.data()?.seasons.map((item) => ({
				captain: item.season.id === seasonRef.id ? true : item.captain,
				paid: item.paid,
				season: item.season,
				signed: item.signed,
				team:
					item.season.id === seasonRef.id ? teamDocumentReference : item.team,
			})),
		}),
		// Updated the season document.
		updateDoc(seasonRef, {
			teams: seasonDocumentSnapshot.data()?.teams.concat(teamDocumentReference),
		}),
	])
}

const editTeam = async (
	teamRef: DocumentReference<TeamData, DocumentData> | undefined,
	name: string | undefined,
	logo: string | undefined,
	storagePath: string | undefined
) => {
	if (!teamRef) return
	if (!name) return

	const teamDocumentSnapshot = await getDoc(teamRef)

	return updateDoc(teamRef, {
		name: name ? name : teamDocumentSnapshot.data()?.name,
		logo: logo ? logo : teamDocumentSnapshot.data()?.logo,
		storagePath: storagePath
			? storagePath
			: teamDocumentSnapshot.data()?.storagePath,
	})
}

const createPlayer = (
	res: UserCredential | undefined,
	firstname: string,
	lastname: string,
	email: string,
	season: QueryDocumentSnapshot<SeasonData, DocumentData> | undefined
): Promise<void> => {
	if (!res) return Promise.resolve()
	if (!season) return Promise.resolve()

	return setDoc(doc(firestore, Collections.PLAYERS, res.user.uid), {
		admin: false,
		firstname: firstname,
		lastname: lastname,
		email: email,
		seasons: [
			{
				captain: false,
				paid: false,
				season: season.ref,
				signed: false,
				team: null,
			},
		],
	})
}

// Audited: September 4, 2024.
const deleteTeam = async (
	teamRef: DocumentReference<TeamData, DocumentData> | undefined,
	seasonRef: DocumentReference<SeasonData, DocumentData> | undefined
) => {
	if (!teamRef) return
	if (!seasonRef) return

	return (
		(
			getDocs(
				query(
					collection(firestore, Collections.OFFERS),
					where('team', '==', teamRef)
				)
			) as Promise<QuerySnapshot<OfferData, DocumentData>>
		)
			// Delete all offers involving this team.
			.then((offersQuerySnapshot) =>
				offersQuerySnapshot.docs.map((offer) => deleteDoc(offer.ref))
			)
			// Update all players on this team to remove them from the team.
			.then(() => getDoc(teamRef))
			.then((teamDocumentSnapshot) =>
				teamDocumentSnapshot.data()?.roster.map(async (item) =>
					getDoc(item.player).then((playerDocumentSnapshot) =>
						updateDoc(playerDocumentSnapshot.ref, {
							seasons: playerDocumentSnapshot.data()?.seasons.map((item) => ({
								captain: item.season.id === seasonRef.id ? false : item.team,
								paid: item.paid,
								season: item.season,
								signed: item.signed,
								team: item.season.id === seasonRef.id ? null : item.team,
							})),
						})
					)
				)
			)
			// Update season document to remove the team.
			.then(() => getDoc(seasonRef))
			.then((seasonDocumentSnapshot) =>
				updateDoc(seasonRef, {
					teams: seasonDocumentSnapshot
						.data()
						?.teams.filter((team) => team.id !== teamRef.id),
				})
			)
			// Delete team's image from storage.
			.then(() => getDoc(teamRef))
			.then((teamDocumentSnapshot) => {
				const url = teamDocumentSnapshot.data()!.storagePath
				return url ? deleteImage(ref(storage, url)) : Promise.resolve()
			})
			// Delete the team document.
			.then(() => deleteDoc(teamRef))
	)
}

// Audited: September 4, 2024.
const promoteToCaptain = async (
	playerRef: DocumentReference<PlayerData, DocumentData> | undefined,
	teamRef: DocumentReference<TeamData, DocumentData> | undefined,
	seasonRef: DocumentReference<SeasonData, DocumentData> | undefined
) => {
	if (!playerRef) return
	if (!teamRef) return
	if (!seasonRef) return

	// Get the team doc so we can upate the team document.
	const teamDocumentSnapshot = await getDoc(teamRef)

	// Get the player doc so we can update the player document.
	const playerDocumentSnapshot = await getDoc(playerRef)

	return Promise.all([
		// Update the team doc to add captain status for the player.
		updateDoc(teamRef, {
			roster: teamDocumentSnapshot.data()?.roster.map((item) => ({
				captain: item.player.id === playerRef.id ? true : item.captain,
				player: item.player,
			})),
		}),
		// Updated the player doc to add captain status for the season.
		updateDoc(playerRef, {
			seasons: playerDocumentSnapshot.data()?.seasons.map((item) => ({
				captain: item.season.id === seasonRef.id ? true : item.captain,
				paid: item.paid,
				season: item.season,
				signed: item.signed,
				team: item.team,
			})),
		}),
	])
}

const demoteFromCaptain = async (
	playerRef: DocumentReference<PlayerData, DocumentData> | undefined,
	teamRef: DocumentReference<TeamData, DocumentData> | undefined,
	seasonRef: DocumentReference<SeasonData, DocumentData> | undefined
) => {
	if (!playerRef) return
	if (!teamRef) return
	if (!seasonRef) return

	// Get the team doc so we can update the team document.
	const teamDocumentSnapshot = await getDoc(teamRef)

	// Get the player doc so we can update the player document.
	const playerDocumentSnapshot = await getDoc(playerRef)

	// Check if the player is the last captain on the team. Cannot demote last captain.
	if (
		teamDocumentSnapshot.data()?.roster.filter((item) => item.captain)
			.length === 1
	)
		throw new Error('Cannot demote last captain.')

	return Promise.all([
		// Update the team doc to remove captain status for the player.
		updateDoc(teamRef, {
			roster: teamDocumentSnapshot.data()?.roster.map((item) => ({
				captain: item.player.id === playerRef.id ? false : item.captain,
				player: item.player,
			})),
		}),
		// Updated the player doc to remove captain status for the season.
		updateDoc(playerRef, {
			seasons: playerDocumentSnapshot.data()?.seasons.map((item) => ({
				captain: item.season.id === seasonRef.id ? false : item.captain,
				paid: item.paid,
				season: item.season,
				signed: item.signed,
				team: item.team,
			})),
		}),
	])
}

const removeFromTeam = async (
	playerRef: DocumentReference<PlayerData, DocumentData> | undefined,
	teamRef: DocumentReference<TeamData, DocumentData> | undefined,
	seasonRef: DocumentReference<SeasonData, DocumentData> | undefined
) => {
	if (!playerRef) return
	if (!teamRef) return
	if (!seasonRef) return

	await getDoc(teamRef)
		// Ensure this player isn't the last captain on the team.
		.then((teamDocumentSnapshot) => {
			if (
				!teamDocumentSnapshot
					.data()
					?.roster.some(
						(item) => item.captain && item.player.id !== playerRef.id
					)
			) {
				throw new Error('Cannot remove last captain.')
			}
		})

	// Update the team document to remove the player from the team.
	const teamPromise = getDoc(teamRef).then((teamDocumentSnapshot) =>
		updateDoc(teamRef, {
			roster: teamDocumentSnapshot
				.data()
				?.roster.filter((item) => item.player.id !== playerRef.id),
		})
	)

	// Update the player document to remove the team from their season.
	const playerPromise = getDoc(playerRef).then((playerDocumentSnapshot) =>
		updateDoc(playerRef, {
			seasons: playerDocumentSnapshot.data()?.seasons.map((item) => ({
				captain: item.season.id === seasonRef.id ? false : item.team,
				paid: item.paid,
				season: item.season,
				signed: item.signed,
				team: item.season.id === seasonRef.id ? null : item.team,
			})),
		})
	)

	return Promise.all([teamPromise, playerPromise])
}

const invitePlayer = (
	playerQueryDocumentSnapshot:
		| QueryDocumentSnapshot<PlayerData, DocumentData>
		| undefined,
	teamQueryDocumentSnapshot:
		| QueryDocumentSnapshot<TeamData, DocumentData>
		| undefined,
	authenticatedUserDocumentSnapshot:
		| DocumentSnapshot<PlayerData, DocumentData>
		| undefined
) => {
	if (!playerQueryDocumentSnapshot) return
	if (!teamQueryDocumentSnapshot) return
	if (!authenticatedUserDocumentSnapshot) return
	return addDoc(collection(firestore, Collections.OFFERS), {
		creator: OfferCreator.CAPTAIN,
		creatorName: `${authenticatedUserDocumentSnapshot.data()?.firstname} ${authenticatedUserDocumentSnapshot.data()?.lastname}`,
		player: playerQueryDocumentSnapshot.ref,
		team: teamQueryDocumentSnapshot.ref,
		status: OfferStatus.PENDING,
	})
}

const requestToJoinTeam = (
	playerDocumentSnapshot:
		| DocumentSnapshot<PlayerData, DocumentData>
		| undefined,
	teamQueryDocumentSnapshot: QueryDocumentSnapshot<TeamData, DocumentData>
) => {
	if (!playerDocumentSnapshot) return
	if (!teamQueryDocumentSnapshot) return
	return addDoc(collection(firestore, Collections.OFFERS), {
		creator: OfferCreator.NONCAPTAIN,
		creatorName: `${playerDocumentSnapshot.data()?.firstname} ${playerDocumentSnapshot.data()?.lastname}`,
		player: playerDocumentSnapshot.ref,
		team: teamQueryDocumentSnapshot.ref,
		status: OfferStatus.PENDING,
	})
}

const getPlayerSnapshot = (
	playerRef: DocumentReference<PlayerData, DocumentData>
): Promise<DocumentSnapshot<PlayerData, DocumentData>> => {
	return getDoc(playerRef)
}

const getPlayerRef = (
	authValue: User | null | undefined
): DocumentReference<PlayerData, DocumentData> | undefined => {
	if (!authValue) return undefined
	return doc(
		firestore,
		Collections.PLAYERS,
		authValue.uid
	) as DocumentReference<PlayerData, DocumentData>
}

const currentSeasonRegularGamesQuery = (
	seasonSnapshot: QueryDocumentSnapshot<SeasonData, DocumentData> | undefined
): Query<GameData, DocumentData> | undefined => {
	if (!seasonSnapshot) return undefined

	return query(
		collection(firestore, Collections.GAMES),
		where('season', '==', seasonSnapshot.ref),
		where('type', '==', 'regular')
	) as Query<GameData, DocumentData>
}

const currentSeasonPlayoffGamesQuery = (
	seasonSnapshot: QueryDocumentSnapshot<SeasonData, DocumentData> | undefined
): Query<GameData, DocumentData> | undefined => {
	if (!seasonSnapshot) return undefined

	return query(
		collection(firestore, Collections.GAMES),
		where('season', '==', seasonSnapshot.ref),
		where('type', '==', 'playoff')
	) as Query<GameData, DocumentData>
}

const currentSeasonGamesQuery = (
	seasonSnapshot: QueryDocumentSnapshot<SeasonData, DocumentData> | undefined
): Query<GameData, DocumentData> | undefined => {
	if (!seasonSnapshot) return undefined

	return query(
		collection(firestore, Collections.GAMES),
		where('season', '==', seasonSnapshot.ref)
	) as Query<GameData, DocumentData>
}

const gamesByTeamQuery = (
	teamRef: DocumentReference<TeamData, DocumentData> | undefined
): Query<GameData, DocumentData> | undefined => {
	if (!teamRef) return
	return query(
		collection(firestore, Collections.GAMES),
		or(where('home', '==', teamRef), where('away', '==', teamRef)),
		orderBy('date', 'asc')
	) as Query<GameData, DocumentData>
}

const teamsBySeasonQuery = (
	seasonRef: DocumentReference<SeasonData, DocumentData> | undefined
): Query<TeamData, DocumentData> | undefined => {
	if (!seasonRef) return
	return query(
		collection(firestore, Collections.TEAMS),
		where('season', '==', seasonRef)
	) as Query<TeamData, DocumentData>
}

const updatePlayer = (
	authValue: User | null | undefined,
	data: UpdateData<PlayerData>
): Promise<void> => {
	return updateDoc(doc(firestore, Collections.PLAYERS, authValue!.uid), data)
}

const getTeamById = (
	id: string | undefined
): DocumentReference<TeamData, DocumentData> | undefined => {
	if (!id) return

	return doc(firestore, Collections.TEAMS, id) as DocumentReference<
		TeamData,
		DocumentData
	>
}

const teamsQuery = (
	teams: (DocumentReference<TeamData, DocumentData> | null)[] | undefined
): Query<TeamData, DocumentData> | undefined => {
	if (!teams) return
	if (!teams.length) return

	return query(
		collection(firestore, Collections.TEAMS),
		where(documentId(), 'in', teams)
	) as Query<TeamData, DocumentData>
}

const teamsHistoryQuery = (
	id: string | undefined
): Query<TeamData, DocumentData> | undefined => {
	if (!id) return undefined

	return query(
		collection(firestore, Collections.TEAMS),
		where('teamId', '==', id)
	) as Query<TeamData, DocumentData>
}

const currentSeasonTeamsQuery = (
	seasonSnapshot: QueryDocumentSnapshot<SeasonData, DocumentData> | undefined
): Query<TeamData, DocumentData> | undefined => {
	if (!seasonSnapshot) return undefined

	return query(
		collection(firestore, Collections.TEAMS),
		where('season', '==', seasonSnapshot.ref)
	) as Query<TeamData, DocumentData>
}

const seasonsQuery = (): Query<SeasonData, DocumentData> => {
	return query(collection(firestore, Collections.SEASONS)) as Query<
		SeasonData,
		DocumentData
	>
}

const offersForPlayerByTeamQuery = (
	playerDocumentSnapshot:
		| DocumentSnapshot<PlayerData, DocumentData>
		| undefined,
	teamQueryDocumentSnapshot:
		| QueryDocumentSnapshot<TeamData, DocumentData>
		| undefined
) => {
	if (!playerDocumentSnapshot) return
	if (!teamQueryDocumentSnapshot) return
	return query(
		collection(firestore, Collections.OFFERS),
		where('player', '==', playerDocumentSnapshot.ref),
		where('team', '==', teamQueryDocumentSnapshot.ref)
	) as Query<OfferData, DocumentData>
}

const getPlayersQuery = (
	search: string
): Query<PlayerData, DocumentData> | undefined => {
	if (search === '') return undefined
	if (search.includes(' ')) {
		const [firstname, lastname] = search.split(' ', 2)
		return query(
			collection(firestore, Collections.PLAYERS),
			where(
				'firstname',
				'>=',
				firstname.charAt(0).toUpperCase() + firstname.slice(1)
			),
			where(
				'firstname',
				'<=',
				firstname.charAt(0).toUpperCase() + firstname.slice(1) + '\uf8ff'
			),
			where(
				'lastname',
				'>=',
				lastname.charAt(0).toUpperCase() + lastname.slice(1)
			),
			where(
				'lastname',
				'<=',
				lastname.charAt(0).toUpperCase() + lastname.slice(1) + '\uf8ff'
			)
		) as Query<PlayerData, DocumentData>
	} else {
		return query(
			collection(firestore, Collections.PLAYERS),
			or(
				and(
					where(
						'firstname',
						'>=',
						search.charAt(0).toUpperCase() + search.slice(1)
					),
					where(
						'firstname',
						'<=',
						search.charAt(0).toUpperCase() + search.slice(1) + '\uf8ff'
					)
				),
				and(
					where(
						'lastname',
						'>=',
						search.charAt(0).toUpperCase() + search.slice(1)
					),
					where(
						'lastname',
						'<=',
						search.charAt(0).toUpperCase() + search.slice(1) + '\uf8ff'
					)
				)
			)
		) as Query<PlayerData, DocumentData>
	}
}

const outgoingOffersQuery = (
	playerDocumentSnapshot:
		| DocumentSnapshot<PlayerData, DocumentData>
		| undefined,
	currentSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonData, DocumentData>
		| undefined
): Query<OfferData, DocumentData> | undefined => {
	if (!playerDocumentSnapshot) return undefined
	if (!currentSeasonQueryDocumentSnapshot) return undefined

	const isCaptain = playerDocumentSnapshot
		?.data()
		?.seasons.some(
			(item) =>
				item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
				item.captain
		)

	const team = playerDocumentSnapshot
		?.data()
		?.seasons.find(
			(item) =>
				item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
				item.captain
		)?.team

	// If the user is a captain, show all the invitations to join their team.
	if (isCaptain) {
		return query(
			collection(firestore, Collections.OFFERS),
			where('team', '==', team),
			where('creator', '==', OfferCreator.CAPTAIN)
		) as Query<OfferData, DocumentData>
	}

	// If the user is a player, show all their requests to join teams.
	return query(
		collection(firestore, Collections.OFFERS),
		where('player', '==', playerDocumentSnapshot.ref),
		where('creator', '==', OfferCreator.NONCAPTAIN)
	) as Query<OfferData, DocumentData>
}

const incomingOffersQuery = (
	playerDocumentSnapshot:
		| DocumentSnapshot<PlayerData, DocumentData>
		| undefined,
	currentSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonData, DocumentData>
		| undefined
): Query<OfferData, DocumentData> | undefined => {
	if (!playerDocumentSnapshot) return undefined
	if (!currentSeasonQueryDocumentSnapshot) return undefined

	const isCaptain = playerDocumentSnapshot
		?.data()
		?.seasons.some(
			(item) =>
				item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
				item.captain
		)

	const team = playerDocumentSnapshot
		?.data()
		?.seasons.find(
			(item) =>
				item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
				item.captain
		)?.team

	// If the user is a captain, show all the requests to join their team.
	if (isCaptain) {
		return query(
			collection(firestore, Collections.OFFERS),
			where('team', '==', team),
			where('creator', '==', OfferCreator.NONCAPTAIN)
		) as Query<OfferData, DocumentData>
	}

	// If the user is a player, show all their invitations to join teams.
	return query(
		collection(firestore, Collections.OFFERS),
		where('player', '==', playerDocumentSnapshot.ref),
		where('creator', '==', OfferCreator.CAPTAIN)
	) as Query<OfferData, DocumentData>
}

const stripeRegistration = async (
	authValue: User | null | undefined,
	setStripeLoading: React.Dispatch<React.SetStateAction<boolean>>,
	setStripeError: React.Dispatch<React.SetStateAction<string | undefined>>
) => {
	setStripeLoading(true)

	// Create new Checkout Session for the player
	return (
		addDoc(
			collection(firestore, `customers/${authValue?.uid}/checkout_sessions`),
			{
				mode: 'payment',
				price: Products.WinterLeagueRegistration2024, // TODO: Add to the season update guide. Add a new product for the new season on Stripe, then add its price code to the Products enum in stripe.ts., and then update this line to use the new product.
				success_url: window.location.href,
				cancel_url: window.location.href,
			}
		) as Promise<DocumentReference<CheckoutSessionData, DocumentData>>
	).then((checkoutSessionDocumentReference) => {
		// Listen for the URL of the Checkout Session
		onSnapshot(
			checkoutSessionDocumentReference,
			(checkoutSessionDocumentSnapshot) => {
				const data = checkoutSessionDocumentSnapshot.data()
				if (data) {
					if (data.url) {
						// We have a Stripe Checkout URL, let's redirect.
						window.location.assign(data.url)
					}
					if (data.error) {
						setStripeLoading(false)
						console.log('setting stripe error')
						setStripeError(data.error.message)
					}
				}
			}
		)
	})
}

export {
	acceptOffer,
	rejectOffer,
	getPlayerSnapshot,
	getPlayerRef,
	getPlayersQuery,
	teamsHistoryQuery,
	currentSeasonTeamsQuery,
	currentSeasonRegularGamesQuery,
	currentSeasonPlayoffGamesQuery,
	currentSeasonGamesQuery,
	requestToJoinTeam,
	invitePlayer,
	teamsQuery,
	seasonsQuery,
	outgoingOffersQuery,
	offersForPlayerByTeamQuery,
	createPlayer,
	incomingOffersQuery,
	updatePlayer,
	removeFromTeam,
	createTeam,
	rolloverTeam,
	deleteTeam,
	editTeam,
	stripeRegistration,
	gamesByTeamQuery,
	teamsBySeasonQuery,
	demoteFromCaptain,
	promoteToCaptain,
	getTeamById,
	type DocumentData,
	type FirestoreError,
	type DocumentSnapshot,
	type QuerySnapshot,
	type DocumentReference,
	type QueryDocumentSnapshot,
}
