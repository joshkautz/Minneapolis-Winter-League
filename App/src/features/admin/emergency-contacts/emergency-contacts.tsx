/**
 * Emergency Contacts admin page
 *
 * Every registered team's roster for a season with each player's emergency
 * contacts, from the waiver they signed that season, to print or keep open
 * on game day. The contacts are private to the player and admins, so they
 * come from the `getEmergencyContacts` callable rather than a query, and
 * are fetched again whenever the season changes.
 */

import { useEffect, useState } from 'react'
import { AlertCircle, HeartPulse, Phone, Printer } from 'lucide-react'

import {
	getEmergencyContactsViaFunction,
	type EmergencyContactsResponse,
} from '@/firebase/collections/functions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { LoadingSpinner, PageContainer, PageHeader } from '@/shared/components'
import { errorMessage, logger } from '@/shared/utils'
import {
	BackToAdminButton,
	SeasonFilterCard,
	useAdminSeasonFilter,
} from '@/features/admin/shared'

type Team = EmergencyContactsResponse['teams'][number]
type Player = Team['players'][number]

/** What a player without contacts shows in their place. */
const MISSING: Record<Exclude<Player['status'], 'contacts'>, string> = {
	recorded: 'None on file: an admin marked this waiver signed',
	unsigned: 'None on file: no waiver signed this season',
}

/** "tel:6125550100", from however the number was typed. */
const telHref = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, '')}`

const PlayerContacts = ({ player }: { player: Player }) =>
	player.status === 'contacts' ? (
		<ul className='space-y-1'>
			{player.contacts.map((contact, index) => (
				<li key={index}>
					<span className='font-medium'>{contact.name}</span>{' '}
					<span className='text-muted-foreground'>
						({contact.relationship})
					</span>{' '}
					<a
						href={telHref(contact.phone)}
						className='inline-flex items-center gap-1 whitespace-nowrap underline-offset-4 hover:underline'
					>
						<Phone className='h-3 w-3 print:hidden' aria-hidden='true' />
						{contact.phone}
					</a>
				</li>
			))}
		</ul>
	) : (
		<span className='text-destructive'>{MISSING[player.status]}</span>
	)

const TeamCard = ({ team }: { team: Team }) => {
	const missing = team.players.filter(
		(player) => player.status !== 'contacts'
	).length
	return (
		<Card className='break-inside-avoid'>
			<CardHeader>
				<CardTitle>{team.teamName}</CardTitle>
				<CardDescription>
					{team.players.length} players
					{missing > 0 && `, ${missing} without emergency contacts`}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className='w-1/3'>Player</TableHead>
							<TableHead>Emergency contacts</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{team.players.map((player) => (
							<TableRow key={player.playerId}>
								<TableCell className='align-top font-medium'>
									{player.name}
									{player.captain && (
										<Badge variant='secondary' className='ml-2'>
											Captain
										</Badge>
									)}
								</TableCell>
								<TableCell className='align-top'>
									<PlayerContacts player={player} />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	)
}

/** One load of a season's contacts; `seasonId` says which it belongs to. */
type Loaded =
	| { seasonId: string; data: EmergencyContactsResponse }
	| { seasonId: string; error: string }

export const EmergencyContacts = () => {
	const { seasons, selectedSeasonId, setSelectedSeasonId } =
		useAdminSeasonFilter()
	const [loaded, setLoaded] = useState<Loaded | null>(null)

	useEffect(() => {
		if (!selectedSeasonId) return
		let current = true
		getEmergencyContactsViaFunction({ seasonId: selectedSeasonId })
			.then((data) => {
				if (current) setLoaded({ seasonId: selectedSeasonId, data })
			})
			.catch((error: unknown) => {
				logger.error('Failed to load emergency contacts', error, {
					component: 'EmergencyContacts',
					seasonId: selectedSeasonId,
				})
				if (current) {
					setLoaded({
						seasonId: selectedSeasonId,
						error: errorMessage(
							error,
							'The emergency contacts could not be loaded. Please try again.'
						),
					})
				}
			})
		// A slower answer for a season no longer selected is dropped.
		return () => {
			current = false
		}
	}, [selectedSeasonId])

	// Until the selected season's answer arrives, show it loading rather
	// than the previous season's teams.
	const result = loaded?.seasonId === selectedSeasonId ? loaded : null

	return (
		<PageContainer withSpacing withGap>
			<div className='print:hidden'>
				<PageHeader
					title='Emergency Contacts'
					description="Every registered team's players, with the emergency contacts from their waiver"
					icon={HeartPulse}
				/>
			</div>

			<div className='flex flex-wrap items-center justify-between gap-4 print:hidden'>
				<BackToAdminButton />
				<Button
					onClick={() => window.print()}
					disabled={!result || 'error' in result}
				>
					<Printer className='h-4 w-4' aria-hidden='true' />
					Print
				</Button>
			</div>

			<div className='print:hidden'>
				<SeasonFilterCard
					seasons={seasons}
					selectedSeasonId={selectedSeasonId}
					onSeasonChange={setSelectedSeasonId}
				/>
			</div>

			{!result ? (
				<LoadingSpinner size='lg' centered />
			) : 'error' in result ? (
				<Alert variant='destructive'>
					<AlertCircle className='h-4 w-4' aria-hidden='true' />
					<AlertDescription>{result.error}</AlertDescription>
				</Alert>
			) : result.data.teams.length === 0 ? (
				<Alert>
					<AlertDescription>
						No team is registered for {result.data.seasonName} yet.
					</AlertDescription>
				</Alert>
			) : (
				<>
					<h2 className='hidden text-xl font-semibold print:block'>
						{result.data.seasonName}: emergency contacts
					</h2>
					{result.data.teams.map((team) => (
						<TeamCard key={team.teamId} team={team} />
					))}
				</>
			)}
		</PageContainer>
	)
}
