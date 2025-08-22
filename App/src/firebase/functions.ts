import {
	getFunctions,
	httpsCallable,
	HttpsCallableResult,
} from 'firebase/functions'

import { app } from './app'
import { DropboxError, DropboxResult } from '@/shared/utils'

const functions = getFunctions(app)

const sendDropboxEmail = async (): Promise<
	HttpsCallableResult<DropboxResult | DropboxError>
> => {
	const dropboxSignSendReminderEmail = httpsCallable<
		unknown,
		DropboxResult | DropboxError
	>(functions, 'dropboxSignSendReminderEmail')
	return dropboxSignSendReminderEmail()
}

export { sendDropboxEmail }
