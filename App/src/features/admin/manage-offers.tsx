/**
 * Manage Offers admin component
 *
 * Displays and manages all outstanding offers
 */

import React, { useState, useEffect } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument, useCollection } from 'react-firebase-hooks/firestore'
import { getDoc } from 'firebase/firestore'
import {
	ArrowLeft,
	AlertTriangle,
	Mail,
	Users,
	Calendar,
	UserPlus,
	UserCheck,
	CheckCircle,
	XCircle,
	Ban,
	Loader2,
	ArrowUp,
	ArrowDown,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { auth } from '@/firebase/auth'
import { getPlayerRef } from '@/firebase/collections/players'
import { allPendingOffersQuery } from '@/firebase/collections/offers'
import { updateOfferStatusViaFunction } from '@/firebase/collections/functions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageContainer, PageHeader } from '@/shared/components'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { OfferDocument, OfferType, logger } from '@/shared/utils'

interface ProcessedOffer {
	id: string
	playerName: string
	playerEmail: string
	teamName: string
	teamId: string
	offerType: OfferType
	createdAt: Date
	createdByName: string
	seasonName: string
}

type SortColumn =
	| 'type'
	| 'player'
	| 'team'
	| 'season'
	| 'createdBy'
	| 'created'
type SortDirection = 'asc' | 'desc'

interface SortableColumnHeaderProps {
	children: React.ReactNode
	column: SortColumn
	currentSortColumn: SortColumn
	currentSortDirection: SortDirection
	onSort: (column: SortColumn) => void
}

const SortableColumnHeader: React.FC<SortableColumnHeaderProps> = ({
	children,
	column,
	currentSortColumn,
	currentSortDirection,
	onSort,
}) => {
	const isSorted = currentSortColumn === column

	const handleClick = () => {
		onSort(column)
	}

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault()
			onSort(column)
		}
	}

	return (
		<TableHead>
			<button
				type='button'
				onClick={handleClick}
				onKeyDown={handleKeyDown}
				className='flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm px-1 -mx-1'
				aria-sort={
					isSorted
						? currentSortDirection === 'asc'
							? 'ascending'
							: 'descending'
						: 'none'
				}
			>
				<span>{children}</span>
				{isSorted && (
					<span className='ml-1' aria-hidden='true'>
						{currentSortDirection === 'asc' ? (
							<ArrowUp className='h-3 w-3' />
						) : (
							<ArrowDown className='h-3 w-3' />
						)}
					</span>
				)}
			</button>
		</TableHead>
	)
}

export const ManageOffers: React.FC = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading] = useDocument(playerRef)

	const isAdmin = playerSnapshot?.data()?.admin || false

	// Fetch all pending offers
	const [offersSnapshot, offersLoading] = useCollection(allPendingOffersQuery())

	// Use state to hold the resolved offers
	const [offers, setOffers] = useState<ProcessedOffer[]>([])
	const [isProcessing, setIsProcessing] = useState(false)

	// Track which offer is currently being updated
	const [updatingOfferId, setUpdatingOfferId] = useState<string | null>(null)

	// Sorting state
	const [sortColumn, setSortColumn] = useState<SortColumn>('created')
	const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

	// Sorted offers
	const [sortedOffers, setSortedOffers] = useState<ProcessedOffer[]>([])

	// Handle sorting
	const handleSort = (column: SortColumn) => {
		if (sortColumn === column) {
			// Toggle direction if same column
			setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
		} else {
			// New column, default to ascending (except for 'created' which defaults to descending)
			setSortColumn(column)
			setSortDirection(column === 'created' ? 'desc' : 'asc')
		}
	}

	// Sort offers whenever offers or sort state changes
	useEffect(() => {
		const sorted = [...offers].sort((a, b) => {
			let comparison = 0

			switch (sortColumn) {
				case 'type':
					comparison = a.offerType.localeCompare(b.offerType)
					break
				case 'player':
					comparison = a.playerName.localeCompare(b.playerName)
					break
				case 'team':
					comparison = a.teamName.localeCompare(b.teamName)
					break
				case 'season':
					comparison = a.seasonName.localeCompare(b.seasonName)
					break
				case 'createdBy':
					comparison = a.createdByName.localeCompare(b.createdByName)
					break
				case 'created':
					comparison = a.createdAt.getTime() - b.createdAt.getTime()
					break
				default:
					comparison = 0
			}

			return sortDirection === 'asc' ? comparison : -comparison
		})

		setSortedOffers(sorted)
	}, [offers, sortColumn, sortDirection])

	// Process offers to resolve references
	useEffect(() => {
		if (!offersSnapshot) {
			setOffers([])
			setIsProcessing(false)
			return
		}

		setIsProcessing(true)

		const processOffers = async () => {
			const results = await Promise.all(
				offersSnapshot.docs.map(async (offerDoc) => {
					const offerData = offerDoc.data() as OfferDocument
					const offerId = offerDoc.id

					try {
						// Fetch player data
						const playerDoc = await getDoc(offerData.player)
						const playerData = playerDoc.data()
						const playerName = playerData
							? `${playerData.firstname} ${playerData.lastname}`
							: 'Unknown Player'
						const playerEmail = playerData?.email || 'N/A'

						// Fetch team data
						const teamDoc = await getDoc(offerData.team)
						const teamData = teamDoc.data()
						const teamName = teamData?.name || 'Unknown Team'
						const teamId = teamDoc.id

						// Fetch creator data (if exists)
						let createdByName = 'System'
						if (offerData.createdBy) {
							try {
								const creatorDoc = await getDoc(offerData.createdBy)
								const creatorData = creatorDoc.data()
								if (creatorData) {
									createdByName = `${creatorData.firstname} ${creatorData.lastname}`
								}
							} catch (_error) {
								logger.warn('Failed to fetch creator data', {
									component: 'ManageOffers',
									action: 'fetchCreatorData',
								})
							}
						}

						// Fetch season data
						const seasonDoc = await getDoc(offerData.season)
						const seasonData = seasonDoc.data()
						const seasonName = seasonData?.name || 'Unknown Season'

						return {
							id: offerId,
							playerName,
							playerEmail,
							teamName,
							teamId,
							offerType: offerData.type,
							createdAt: offerData.createdAt.toDate(),
							createdByName,
							seasonName,
						} as ProcessedOffer
					} catch (error) {
						logger.error(
							'Error processing offer',
							error instanceof Error ? error : undefined,
							{ component: 'ManageOffers', action: 'processOffer', offerId }
						)
						return null
					}
				})
			)

			// Filter out nulls
			const validOffers = results.filter((r): r is ProcessedOffer => r !== null)
			setOffers(validOffers)
			setIsProcessing(false)
		}

		processOffers()
	}, [offersSnapshot])

	const formatDate = (date: Date) => {
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		})
	}

	const formatTime = (date: Date) => {
		return date.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
		})
	}

	// Handle offer status update
	const handleUpdateOfferStatus = async (
		offerId: string,
		status: 'accepted' | 'rejected' | 'canceled',
		offerType: string
	) => {
		try {
			setUpdatingOfferId(offerId)

			await updateOfferStatusViaFunction({
				offerId,
				status,
			})

			toast.success(
				`${offerType === 'invitation' ? 'Invitation' : 'Request'} ${status} successfully`
			)

			// The useCollection hook will automatically update with the new data
		} catch (error) {
			logger.error(
				'Error updating offer status',
				error instanceof Error ? error : undefined,
				{ component: 'ManageOffers', action: 'updateOfferStatus', offerId }
			)
			toast.error(
				error instanceof Error ? error.message : 'Failed to update offer status'
			)
		} finally {
			setUpdatingOfferId(null)
		}
	}

	// Handle authentication and data loading
	if (playerLoading) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<Card>
					<CardContent className='p-6 text-center'>
						<p>Loading...</p>
					</CardContent>
				</Card>
			</div>
		)
	}

	// Handle non-admin users
	if (!isAdmin) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<Card>
					<CardContent className='p-6 text-center'>
						<div className='flex items-center justify-center gap-2 text-red-600 mb-4'>
							<AlertTriangle className='h-6 w-6' />
							<h2 className='text-xl font-semibold'>Access Denied</h2>
						</div>
						<p className='text-muted-foreground'>
							You don't have permission to access the admin dashboard.
						</p>
					</CardContent>
				</Card>
			</div>
		)
	}

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title='Manage Offers'
				description='View and manage all team invitations and join requests'
				icon={Users}
			/>

			{/* Back to Dashboard */}
			<div>
				<Button variant='outline' asChild>
					<Link to='/admin'>
						<ArrowLeft className='h-4 w-4 mr-2' />
						Back to Admin Dashboard
					</Link>
				</Button>
			</div>

			{/* Offers Table */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Mail className='h-5 w-5 text-orange-600' />
						Pending Offers ({sortedOffers.length})
					</CardTitle>
				</CardHeader>
				<CardContent>
					{offersLoading || isProcessing ? (
						<div className='text-center py-12'>
							<p className='text-muted-foreground'>Loading offers...</p>
						</div>
					) : offers.length === 0 ? (
						<div className='text-center py-12'>
							<UserCheck className='h-12 w-12 text-green-500 mx-auto mb-4' />
							<p className='text-lg font-medium text-muted-foreground'>
								No Pending Offers
							</p>
							<p className='text-sm text-muted-foreground mt-2'>
								All offers have been processed or no offers exist.
							</p>
						</div>
					) : (
						<div className='overflow-x-auto'>
							<Table>
								<TableHeader>
									<TableRow>
										<SortableColumnHeader
											column='type'
											currentSortColumn={sortColumn}
											currentSortDirection={sortDirection}
											onSort={handleSort}
										>
											Type
										</SortableColumnHeader>
										<SortableColumnHeader
											column='player'
											currentSortColumn={sortColumn}
											currentSortDirection={sortDirection}
											onSort={handleSort}
										>
											Player
										</SortableColumnHeader>
										<SortableColumnHeader
											column='team'
											currentSortColumn={sortColumn}
											currentSortDirection={sortDirection}
											onSort={handleSort}
										>
											Team
										</SortableColumnHeader>
										<SortableColumnHeader
											column='season'
											currentSortColumn={sortColumn}
											currentSortDirection={sortDirection}
											onSort={handleSort}
										>
											Season
										</SortableColumnHeader>
										<SortableColumnHeader
											column='createdBy'
											currentSortColumn={sortColumn}
											currentSortDirection={sortDirection}
											onSort={handleSort}
										>
											Created By
										</SortableColumnHeader>
										<SortableColumnHeader
											column='created'
											currentSortColumn={sortColumn}
											currentSortDirection={sortDirection}
											onSort={handleSort}
										>
											Created
										</SortableColumnHeader>
										<TableHead>Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{sortedOffers.map((offer) => (
										<TableRow key={offer.id}>
											<TableCell>
												<Badge
													variant={
														offer.offerType === OfferType.INVITATION
															? 'default'
															: 'secondary'
													}
													className={
														offer.offerType === OfferType.INVITATION
															? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
															: 'bg-purple-100 text-purple-800 hover:bg-purple-200'
													}
												>
													{offer.offerType === OfferType.INVITATION ? (
														<>
															<UserPlus className='h-3 w-3 mr-1' />
															Invitation
														</>
													) : (
														<>
															<UserCheck className='h-3 w-3 mr-1' />
															Request
														</>
													)}
												</Badge>
											</TableCell>
											<TableCell>
												<div>
													<div className='font-medium'>{offer.playerName}</div>
													<div className='text-sm text-muted-foreground flex items-center gap-1'>
														<Mail className='h-3 w-3' />
														{offer.playerEmail}
													</div>
												</div>
											</TableCell>
											<TableCell>
												<Link
													to={`/teams/${offer.teamId}`}
													className='text-blue-600 hover:underline font-medium'
												>
													{offer.teamName}
												</Link>
											</TableCell>
											<TableCell>
												<div className='text-sm'>{offer.seasonName}</div>
											</TableCell>
											<TableCell>
												<div className='text-sm'>{offer.createdByName}</div>
											</TableCell>
											<TableCell>
												<div className='text-sm'>
													<div className='flex items-center gap-1'>
														<Calendar className='h-3 w-3 text-muted-foreground' />
														{formatDate(offer.createdAt)}
													</div>
													<div className='text-xs text-muted-foreground'>
														{formatTime(offer.createdAt)}
													</div>
												</div>
											</TableCell>
											<TableCell>
												<div className='flex items-center gap-2'>
													{updatingOfferId === offer.id ? (
														<div className='flex items-center gap-2 text-muted-foreground'>
															<Loader2 className='h-4 w-4 animate-spin' />
															<span className='text-xs'>Updating...</span>
														</div>
													) : (
														<>
															<Button
																size='sm'
																variant='default'
																className='h-7 gap-1 bg-green-600 hover:bg-green-700'
																onClick={() =>
																	handleUpdateOfferStatus(
																		offer.id,
																		'accepted',
																		offer.offerType
																	)
																}
																disabled={updatingOfferId !== null}
															>
																<CheckCircle className='h-3 w-3' />
																Accept
															</Button>
															<Button
																size='sm'
																variant='destructive'
																className='h-7 gap-1'
																onClick={() =>
																	handleUpdateOfferStatus(
																		offer.id,
																		'rejected',
																		offer.offerType
																	)
																}
																disabled={updatingOfferId !== null}
															>
																<XCircle className='h-3 w-3' />
																Reject
															</Button>
															<Button
																size='sm'
																variant='outline'
																className='h-7 gap-1'
																onClick={() =>
																	handleUpdateOfferStatus(
																		offer.id,
																		'canceled',
																		offer.offerType
																	)
																}
																disabled={updatingOfferId !== null}
															>
																<Ban className='h-3 w-3' />
																Cancel
															</Button>
														</>
													)}
												</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>
		</PageContainer>
	)
}
