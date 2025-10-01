import {
	getFunctions,
	httpsCallable,
	HttpsCallableResult,
} from 'firebase/functions'
import { returnTypeT, SignatureRequestGetResponse } from '@dropbox/sign'

import { app } from './app'

const functions = getFunctions(app)

const sendDropboxEmail = async (): Promise<
	HttpsCallableResult<returnTypeT<SignatureRequestGetResponse>>
> => {
	const dropboxSignSendReminderEmail = httpsCallable<
		unknown,
		returnTypeT<SignatureRequestGetResponse>
	>(functions, 'dropboxSignSendReminderEmail')
	return dropboxSignSendReminderEmail()
}

export { sendDropboxEmail }
