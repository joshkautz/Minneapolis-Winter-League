/**
 * Swiss Rankings admin component
 *
 * Allows admin users to view Swiss rankings and manage initial seeding
 */

import { useState, useEffect, useMemo } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument } from 'react-firebase-hooks/firestore'
import {
	ArrowLeft,
	AlertTriangle,
	Trophy,
	Loader2,
	GripVertical,
	Save,
	Info,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { auth } from '@/firebase/auth'
import { logger, cn } from '@/shared/utils'
import { useQueryErrorHandler } from '@/shared/hooks'
import { getPlayerRef } from '@/firebase/collections/players'
import { useSeasonsContext } from '@/providers'
import { teamsBySeasonQuery } from '@/firebase/collections/teams'
import { getDocs } from 'firebase/firestore'
import {
	getSwissRankingsViaFunction,
	setSwissSeedingViaFunction,
	SwissRanking,
} from '@/firebase/collections/functions'
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { SeasonDocument, SeasonFormat, TeamDocument } from '@/types'

/**
 * Swiss matchup pattern for 12 teams across 3 fields
 * Each cell shows [seed vs seed]
 */
const SWISS_MATCHUP_PATTERN = [
	{ round: 1, fieldA: [1, 2], fieldB: [6, 5], fieldC: [7, 8] },
	{ round: 2, fieldA: [1, 3], fieldB: [6, 10], fieldC: [7, 11] },
	{ round: 3, fieldA: [2, 4], fieldB: [5, 9], fieldC: [8, 12] },
	{ round: 4, fieldA: [3, 4], fieldB: [9, 10], fieldC: [11, 12] },
]

export const SwissRankings = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading, playerError] = useDocument(playerRef)

	const isAdmin = playerSnapshot?.data()?.admin || false

	// Get seasons from context
	const { seasonsQuerySnapshot, seasonsQuerySnapshotLoading } =
		useSeasonsContext()

	// Log and notify on query errors
	useQueryErrorHandler({
		error: playerError,
		component: 'SwissRankings',
		errorLabel: 'player',
	})

	// State
	const [selectedSeasonId, setSelectedSeasonId] = useState<string>('')
	const [rankings, setRankings] = useState<SwissRanking[]>([])
	const [gamesPlayed, setGamesPlayed] = useState(0)
	const [isLoadingRankings, setIsLoadingRankings] = useState(false)
	const [swissInitialSeeding, setSwissInitialSeeding] = useState<
		string[] | null
	>(null)

	// Seeding mode state
	const [seedingOrder, setSeedingOrder] = useState<string[]>([])
	const [isSavingSeeding, setIsSavingSeeding] = useState(false)

	// Teams for the selected season (fetched separately from global context)
	const [seasonTeams, setSeasonTeams] = useState<Map<string, TeamDocument>>(
		new Map()
	)
	const [isLoadingTeams, setIsLoadingTeams] = useState(false)

	// Filter to only Swiss seasons
	const swissSeasons = useMemo(() => {
		if (!seasonsQuerySnapshot) return []
		return seasonsQuerySnapshot.docs
			.filter((doc) => {
				const data = doc.data() as SeasonDocument
				return data.format === SeasonFormat.SWISS
			})
			.map((doc) => ({
				id: doc.id,
				name: (doc.data() as SeasonDocument).name,
				ref: doc.ref,
			}))
	}, [seasonsQuerySnapshot])

	// Load teams for selected season
	useEffect(() => {
		if (!selectedSeasonId) {
			setSeasonTeams(new Map())
			return
		}

		const selectedSeason = swissSeasons.find((s) => s.id === selectedSeasonId)
		if (!selectedSeason) return

		const loadTeams = async () => {
			setIsLoadingTeams(true)
			try {
				const teamsQuery = teamsBySeasonQuery(selectedSeason.ref)
				if (teamsQuery) {
					const teamsSnapshot = await getDocs(teamsQuery)
					const map = new Map<string, TeamDocument>()
					teamsSnapshot.docs.forEach((doc) => {
						map.set(doc.id, doc.data())
					})
					setSeasonTeams(map)
				}
			} catch (error) {
				logger.error('Error loading teams for season:', error)
			} finally {
				setIsLoadingTeams(false)
			}
		}

		loadTeams()
	}, [selectedSeasonId, swissSeasons])

	// Use the loaded teams map
	const teamMap = seasonTeams

	// Load rankings when season changes
	useEffect(() => {
		if (!selectedSeasonId || !isAdmin) return

		const loadRankings = async () => {
			setIsLoadingRankings(true)
			try {
				const result = await getSwissRankingsViaFunction({
					seasonId: selectedSeasonId,
				})
				setRankings(result.rankings)
				setGamesPlayed(result.gamesPlayed)
				setSwissInitialSeeding(result.swissInitialSeeding)

				// Initialize seeding order from existing seeding or team order
				if (
					result.swissInitialSeeding &&
					result.swissInitialSeeding.length > 0
				) {
					setSeedingOrder(result.swissInitialSeeding)
				} else {
					// Use team order from rankings or fetch all teams
					setSeedingOrder(result.rankings.map((r) => r.teamId))
				}
			} catch (error) {
				logger.error('Error loading Swiss rankings:', error)
				toast.error(
					error instanceof Error
						? error.message
						: 'Failed to load Swiss rankings'
				)
			} finally {
				setIsLoadingRankings(false)
			}
		}

		loadRankings()
	}, [selectedSeasonId, isAdmin])

	// Handle saving seeding
	const handleSaveSeeding = async () => {
		if (!selectedSeasonId || seedingOrder.length === 0) return

		setIsSavingSeeding(true)
		try {
			await setSwissSeedingViaFunction({
				seasonId: selectedSeasonId,
				teamSeeding: seedingOrder,
			})
			setSwissInitialSeeding(seedingOrder)
			toast.success('Seeding saved successfully')
		} catch (error) {
			logger.error('Error saving seeding:', error)
			toast.error(
				error instanceof Error ? error.message : 'Failed to save seeding'
			)
		} finally {
			setIsSavingSeeding(false)
		}
	}

	// Move team up in seeding
	const moveTeamUp = (index: number) => {
		if (index === 0) return
		const newOrder = [...seedingOrder]
		;[newOrder[index - 1], newOrder[index]] = [
			newOrder[index],
			newOrder[index - 1],
		]
		setSeedingOrder(newOrder)
	}

	// Move team down in seeding
	const moveTeamDown = (index: number) => {
		if (index === seedingOrder.length - 1) return
		const newOrder = [...seedingOrder]
		;[newOrder[index], newOrder[index + 1]] = [
			newOrder[index + 1],
			newOrder[index],
		]
		setSeedingOrder(newOrder)
	}

	// Handle authentication and data loading
	if (playerLoading || seasonsQuerySnapshotLoading) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<Card>
					<CardContent className='p-6 text-center'>
						<Loader2 className='h-8 w-8 animate-spin mx-auto mb-4' />
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
							You don't have permission to access this page.
						</p>
					</CardContent>
				</Card>
			</div>
		)
	}

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title='Swiss Rankings'
				description='View rankings and manage seeding for Swiss-format seasons'
				icon={Trophy}
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

			{/* Season Selector */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Trophy className='h-5 w-5 text-amber-600' />
						Select Swiss Season
					</CardTitle>
				</CardHeader>
				<CardContent>
					{swissSeasons.length === 0 ? (
						<Alert>
							<Info className='h-4 w-4' />
							<AlertTitle>No Swiss Seasons</AlertTitle>
							<AlertDescription>
								No Swiss-format seasons have been created yet. Create a season
								with Swiss format in Season Management to get started.
							</AlertDescription>
						</Alert>
					) : (
						<Select
							value={selectedSeasonId}
							onValueChange={setSelectedSeasonId}
						>
							<SelectTrigger className='w-full max-w-sm'>
								<SelectValue placeholder='Select a Swiss season...' />
							</SelectTrigger>
							<SelectContent>
								{swissSeasons.map((season) => (
									<SelectItem key={season.id} value={season.id}>
										{season.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				</CardContent>
			</Card>

			{/* Rankings Table */}
			{selectedSeasonId && (
				<Card>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Trophy className='h-5 w-5 text-yellow-600' />
							Current Rankings
							{gamesPlayed > 0 && (
								<Badge variant='secondary' className='ml-2'>
									{gamesPlayed} games played
								</Badge>
							)}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{isLoadingRankings || isLoadingTeams ? (
							<div className='text-center py-12'>
								<Loader2 className='h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground' />
								<p className='text-muted-foreground'>Loading rankings...</p>
							</div>
						) : rankings.length === 0 ? (
							<div className='text-center py-12'>
								<Trophy className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
								<p className='text-lg font-medium text-muted-foreground'>
									No Rankings Yet
								</p>
								<p className='text-sm text-muted-foreground mt-2'>
									Set initial seeding below, then rankings will appear after
									games are played.
								</p>
							</div>
						) : (
							<div className='overflow-x-auto'>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className='w-16 text-center'>Rank</TableHead>
											<TableHead>Team</TableHead>
											<TableHead className='text-center'>W</TableHead>
											<TableHead className='text-center'>L</TableHead>
											<TableHead className='text-center'>Buchholz</TableHead>
											<TableHead className='text-center'>Swiss Score</TableHead>
											<TableHead className='text-center'>+/-</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{rankings.map((ranking) => {
											const team = teamMap.get(ranking.teamId)
											return (
												<TableRow key={ranking.teamId}>
													<TableCell className='font-medium text-center'>
														{ranking.rank}
													</TableCell>
													<TableCell>
														<div className='flex items-center gap-2'>
															{team?.logo ? (
																<img
																	src={team.logo}
																	alt={team.name}
																	className='w-6 h-6 rounded-full object-cover'
																/>
															) : (
																<div className='w-6 h-6 rounded-full bg-gradient-to-r from-primary to-sky-300' />
															)}
															<span>{team?.name || ranking.teamId}</span>
														</div>
													</TableCell>
													<TableCell className='text-center font-medium'>
														{ranking.wins}
													</TableCell>
													<TableCell className='text-center'>
														{ranking.losses}
													</TableCell>
													<TableCell className='text-center text-muted-foreground'>
														{ranking.buchholzScore}
													</TableCell>
													<TableCell className='text-center font-bold'>
														{ranking.swissScore}
													</TableCell>
													<TableCell
														className={cn(
															'text-center font-medium',
															ranking.pointDifferential > 0 && 'text-green-600',
															ranking.pointDifferential < 0 &&
																'text-destructive'
														)}
													>
														{ranking.pointDifferential > 0 ? '+' : ''}
														{ranking.pointDifferential}
													</TableCell>
												</TableRow>
											)
										})}
									</TableBody>
								</Table>
							</div>
						)}
					</CardContent>
				</Card>
			)}

			{/* Seeding Section */}
			{selectedSeasonId && !isLoadingRankings && !isLoadingTeams && (
				<Card>
					<CardHeader>
						<CardTitle className='flex items-center justify-between'>
							<div className='flex items-center gap-2'>
								<GripVertical className='h-5 w-5 text-blue-600' />
								Initial Seeding
								{swissInitialSeeding && swissInitialSeeding.length > 0 && (
									<Badge variant='outline' className='ml-2'>
										Set
									</Badge>
								)}
							</div>
							<Button
								onClick={handleSaveSeeding}
								disabled={isSavingSeeding || seedingOrder.length === 0}
								size='sm'
							>
								{isSavingSeeding ? (
									<Loader2 className='h-4 w-4 mr-2 animate-spin' />
								) : (
									<Save className='h-4 w-4 mr-2' />
								)}
								Save Seeding
							</Button>
						</CardTitle>
					</CardHeader>
					<CardContent>
						{gamesPlayed > 0 && (
							<Alert className='mb-4'>
								<Info className='h-4 w-4' />
								<AlertTitle>Games Already Played</AlertTitle>
								<AlertDescription>
									{gamesPlayed} game(s) have been played. Changing seeding won't
									affect past game results, only the reference pattern.
								</AlertDescription>
							</Alert>
						)}

						{seedingOrder.length === 0 ? (
							<p className='text-muted-foreground text-center py-8'>
								No teams available for seeding.
							</p>
						) : (
							<div className='space-y-2'>
								{seedingOrder.map((teamId, index) => {
									const team = teamMap.get(teamId)
									return (
										<div
											key={teamId}
											className='flex items-center gap-3 p-3 bg-muted/50 rounded-lg'
										>
											<span className='w-8 text-center font-bold text-muted-foreground'>
												{index + 1}
											</span>
											<div className='flex items-center gap-2 flex-1'>
												{team?.logo ? (
													<img
														src={team.logo}
														alt={team.name}
														className='w-6 h-6 rounded-full object-cover'
													/>
												) : (
													<div className='w-6 h-6 rounded-full bg-gradient-to-r from-primary to-sky-300' />
												)}
												<span>{team?.name || teamId}</span>
											</div>
											<div className='flex gap-1'>
												<Button
													variant='outline'
													size='sm'
													onClick={() => moveTeamUp(index)}
													disabled={index === 0}
												>
													<span className='sr-only'>Move up</span>
													<span aria-hidden='true'>&#9650;</span>
												</Button>
												<Button
													variant='outline'
													size='sm'
													onClick={() => moveTeamDown(index)}
													disabled={index === seedingOrder.length - 1}
												>
													<span className='sr-only'>Move down</span>
													<span aria-hidden='true'>&#9660;</span>
												</Button>
											</div>
										</div>
									)
								})}
							</div>
						)}
					</CardContent>
				</Card>
			)}

			{/* Matchup Pattern Reference */}
			{selectedSeasonId && !isLoadingRankings && !isLoadingTeams && (
				<Card>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Info className='h-5 w-5 text-gray-600' />
							Swiss Matchup Pattern (Reference)
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className='text-sm text-muted-foreground mb-4'>
							Use this pattern to manually create games. Seeds are based on
							current Swiss rankings after each round.
						</p>
						<div className='overflow-x-auto'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className='w-20'>Round</TableHead>
										<TableHead className='text-center'>Field A (Red)</TableHead>
										<TableHead className='text-center'>
											Field B (Blue)
										</TableHead>
										<TableHead className='text-center'>
											Field C (Green)
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{SWISS_MATCHUP_PATTERN.map((row) => (
										<TableRow key={row.round}>
											<TableCell className='font-medium'>
												Round {row.round}
											</TableCell>
											<TableCell className='text-center'>
												<Badge variant='outline'>
													Seed {row.fieldA[0]} vs Seed {row.fieldA[1]}
												</Badge>
											</TableCell>
											<TableCell className='text-center'>
												<Badge variant='outline'>
													Seed {row.fieldB[0]} vs Seed {row.fieldB[1]}
												</Badge>
											</TableCell>
											<TableCell className='text-center'>
												<Badge variant='outline'>
													Seed {row.fieldC[0]} vs Seed {row.fieldC[1]}
												</Badge>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
						<p className='text-xs text-muted-foreground mt-4'>
							After each round, re-rank teams using Swiss formula (Wins × 2 +
							Buchholz) and use new rankings for next round's matchups.
						</p>
					</CardContent>
				</Card>
			)}
		</PageContainer>
	)
}
