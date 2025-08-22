import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { Timestamp } from '@firebase/firestore'

export const cn = (...inputs: ClassValue[]) => {
	return twMerge(clsx(inputs))
}

export const formatTimestamp = (timestamp: Timestamp | undefined) => {
	if (!timestamp) return
	const date = new Date(timestamp.seconds * 1000)
	return date.toLocaleDateString('en-US', {
		month: 'long',
		day: 'numeric',
		year: 'numeric',
	})
}

export const getRequestMessage = (count: number | undefined) => {
	if (!count || count === 0) {
		return `no requests pending at this time.`
	}
	if (count === 1) {
		return `you have one pending request.`
	}
	return `you have ${count} pending requests.`
}

export const getInviteMessage = (count: number | undefined) => {
	if (!count || count === 0) {
		return `no invites pending at this time.`
	}
	if (count === 1) {
		return `you have one pending invite.`
	}
	return `you have ${count} pending invites.`
}
