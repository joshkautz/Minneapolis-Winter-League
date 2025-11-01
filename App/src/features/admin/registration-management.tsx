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

type SortField = 'name' | 'email'
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

export function RegistrationManagement() {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading] = useDocument(playerRef)
	const [seasonsSnapshot] = useCollection(seasonsQuery())
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const [filterSeasonId, setFilterSeasonId] = useState<string>(
		() => currentSeasonQueryDocumentSnapshot?.id || ''
	)
	const [registeredNoTeamSort, setRegisteredNoTeamSort] = useState<{
		field: SortField
		direction: SortDirection
	}>({ field: 'name', direction: 'asc' })
	const [onTeamNotRegisteredSort, setOnTeamNotRegisteredSort] = useState<{
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
	const { registeredNoTeam, onTeamNotRegistered } = useMemo(() => {
		if (!playersSnapshot || !filterSeasonId) {
			return { registeredNoTeam: [], onTeamNotRegistered: [] }
		}

		const registered: ProcessedPlayer[] = []
		const onTeam: ProcessedPlayer[] = []

		playersSnapshot.docs.forEach((doc) => {
			const playerData = doc.data() as PlayerDocument
			const seasonData = playerData.seasons?.find(
				(s) => s.season.id === filterSeasonId
			)

			if (!seasonData) {
				// Player is not in this season at all
				return
			}

			const playerInfo: ProcessedPlayer = {
				id: doc.id,
				firstname: playerData.firstname,
				lastname: playerData.lastname,
				email: playerData.email,
				paid: seasonData.paid || false,
				signed: seasonData.signed || false,
				teamName: seasonData.team?.id || null,
			}

			// Registered (paid or signed) but no team - for reimbursement tracking
			if ((seasonData.paid || seasonData.signed) && !seasonData.team) {
				registered.push(playerInfo)
			}

			// On a team but not fully registered (not both paid AND signed)
			if (seasonData.team && !(seasonData.paid && seasonData.signed)) {
				onTeam.push(playerInfo)
			}
		})

		return { registeredNoTeam: registered, onTeamNotRegistered: onTeam }
	}, [playersSnapshot, filterSeasonId])

	// Sorting functions
	const sortPlayers = (
		players: ProcessedPlayer[],
		field: SortField,
		direction: SortDirection
	): ProcessedPlayer[] => {
		return [...players].sort((a, b) => {
			let compareValue = 0

			if (field === 'name') {
				const nameA = `${a.lastname} ${a.firstname}`.toLowerCase()
				const nameB = `${b.lastname} ${b.firstname}`.toLowerCase()
				compareValue = nameA.localeCompare(nameB)
			} else if (field === 'email') {
				compareValue = a.email
					.toLowerCase()
					.localeCompare(b.email.toLowerCase())
			}

			return direction === 'asc' ? compareValue : -compareValue
		})
	}

	const toggleSort = (
		currentSort: { field: SortField; direction: SortDirection },
		setSortFn: React.Dispatch<
			React.SetStateAction<{ field: SortField; direction: SortDirection }>
		>,
		field: SortField
	) => {
		if (currentSort.field === field) {
			setSortFn({
				field,
				direction: currentSort.direction === 'asc' ? 'desc' : 'asc',
			})
		} else {
			setSortFn({ field, direction: 'asc' })
		}
	}

	const sortedRegisteredNoTeam = sortPlayers(
		registeredNoTeam,
		registeredNoTeamSort.field,
		registeredNoTeamSort.direction
	)

	const sortedOnTeamNotRegistered = sortPlayers(
		onTeamNotRegistered,
		onTeamNotRegisteredSort.field,
		onTeamNotRegisteredSort.direction
	)

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

			{/* Back to Dashboard and Season Filter */}
			<div className='flex items-center justify-between'>
				<Button variant='outline' asChild>
					<Link to='/admin'>
						<ArrowLeft className='h-4 w-4 mr-2' />
						Back to Admin Dashboard
					</Link>
				</Button>
				<div className='w-64'>
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
			</div>

			{/* Registered Players Without Teams */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Users className='h-5 w-5 text-green-600' />
						Registered Players Without Teams ({sortedRegisteredNoTeam.length})
					</CardTitle>
					<CardDescription>
						Players who have paid and/or signed but are not assigned to a team
						(for reimbursement tracking)
					</CardDescription>
				</CardHeader>
				<CardContent>
					{playersLoading ? (
						<div className='text-center py-12'>
							<Loader2 className='h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground' />
							<p className='text-muted-foreground'>Loading players...</p>
						</div>
					) : sortedRegisteredNoTeam.length === 0 ? (
						<div className='text-center py-12'>
							<Users className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
							<p className='text-lg font-medium text-muted-foreground'>
								No Registered Players Without Teams
							</p>
							<p className='text-sm text-muted-foreground mt-2'>
								All registered players are assigned to teams.
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
												onClick={() =>
													toggleSort(
														registeredNoTeamSort,
														setRegisteredNoTeamSort,
														'name'
													)
												}
												className='h-auto p-0 hover:bg-transparent'
											>
												Name
												<SortIcon
													field='name'
													currentSort={registeredNoTeamSort}
												/>
											</Button>
										</TableHead>
										<TableHead>
											<Button
												variant='ghost'
												onClick={() =>
													toggleSort(
														registeredNoTeamSort,
														setRegisteredNoTeamSort,
														'email'
													)
												}
												className='h-auto p-0 hover:bg-transparent'
											>
												Email
												<SortIcon
													field='email'
													currentSort={registeredNoTeamSort}
												/>
											</Button>
										</TableHead>
										<TableHead>Paid</TableHead>
										<TableHead>Signed</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{sortedRegisteredNoTeam.map((player) => (
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
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Players On Teams But Not Registered */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Users className='h-5 w-5 text-orange-600' />
						Players On Teams But Not Fully Registered (
						{sortedOnTeamNotRegistered.length})
					</CardTitle>
					<CardDescription>
						Players who are assigned to teams but haven't completed both payment
						and waiver signing
					</CardDescription>
				</CardHeader>
				<CardContent>
					{playersLoading ? (
						<div className='text-center py-12'>
							<Loader2 className='h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground' />
							<p className='text-muted-foreground'>Loading players...</p>
						</div>
					) : sortedOnTeamNotRegistered.length === 0 ? (
						<div className='text-center py-12'>
							<Users className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
							<p className='text-lg font-medium text-muted-foreground'>
								No Unregistered Players On Teams
							</p>
							<p className='text-sm text-muted-foreground mt-2'>
								All players on teams have completed registration.
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
												onClick={() =>
													toggleSort(
														onTeamNotRegisteredSort,
														setOnTeamNotRegisteredSort,
														'name'
													)
												}
												className='h-auto p-0 hover:bg-transparent'
											>
												Name
												<SortIcon
													field='name'
													currentSort={onTeamNotRegisteredSort}
												/>
											</Button>
										</TableHead>
										<TableHead>
											<Button
												variant='ghost'
												onClick={() =>
													toggleSort(
														onTeamNotRegisteredSort,
														setOnTeamNotRegisteredSort,
														'email'
													)
												}
												className='h-auto p-0 hover:bg-transparent'
											>
												Email
												<SortIcon
													field='email'
													currentSort={onTeamNotRegisteredSort}
												/>
											</Button>
										</TableHead>
										<TableHead>Paid</TableHead>
										<TableHead>Signed</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{sortedOnTeamNotRegistered.map((player) => (
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
													<span className='text-orange-600 font-medium'>
														✗ No
													</span>
												)}
											</TableCell>
											<TableCell>
												{player.signed ? (
													<span className='text-green-600 font-medium'>
														✓ Yes
													</span>
												) : (
													<span className='text-orange-600 font-medium'>
														✗ No
													</span>
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
