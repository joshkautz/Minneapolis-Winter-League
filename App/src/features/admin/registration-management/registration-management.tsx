/**
 * Registration Management admin component
 *
 * Allows administrators to view players who are registered but not on a team,
 * and players who are on a team but not fully registered
 */

import { useState, useEffect, useMemo } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument, useCollection } from 'react-firebase-hooks/firestore'
import { collection, query } from 'firebase/firestore'
import {
	ArrowLeft,
	AlertTriangle,
	Users,
	Loader2,
	ArrowUpDown,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { auth } from '@/firebase/auth'
import { firestore } from '@/firebase/app'
import { getPlayerRef } from '@/firebase/collections/players'
import { seasonsQuery } from '@/firebase/collections/seasons'
import { useSeasonsContext } from '@/providers'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { PageContainer, PageHeader } from '@/shared/components'
import { PlayerDocument, SeasonDocument, Collections } from '@/types'

type SortField = 'name' | 'email' | 'paid' | 'signed' | 'team'
type SortDirection = 'asc' | 'desc'

interface ProcessedPlayer {
	id: string
	firstname: string
	lastname: string
	email: string
	paid: boolean
	signed: boolean
	teamName: string | null
}

const SortIcon = ({
	field,
	currentSort,
}: {
	field: SortField
	currentSort: { field: SortField; direction: SortDirection }
}) => {
	if (currentSort.field !== field) {
		return <ArrowUpDown className='ml-2 h-4 w-4 text-muted-foreground' />
	}
	return (
		<ArrowUpDown
			className={`ml-2 h-4 w-4 ${currentSort.direction === 'asc' ? 'rotate-180' : ''}`}
		/>
	)
}

export const RegistrationManagement = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading] = useDocument(playerRef)
	const [seasonsSnapshot] = useCollection(seasonsQuery())
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const [filterSeasonId, setFilterSeasonId] = useState<string>(
		() => currentSeasonQueryDocumentSnapshot?.id || ''
	)
	const [sortConfig, setSortConfig] = useState<{
		field: SortField
		direction: SortDirection
	}>({ field: 'name', direction: 'asc' })

	// Query all players
	const allPlayersQuery = query(collection(firestore, Collections.PLAYERS))
	const [playersSnapshot, playersLoading] = useCollection(allPlayersQuery)

	useEffect(() => {
		if (currentSeasonQueryDocumentSnapshot?.id && !filterSeasonId) {
			const timer = setTimeout(
				() => setFilterSeasonId(currentSeasonQueryDocumentSnapshot.id),
				0
			)
			return () => clearTimeout(timer)
		}
		return undefined
	}, [currentSeasonQueryDocumentSnapshot?.id, filterSeasonId])

	const isAdmin = playerSnapshot?.data()?.admin || false
	const seasons = seasonsSnapshot?.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	})) as (SeasonDocument & { id: string })[] | undefined

	const isLoading = playerLoading || playersLoading

	// Process players for the selected season
	const allPlayers = useMemo(() => {
		if (!playersSnapshot || !filterSeasonId) {
			return []
		}

		const players: ProcessedPlayer[] = []

		playersSnapshot.docs.forEach((doc) => {
			const playerData = doc.data() as PlayerDocument
			const seasonData = playerData.seasons?.find(
				(s) => s.season.id === filterSeasonId
			)

			if (!seasonData) {
				// Player is not in this season at all
				return
			}

			const hasPaid = seasonData.paid || false
			const hasSigned = seasonData.signed || false
			const hasTeam = !!seasonData.team

			// Only include players who have paid, signed, or are on a team
			if (!hasPaid && !hasSigned && !hasTeam) {
				return
			}

			players.push({
				id: doc.id,
				firstname: playerData.firstname,
				lastname: playerData.lastname,
				email: playerData.email,
				paid: hasPaid,
				signed: hasSigned,
				teamName: seasonData.team?.id || null,
			})
		})

		return players
	}, [playersSnapshot, filterSeasonId])

	// Sorting function
	const sortedPlayers = useMemo(() => {
		return [...allPlayers].sort((a, b) => {
			let compareValue = 0

			switch (sortConfig.field) {
				case 'name': {
					const nameA = `${a.lastname} ${a.firstname}`.toLowerCase()
					const nameB = `${b.lastname} ${b.firstname}`.toLowerCase()
					compareValue = nameA.localeCompare(nameB)
					break
				}
				case 'email':
					compareValue = a.email
						.toLowerCase()
						.localeCompare(b.email.toLowerCase())
					break
				case 'paid':
					compareValue = (a.paid ? 1 : 0) - (b.paid ? 1 : 0)
					break
				case 'signed':
					compareValue = (a.signed ? 1 : 0) - (b.signed ? 1 : 0)
					break
				case 'team':
					compareValue = (a.teamName ? 1 : 0) - (b.teamName ? 1 : 0)
					break
			}

			return sortConfig.direction === 'asc' ? compareValue : -compareValue
		})
	}, [allPlayers, sortConfig])

	const toggleSort = (field: SortField) => {
		if (sortConfig.field === field) {
			setSortConfig({
				field,
				direction: sortConfig.direction === 'asc' ? 'desc' : 'asc',
			})
		} else {
			setSortConfig({ field, direction: 'asc' })
		}
	}

	if (playerLoading) {
		return (
			<PageContainer>
				<div className='flex justify-center items-center h-64'>
					<p>Loading...</p>
				</div>
			</PageContainer>
		)
	}

	if (!isAdmin) {
		return (
			<PageContainer>
				<Card>
					<CardContent className='pt-6'>
						<div className='flex items-center justify-center gap-2 text-red-600 mb-4'>
							<AlertTriangle className='h-6 w-6' />
							<h2 className='text-xl font-semibold'>Access Denied</h2>
						</div>
						<p className='text-muted-foreground text-center'>
							You don't have permission to access registration management.
						</p>
					</CardContent>
				</Card>
			</PageContainer>
		)
	}

	if (isLoading) {
		return (
			<PageContainer>
				<div className='flex justify-center items-center h-64'>
					<p>Loading registration data...</p>
				</div>
			</PageContainer>
		)
	}

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title='Registration Management'
				description='View players registered without teams and players on teams without registration'
				icon={Users}
			/>

			{/* Back to Dashboard */}
			<div className='flex items-center justify-between'>
				<Button variant='outline' asChild>
					<Link to='/admin'>
						<ArrowLeft className='h-4 w-4 mr-2' />
						Back to Admin Dashboard
					</Link>
				</Button>
			</div>

			{/* All Players Table */}
			<Card>
				<CardHeader>
					<div className='flex items-center justify-between'>
						<div>
							<CardTitle className='flex items-center gap-2'>
								<Users className='h-5 w-5 text-purple-600' />
								Players ({sortedPlayers.length})
							</CardTitle>
							<CardDescription>
								View and manage all players in the system
							</CardDescription>
						</div>
						<Select
							value={filterSeasonId}
							onValueChange={(value) => setFilterSeasonId(value)}
						>
							<SelectTrigger>
								<SelectValue placeholder='Filter by season' />
							</SelectTrigger>
							<SelectContent>
								{seasons?.map((season) => (
									<SelectItem key={season.id} value={season.id}>
										{season.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</CardHeader>
				<CardContent>
					{playersLoading ? (
						<div className='text-center py-12'>
							<Loader2 className='h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground' />
							<p className='text-muted-foreground'>Loading players...</p>
						</div>
					) : sortedPlayers.length === 0 ? (
						<div className='text-center py-12'>
							<Users className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
							<p className='text-lg font-medium text-muted-foreground'>
								No Players Found
							</p>
							<p className='text-sm text-muted-foreground mt-2'>
								No players have paid, signed, or joined a team for this season.
							</p>
						</div>
					) : (
						<div className='overflow-x-auto'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>
											<Button
												variant='ghost'
												onClick={() => toggleSort('name')}
												className='h-auto p-0 hover:bg-transparent'
											>
												Name
												<SortIcon field='name' currentSort={sortConfig} />
											</Button>
										</TableHead>
										<TableHead>
											<Button
												variant='ghost'
												onClick={() => toggleSort('email')}
												className='h-auto p-0 hover:bg-transparent'
											>
												Email
												<SortIcon field='email' currentSort={sortConfig} />
											</Button>
										</TableHead>
										<TableHead>
											<Button
												variant='ghost'
												onClick={() => toggleSort('paid')}
												className='h-auto p-0 hover:bg-transparent'
											>
												Paid
												<SortIcon field='paid' currentSort={sortConfig} />
											</Button>
										</TableHead>
										<TableHead>
											<Button
												variant='ghost'
												onClick={() => toggleSort('signed')}
												className='h-auto p-0 hover:bg-transparent'
											>
												Signed
												<SortIcon field='signed' currentSort={sortConfig} />
											</Button>
										</TableHead>
										<TableHead>
											<Button
												variant='ghost'
												onClick={() => toggleSort('team')}
												className='h-auto p-0 hover:bg-transparent'
											>
												On Team
												<SortIcon field='team' currentSort={sortConfig} />
											</Button>
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{sortedPlayers.map((player) => (
										<TableRow key={player.id}>
											<TableCell className='font-medium'>
												{player.firstname} {player.lastname}
											</TableCell>
											<TableCell>{player.email}</TableCell>
											<TableCell>
												{player.paid ? (
													<span className='text-green-600 font-medium'>
														✓ Yes
													</span>
												) : (
													<span className='text-muted-foreground'>✗ No</span>
												)}
											</TableCell>
											<TableCell>
												{player.signed ? (
													<span className='text-green-600 font-medium'>
														✓ Yes
													</span>
												) : (
													<span className='text-muted-foreground'>✗ No</span>
												)}
											</TableCell>
											<TableCell>
												{player.teamName ? (
													<span className='text-green-600 font-medium'>
														✓ Yes
													</span>
												) : (
													<span className='text-muted-foreground'>✗ No</span>
												)}
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
