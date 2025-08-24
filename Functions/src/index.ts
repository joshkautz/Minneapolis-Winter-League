import { initializeApp } from './initializeApp.js'

// Dropbox Sign SDK
import {
	EventCallbackHelper,
	EventCallbackRequest,
	EventCallbackRequestEvent,
	HttpError,
	returnTypeT,
	SignatureRequestApi,
	SignatureRequestGetResponse,
	SubSigningOptions,
} from '@dropbox/sign'

// Firebase Functions SDK - Gen 1
import v1 from 'firebase-functions/v1'

// Firebase Functions SDK - Gen 2
import {
	onDocumentUpdated,
	onDocumentCreated,
} from 'firebase-functions/v2/firestore'
import { onCall, onRequest } from 'firebase-functions/v2/https'
import { error } from 'firebase-functions/logger'

// Firebase Firestore SDK
import {
	CollectionReference,
	DocumentData,
	DocumentReference,
	FieldValue,
	Query,
	getFirestore,
} from 'firebase-admin/firestore'

// Import shared data structure interfaces and constants only
import {
	PlayerData,
	TeamData,
	SeasonData,
	OfferData,
	WaiverData,
	OfferStatus,
	COLLECTIONS,
	FIELDS,
	REGION,
} from '@minneapolis-winter-league/shared'

const DROPBOX_SIGN_API_KEY = 'DROPBOX_SIGN_API_KEY'
const DROPBOX_TEMPLATE_ID = '2ea9b881ec6798e7c6122ebaa51baf50689c573c'

initializeApp()

// Audited: September 2, 2024.
/**
 * When a user is deleted via Firebase Authentication, delete the corresponding `Players` document, update the corresponding `Teams` documents, and delete the corresponding `Offers` documents.
 *
 * Firebase Documentation: {@link https://firebase.google.com/docs/functions/auth-events#trigger_a_function_on_user_deletion Trigger a function on user deletion.}
 */

export const OnUserDeleted = v1
	.region(REGION)
	.auth.user()
	.onDelete((user) => {
		try {
			const firestore = getFirestore()

			const playerDocumentReference = firestore
				.collection(COLLECTIONS.PLAYERS)
				.doc(user.uid) as DocumentReference<PlayerData, DocumentData>

			// Delete all the offers for the player.
			const offersDeletionPromises = firestore
				.collection(COLLECTIONS.OFFERS)
				.where(FIELDS.PLAYER, '==', playerDocumentReference)
				.get()
				.then((offers) => offers.docs.map((offer) => offer.ref.delete()))

			// Remove player from all the teams they've ever been on.
			const teamsUpdatePromises = playerDocumentReference
				.get()
				.then((playerDocumentSnapshot) =>
					playerDocumentSnapshot.data()?.seasons.map((item: any) =>
						item.team?.get().then((teamDocumentSnapshot: any) =>
							item.team?.update({
								roster: teamDocumentSnapshot
									?.data()
									?.roster.filter((item: any) => item.player.id !== user.uid),
							})
						)
					)
				)

			// Delete player.
			const deletePlayerPromise = playerDocumentReference.delete()

			return Promise.all([
				offersDeletionPromises,
				teamsUpdatePromises,
				deletePlayerPromise,
			])
		} catch (e) {
			error(e)
			return e
		}
	})

// Audited: September 2, 2024.
/**
 * When an offer is accepted, update the corresponding `Player` document, update the corresponding `Team` document, and delete all the coresponding `Offer` documents.
 *
 * Firebase Documentation: {@link https://firebase.google.com/docs/functions/firestore-events?gen=1st#trigger_a_function_when_a_document_is_updated_2 Trigger a function when a document is updated.}
 */

export const OnOfferAccepted = onDocumentUpdated(
	{ document: 'offers/{offerId}', region: REGION },
	async (event) => {
		try {
			const firestore = getFirestore()

			const newValue = event.data?.after.data() as OfferData
			const previousValue = event.data?.before.data() as OfferData

			if (
				previousValue.status === OfferStatus.PENDING &&
				newValue.status === OfferStatus.ACCEPTED
			) {
				const playerDocumentReference = newValue.player
				const teamDocumentReference = newValue.team

				// Update player document - Add team to the player's current season.
				const updatePlayerPromise = (
					firestore.collection(COLLECTIONS.SEASONS) as CollectionReference<
						SeasonData,
						DocumentData
					>
				)
					.get()
					.then((seasonQuerySnapshot) =>
						Promise.all([playerDocumentReference.get(), seasonQuerySnapshot])
					)
					.then(([playerDocumentSnapshot, seasonQuerySnapshot]) =>
						playerDocumentReference.update({
							seasons: playerDocumentSnapshot
								.data()
								?.seasons.map((item: any) =>
									item.season.id ==
									seasonQuerySnapshot.docs
										.sort(
											(a, b) =>
												b.data().dateStart.seconds - a.data().dateStart.seconds
										)
										.find((season) => season)?.id
										? {
												banned: item.banned,
												captain: item.captain,
												paid: item.paid,
												season: item.season,
												signed: item.signed,
												team: teamDocumentReference,
											}
										: item
								),
						})
					)

				// Update team document - Add player to the team's roster.
				const updateTeamPromise = teamDocumentReference
					.get()
					.then((teamDocumentSnapshot) =>
						teamDocumentReference.update({
							roster: teamDocumentSnapshot.data()?.roster.concat({
								captain: false,
								player: playerDocumentReference,
							}),
						})
					)

				// Delete all the offers for the player.
				const offersDeletionPromises = (
					firestore
						.collection(COLLECTIONS.OFFERS)
						.where(FIELDS.PLAYER, '==', playerDocumentReference) as Query<
						OfferData,
						DocumentData
					>
				)
					.get()
					.then((offersQuerySnapshot) =>
						offersQuerySnapshot.docs.map((offerQueryDocumentSnapshot) =>
							offerQueryDocumentSnapshot.ref.delete()
						)
					)

				return Promise.all([
					updatePlayerPromise,
					updateTeamPromise,
					offersDeletionPromises,
				])
			}

			return
		} catch (e) {
			error(e)
			return e
		}
	}
)

// Audited: September 2, 2024.
/**
 * When an offer is rejected, delete the corresponding `Offer` document.
 *
 * Firebase Documentation: {@link https://firebase.google.com/docs/functions/firestore-events?gen=1st#trigger_a_function_when_a_document_is_updated_2 Trigger a function when a document is updated.}
 */
export const OnOfferRejected = onDocumentUpdated(
	{ document: 'offers/{offerId}', region: REGION },
	async (event) => {
		try {
			const newValue = event.data?.after.data() as OfferData
			const previousValue = event.data?.before.data() as OfferData

			if (
				newValue.status === OfferStatus.REJECTED &&
				previousValue.status === OfferStatus.PENDING
			) {
				return Promise.all([event.data?.after.ref.delete()])
			}

			return
		} catch (e) {
			error(e)
			return e
		}
	}
)

// Audited: September 2, 2024.
/**
 * When a payment is created, update the player for the current season, and send them a Dropbox signature request.
 *
 * Firebase Documentation: {@link https://firebase.google.com/docs/functions/firestore-events?gen=1st#trigger_a_function_when_a_new_document_is_created_2 Trigger a function when a document is created.}
 */

export const OnPaymentCreated = onDocumentCreated(
	{ document: 'customers/{uid}/payments/{sid}', region: REGION },
	async (event) => {
		try {
			const firestore = getFirestore()
			const dropbox = new SignatureRequestApi()
			dropbox.username = DROPBOX_SIGN_API_KEY

			const payment = await firestore
				.collection('customers')
				.doc(event.params.uid)
				.collection('payments')
				.doc(event.params.sid)
				.get()

			if (payment.data()?.status != 'succeeded') return

			return (
				firestore
					.collection(COLLECTIONS.PLAYERS)
					.doc(event.params.uid) as DocumentReference<PlayerData, DocumentData>
			)
				.get()
				.then((playerDocumentSnapshot) =>
					Promise.all([
						(
							firestore.collection(COLLECTIONS.SEASONS) as CollectionReference<
								SeasonData,
								DocumentData
							>
						).get(),
						playerDocumentSnapshot,
					])
				)
				.then(([seasonQuerySnapshot, playerDocumentSnapshot]) =>
					Promise.all([
						playerDocumentSnapshot,
						playerDocumentSnapshot.ref.update({
							seasons: playerDocumentSnapshot.data()?.seasons.map((item) =>
								item.season.id ===
								seasonQuerySnapshot.docs
									.sort(
										(a, b) =>
											b.data().dateStart.seconds - a.data().dateStart.seconds
									)
									.find((season) => season)?.id
									? {
											banned: item.banned,
											captain: item.captain,
											paid: true,
											season: item.season,
											signed: item.signed,
											team: item.team,
										}
									: item
							),
						}),
					])
				)
				.then(([playerDocumentSnapshot]) =>
					Promise.all([
						dropbox.signatureRequestSendWithTemplate({
							templateIds: [DROPBOX_TEMPLATE_ID],
							subject: 'Minneapolis Winter League - Release of Liability',
							message:
								"We're so excited you decided to join Minneapolis Winter League. " +
								'Please make sure to sign this Release of Liability to finalize ' +
								'your participation. Looking forward to seeing you!',
							signers: [
								{
									role: 'Participant',
									name: `${playerDocumentSnapshot.data()!.firstname} ${playerDocumentSnapshot.data()!.lastname}`,
									emailAddress: playerDocumentSnapshot.data()!.email,
								},
							],
							signingOptions: {
								draw: true,
								type: true,
								upload: true,
								phone: false,
								defaultType: SubSigningOptions.DefaultTypeEnum.Type,
							},
							testMode: false,
						}),
						playerDocumentSnapshot,
					])
				)
				.then(([dropboxResponse, playerDocumentSnapshot]) =>
					Promise.all([
						firestore
							.collection(COLLECTIONS.WAIVERS)
							.doc(dropboxResponse.body.signatureRequest!.signatureRequestId!)
							.set({
								player: firestore
									.collection(COLLECTIONS.PLAYERS)
									.doc(playerDocumentSnapshot.id),
							}),
					])
				)
		} catch (e) {
			error(e)
			return e
		}
	}
)

/**
 * When a waiver is signed, update the corresponding `Team` document.
 *
 * Firebase Documentation: {@link https://firebase.google.com/docs/functions/firestore-events?gen=1st#trigger_a_function_when_a_document_is_updated_2 Trigger a function when a document is updated.}
 */

export const SetTeamRegistered_OnPlayerChange = onDocumentUpdated(
	{ document: 'players/{playerId}', region: REGION },

	async (event) => {
		try {
			const firestore = getFirestore()

			const seasonQuerySnapshot = await (
				firestore.collection(COLLECTIONS.SEASONS) as CollectionReference<
					SeasonData,
					DocumentData
				>
			).get()

			const playersNewCurrentSeasonData = (
				event.data?.after.data() as PlayerData
			).seasons.find(
				(item) =>
					item.season.id ==
					seasonQuerySnapshot.docs
						.sort(
							(a, b) => b.data().dateStart.seconds - a.data().dateStart.seconds
						)
						.find((season) => season)?.id
			)

			const playersOldCurrentSeasonData = (
				event.data?.before.data() as PlayerData
			).seasons.find(
				(item) =>
					item.season.id ==
					seasonQuerySnapshot.docs
						.sort(
							(a, b) => b.data().dateStart.seconds - a.data().dateStart.seconds
						)
						.find((season) => season)?.id
			)

			if (!playersNewCurrentSeasonData || !playersOldCurrentSeasonData) return

			if (!playersNewCurrentSeasonData.team) return

			if (
				playersNewCurrentSeasonData.signed !=
					playersOldCurrentSeasonData.signed ||
				playersNewCurrentSeasonData.paid != playersOldCurrentSeasonData.paid
			) {
				const promises = (await playersNewCurrentSeasonData.team.get())
					.data()
					?.roster.map((item) => item.player.get())

				if (!promises) return

				const playerDocumentSnapshots = await Promise.all(promises)

				const registeredPlayers = playerDocumentSnapshots.filter(
					(playerDocumentSnapshot) =>
						playerDocumentSnapshot
							.data()
							?.seasons.find(
								(item) =>
									item.season.id ==
									seasonQuerySnapshot.docs
										.sort(
											(a, b) =>
												b.data().dateStart.seconds - a.data().dateStart.seconds
										)
										.find((season) => season)?.id
							)?.paid &&
						playerDocumentSnapshot
							.data()
							?.seasons.find(
								(item) =>
									item.season.id ==
									seasonQuerySnapshot.docs
										.sort(
											(a, b) =>
												b.data().dateStart.seconds - a.data().dateStart.seconds
										)
										.find((season) => season)?.id
							)?.signed
				)

				console.log(registeredPlayers.map((item) => item.id))
				console.log(`There are ${registeredPlayers.length} registered players`)

				if (registeredPlayers.length >= 10) {
					return playersNewCurrentSeasonData.team.update({
						registered: true,
					})
				} else {
					return playersNewCurrentSeasonData.team.update({
						registered: false,
					})
				}
			}

			return
		} catch (e) {
			error(e)
			return e
		}
	}
)

/**
 * When a team roster changes, update the corresponding `Team` document to reflect the registration status.
 *
 * Firebase Documentation: {@link https://firebase.google.com/docs/functions/firestore-events?gen=1st#trigger_a_function_when_a_document_is_updated_2 Trigger a function when a document is updated.}
 */

export const SetTeamRegistered_OnTeamChange = onDocumentUpdated(
	{ document: 'teams/{teamId}', region: REGION },
	async (event) => {
		try {
			const firestore = getFirestore()

			const seasonQuerySnapshot = await (
				firestore.collection(COLLECTIONS.SEASONS) as CollectionReference<
					SeasonData,
					DocumentData
				>
			).get()

			const newValue = event.data?.after.data() as TeamData
			const previousValue = event.data?.before.data() as TeamData
			const teamRef = event.data?.after.ref as DocumentReference<
				TeamData,
				DocumentData
			>
			if (!teamRef) return

			if (newValue.roster.length != previousValue.roster.length) {
				const teamDocumentSnapshot = await teamRef.get()

				const promises = teamDocumentSnapshot
					.data()
					?.roster.map((item) => item.player.get())

				if (!promises) return

				const playerDocumentSnapshots = await Promise.all(promises)

				const registeredPlayers = playerDocumentSnapshots.filter(
					(playerDocumentSnapshot) =>
						playerDocumentSnapshot
							.data()
							?.seasons.find(
								(item) =>
									item.season.id ==
									seasonQuerySnapshot.docs
										.sort(
											(a, b) =>
												b.data().dateStart.seconds - a.data().dateStart.seconds
										)
										.find((season) => season)?.id
							)?.paid &&
						playerDocumentSnapshot
							.data()
							?.seasons.find(
								(item) =>
									item.season.id ==
									seasonQuerySnapshot.docs
										.sort(
											(a, b) =>
												b.data().dateStart.seconds - a.data().dateStart.seconds
										)
										.find((season) => season)?.id
							)?.signed
				)

				console.log(registeredPlayers.map((item) => item.id))
				console.log(`There are ${registeredPlayers.length} registered players`)

				if (registeredPlayers.length >= 10) {
					return teamRef.update({
						registered: true,
					})
				} else {
					return teamRef.update({
						registered: false,
					})
				}
			}

			return
		} catch (e) {
			error(e)
			return e
		}
	}
)

/**
 * When a team roster changes, update the corresponding `Team` document to reflect the time of the registration status change.
 *
 * Firebase Documentation: {@link https://firebase.google.com/docs/functions/firestore-events?gen=1st#trigger_a_function_when_a_document_is_updated_2 Trigger a function when a document is updated.}
 */

export const SetTeamRegisteredDate_OnTeamRegisteredChange = onDocumentUpdated(
	{ document: 'teams/{teamId}', region: REGION },
	async (event) => {
		try {
			const newValue = event.data?.after.data() as TeamData
			const previousValue = event.data?.before.data() as TeamData
			const teamRef = event.data?.after.ref

			if (newValue.registered != previousValue.registered) {
				return teamRef?.update({
					registeredDate: FieldValue.serverTimestamp(),
				})
			}

			return
		} catch (e) {
			error(e)
			return e
		}
	}
)

// Audited: September 3, 2024.
/**
 * When Dropbox Sign sends a `signature_request_signed` callback event, update the corresponding `Player` document to reflect the signed status.
 *
 * Firebase Documentation: {@link https://firebase.google.com/docs/functions/http-events?gen=1st#trigger_a_function_with_an_http_request_2 Trigger a function with an HTTP request.}
 */

export const dropboxSignHandleWebhookEvents = onRequest(
	{ region: REGION },
	async (req, resp) => {
		try {
			const firestore = getFirestore()

			const data = req.body.toString().match(/\{.*\}/s)[0]

			const callback_data = JSON.parse(data)

			const callback_event = EventCallbackRequest.init(callback_data)

			// Verify that a callback came from Dropbox Sign.
			if (EventCallbackHelper.isValid(DROPBOX_SIGN_API_KEY, callback_event)) {
				if (
					callback_event.event.eventType ==
					EventCallbackRequestEvent.EventTypeEnum.SignatureRequestSigned
				) {
					const signatureRequest = callback_event.signatureRequest

					if (signatureRequest) {
						const signatureRequestId = signatureRequest.signatureRequestId

						if (signatureRequestId) {
							// Update player document - Add team to the player's current season.
							await (
								firestore
									.collection(COLLECTIONS.WAIVERS)
									.doc(signatureRequestId) as DocumentReference<
									WaiverData,
									DocumentData
								>
							)
								.get()
								.then((waiverDocumentSnapshot) =>
									Promise.all([
										waiverDocumentSnapshot,
										(
											firestore.collection(
												COLLECTIONS.SEASONS
											) as CollectionReference<SeasonData, DocumentData>
										).get(),
									])
								)
								.then(([waiverDocumentSnapshot, seasonQuerySnapshot]) =>
									Promise.all([
										waiverDocumentSnapshot,
										seasonQuerySnapshot,
										waiverDocumentSnapshot.data()?.player.get(),
									])
								)
								.then(
									([
										waiverDocumentSnapshot,
										seasonQuerySnapshot,
										playerDocumentSnapshot,
									]) =>
										waiverDocumentSnapshot.data()?.player.update({
											seasons: playerDocumentSnapshot
												?.data()
												?.seasons.map((item) =>
													item.season.id ==
													seasonQuerySnapshot.docs
														.sort(
															(a, b) =>
																b.data().dateStart.seconds -
																a.data().dateStart.seconds
														)
														.find((season) => season)?.id
														? {
																banned: item.banned,
																captain: item.captain,
																paid: item.paid,
																season: item.season,
																signed: true,
																team: item.team,
															}
														: item
												),
										})
								)
						}
					}
				}
			}
		} catch (e) {
			error(e)
		} finally {
			resp.status(200).send('Hello API event received')
		}
	}
)

// Audited: September 3, 2024.
/**
 * When the App user clicks the "Re-Send Waiver Email," use the Dropbox Sign API to send a reminder email for their Signature Request.
 *
 * Firebase Documentation: {@link https://firebase.google.com/docs/functions/callable?gen=2nd#write_and_deploy_the_callable_function Trigger a function with a callable function.}
 */

export const dropboxSignSendReminderEmail = onCall(
	{
		region: REGION,
		cors: ['https://mplswinterleague.com'],
	},
	async (req) => {
		const firestore = getFirestore()
		const dropbox = new SignatureRequestApi()
		dropbox.username = DROPBOX_SIGN_API_KEY

		if (!req.auth?.uid)
			return Promise.reject({ error: 'Invalid authentication.' })

		return (
			firestore
				.collection(COLLECTIONS.PLAYERS)
				.doc(req.auth?.uid) as DocumentReference<PlayerData, DocumentData>
		)
			.get()
			.then((playerDocumentSnapshot) =>
				Promise.all([
					playerDocumentSnapshot,
					(
						firestore
							.collection(COLLECTIONS.WAIVERS)
							.where(FIELDS.PLAYER, '==', playerDocumentSnapshot.ref) as Query<
							WaiverData,
							DocumentData
						>
					).get(),
				])
			)
			.then(([playerDocumentSnapshot, waiverQuerySnapshot]) => {
				const signatureRequestId = waiverQuerySnapshot.docs.find(
					(waiver) => waiver
				)?.id
				const playerDocumentSnapshotData = playerDocumentSnapshot.data()
				if (!signatureRequestId)
					return Promise.reject({ error: 'No waiver found.' })

				if (!playerDocumentSnapshotData)
					return Promise.reject({ error: 'No player found.' })

				return dropbox.signatureRequestRemind(signatureRequestId, {
					emailAddress: playerDocumentSnapshotData.email,
					name: `${playerDocumentSnapshotData.firstname} ${playerDocumentSnapshotData.lastname}`,
				})
			})
			.then((dropboxResponse: returnTypeT<SignatureRequestGetResponse>) => {
				console.log(dropboxResponse)
				return dropboxResponse
			})
			.catch((e: HttpError) => {
				console.log(e)
				throw e
			})
	}
)

//////////////////////////////////////////////////////////////////////////////
// IMPORTED FUNCTIONS
//////////////////////////////////////////////////////////////////////////////

// Player Functions
export { createPlayer, updatePlayer, deletePlayer } from './playerFunctions.js'

// Team Functions
export {
	createTeam,
	deleteTeam,
	manageTeamPlayer,
	editTeam,
} from './teamFunctions.js'

// Offer Functions
export {
	createOffer,
	cleanupOffers,
	onOfferUpdated,
	updateOfferStatus,
} from './offerFunctions.js'

// Storage Functions
export {
	getUploadUrl,
	getDownloadUrl,
	getFileMetadata,
} from './storageFunctions.js'
