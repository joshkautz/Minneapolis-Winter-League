import {
	getFunctions,
	httpsCallable,
	HttpsCallableResult,
} from 'firebase/functions'
import { returnTypeT, SignatureRequestGetResponse } from '@dropbox/sign'

import { app } from './app'

const functions = getFunctions(app)

interface SendDropboxEmailRequest {
	signatureRequestId: string
}

const sendDropboxEmail = async (
	signatureRequestId: string
): Promise<HttpsCallableResult<returnTypeT<SignatureRequestGetResponse>>> => {
	const dropboxSignSendReminderEmail = httpsCallable<
		SendDropboxEmailRequest,
		returnTypeT<SignatureRequestGetResponse>
	>(functions, 'dropboxSignSendReminderEmail')
	return dropboxSignSendReminderEmail({ signatureRequestId })
}

export { sendDropboxEmail }
