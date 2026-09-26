import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
	EmailAuthProvider,
	reauthenticateWithCredential,
	signOut,
} from 'firebase/auth'
import { toast } from 'sonner'
import { auth } from '@/firebase/app'
import { deletePlayerViaFunction } from '@/firebase/collections/functions'
import { errorCode, errorMessage, LEAGUE_CONTACT, logger } from '@/shared/utils'

/** Auth error codes that mean the password was wrong. */
const WRONG_PASSWORD_CODES = new Set([
	'auth/wrong-password',
	'auth/invalid-credential',
	'auth/invalid-login-credentials',
])

/** Why re-entering the password failed, in words a player can act on. */
const reauthenticationMessage = (error: unknown): string => {
	const code = errorCode(error)
	if (code && WRONG_PASSWORD_CODES.has(code)) {
		return 'That password is incorrect.'
	}
	if (code === 'auth/too-many-requests') {
		return 'Too many attempts. Wait a few minutes and try again.'
	}
	if (code === 'auth/network-request-failed') {
		return 'Check your connection and try again.'
	}
	return 'We could not confirm your password. Try again.'
}

/**
 * The server's refusals (on a team this season, the only admin, banned)
 * carry a message written to be shown. Anything else is unexpected.
 */
const deletionMessage = (error: unknown): string =>
	errorMessage(
		error,
		`We could not delete your account. Try again, or email ${LEAGUE_CONTACT}.`
	)

/**
 * Deletes the signed-in player's account.
 *
 * The password is checked again first, because the server only deletes an
 * account whose sign-in is a few minutes old: a session left open on a
 * shared computer cannot delete it. Once the server has deleted the account
 * the player is signed out here too — their sign-in no longer exists, but
 * this browser would otherwise hold on to it until its token expired.
 */
export const useDeleteAccount = (): {
	/** Resolves to why it failed, or `null` once the account is deleted. */
	deleteAccount: (password: string) => Promise<string | null>
} => {
	const navigate = useNavigate()

	const deleteAccount = useCallback(
		async (password: string): Promise<string | null> => {
			const user = auth.currentUser
			if (!user?.email) {
				return 'Sign in again to delete your account.'
			}

			try {
				await reauthenticateWithCredential(
					user,
					EmailAuthProvider.credential(user.email, password)
				)
			} catch (error) {
				return reauthenticationMessage(error)
			}

			try {
				await deletePlayerViaFunction()
			} catch (error) {
				logger.error('Account deletion failed', error, {
					component: 'DeleteAccountSection',
					userId: user.uid,
				})
				return deletionMessage(error)
			}

			try {
				await signOut(auth)
			} catch (error) {
				// The account is gone either way; its token simply stops working.
				logger.error('Sign-out after account deletion failed', error, {
					component: 'DeleteAccountSection',
					userId: user.uid,
				})
			}
			toast.success('Your account has been deleted.')
			navigate('/', { replace: true })
			return null
		},
		[navigate]
	)

	return { deleteAccount }
}
