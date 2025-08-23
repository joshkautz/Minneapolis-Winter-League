import { ReactNode } from 'react'
import { NotificationCard } from '@/shared/components'

export const TeamRecordRoot = ({ children }: { children: ReactNode }) => {
	return (
		<NotificationCard
			title={'Record'}
			className={'flex-1 basis-[360px] shrink-0'}
		>
			<div className='flex flex-col items-end gap-2 py-2'>{children}</div>
		</NotificationCard>
	)
}

export const TeamRecordRow = ({ children }: { children: ReactNode }) => {
	return (
		<div className={'flex items-center justify-between w-full h-8'}>
			{children}
		</div>
	)
}

export const TeamRecordRowDate = ({ children }: { children: ReactNode }) => {
	return (
		<p className={'flex grow-1 select-none basis-[92px] shrink-0'}>
			{children}
		</p>
	)
}

export const TeamRecordRowResult = ({ children }: { children: ReactNode }) => {
	return (
		<p className={'flex grow-1 text-center basis-[74px] shrink-0 select-none'}>
			{children}
		</p>
	)
}
