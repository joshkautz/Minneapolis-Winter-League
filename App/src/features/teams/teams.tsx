import { Link } from 'react-router-dom'
import { cn, formatTimestamp } from '@/shared/utils'
import { CheckCircledIcon, ReloadIcon } from '@radix-ui/react-icons'
import { useTeamsContext } from '@/providers'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { GradientHeader } from '@/shared/components'
import { ComingSoon } from '@/shared/components'
import { useSeasonsContext } from '@/providers'
import { Timestamp } from '@firebase/firestore'
import { useMemo } from 'react'

export const Teams = () => {
	const { selectedSeasonTeamsQuerySnapshot } = useTeamsContext()
	const { selectedSeasonQueryDocumentSnapshot } = useSeasonsContext()

	enum SeasonStart {
		FUTURE = 'FUTURE',
		NOW = 'NOW',
		PAST = 'PAST',
	}

	const seasonStart = useMemo(
		() =>
			selectedSeasonQueryDocumentSnapshot &&
			selectedSeasonQueryDocumentSnapshot.data().registrationStart.seconds <
				Timestamp.now().seconds &&
			selectedSeasonQueryDocumentSnapshot.data().registrationEnd.seconds >
				Timestamp.now().seconds
				? SeasonStart.NOW
				: selectedSeasonQueryDocumentSnapshot &&
					  selectedSeasonQueryDocumentSnapshot.data().registrationStart
							.seconds > Timestamp.now().seconds
					? SeasonStart.FUTURE
					: SeasonStart.PAST,
		[selectedSeasonQueryDocumentSnapshot]
	)

	return (
		<div className={'container'}>
			<GradientHeader>Teams</GradientHeader>
			{!selectedSeasonTeamsQuerySnapshot ? (
				<div className='absolute inset-0 flex items-center justify-center'>
					<ReloadIcon className={'mr-2 h-10 w-10 animate-spin'} />
				</div>
			) : selectedSeasonTeamsQuerySnapshot.docs.length == 0 ? (
				<ComingSoon>
					<p className={' pt-6 '}>
						{seasonStart == SeasonStart.PAST
							? `There are no teams to display.`
							: seasonStart == SeasonStart.FUTURE
								? `Registration for this season is will go live on ${formatTimestamp(
										selectedSeasonQueryDocumentSnapshot?.data()
											?.registrationStart
									)}!`
								: seasonStart == SeasonStart.NOW &&
									`Registration for this season is currently live. Create a new team or join an existing team!`}
					</p>
				</ComingSoon>
			) : (
				<div
					className={'flex flex-row flex-wrap justify-center gap-y-8 gap-x-8'}
				>
					{selectedSeasonTeamsQuerySnapshot.docs.map((team) => {
						const url = team.data().logo
						return (
							<Link key={`link-${team.id}`} to={`/teams/${team.id}`}>
								<Card className={'group'}>
									<CardHeader className={'p-0'}>
										<div
											className={
												'w-[250px] h-[250px] overflow-hidden rounded-md rounded-b-none'
											}
										>
											<img
												src={url || undefined}
												className={cn(
													'w-full h-full max-w-[250px] max-h-[250px] transition duration-300 bg-muted group-hover:scale-105 mx-auto object-cover',
													!url &&
														'bg-linear-to-r from-primary to-sky-300 border-0 scale-[1.05]'
												)}
											/>
										</div>
									</CardHeader>
									<CardContent
										className={
											'flex flex-col items-center justify-center pt-6 max-w-[250px] text-ellipsis flex-nowrap'
										}
									>
										<p className={'flex flex-col flex-nowrap text-ellipsis'}>
											<span className='text-ellipsis whitespace-nowrap'>
												{team.data().name}
											</span>
											<span
												className={
													'max-w-0 group-hover:max-w-full transition-all duration-500 h-0.5 bg-primary'
												}
											 />
										</p>
									</CardContent>
									<CardFooter>
										<div
											className={cn(
												'text-muted-foreground italic text-sm items-center mx-auto text-center'
											)}
										>
											{!team.data().registered ? (
												<p>Registration in progress</p>
											) : (
												<div className='inline-flex items-center gap-2 text-green-600 dark:text-green-500'>
													Registered
													<CheckCircledIcon className='w-4 h-4' />
												</div>
											)}
										</div>
									</CardFooter>
								</Card>
							</Link>
						)
					})}
				</div>
			)}
		</div>
	)
}
