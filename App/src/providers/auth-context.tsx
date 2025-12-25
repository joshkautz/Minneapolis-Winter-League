// React
import {
	PropsWithChildren,
	createContext,
	useContext,
	useEffect,
	useState,
	useCallback,
} from 'react'

// Firebase Hooks
import {
	useAuthState,
	useCreateUserWithEmailAndPassword,
	useSignInWithEmailAndPassword,
	// useUpdateEmail,
	// useUpdatePassword,
	useSendPasswordResetEmail,
	useSendEmailVerification,
	useSignOut,
} from 'react-firebase-hooks/auth'
import { useDocument } from 'react-firebase-hooks/firestore'

// Winter League
import {
	auth,
	User,
	UserCredential,
	AuthError,
	ActionCodeSettings,
} from '@/firebase/auth'
import { getPlayerRef, FirestoreError, DocumentSnapshot } from '@/firebase'
import { PlayerDocument } from '@/shared/utils'

/** How often to refresh user data from Firebase Auth (in milliseconds) */
const USER_REFRESH_INTERVAL = 10000 // 10 seconds

interface AuthContextValue {
	authStateUser: User | null | undefined
	authStateLoading: boolean
	authStateError: Error | undefined
	/** Counter that increments when user data is refreshed, triggering re-renders */
	userRefreshCount: number
	/** Manually trigger a user data refresh */
	refreshUser: () => Promise<void>
	authenticatedUserSnapshot: DocumentSnapshot<PlayerDocument> | undefined
	authenticatedUserSnapshotLoading: boolean
	authenticatedUserSnapshotError: FirestoreError | undefined
	createUserWithEmailAndPassword: (
		email: string,
		password: string
	) => Promise<UserCredential | undefined>
	createUserWithEmailAndPasswordUser: UserCredential | undefined
	createUserWithEmailAndPasswordLoading: boolean
	createUserWithEmailAndPasswordError: AuthError | undefined
	signInWithEmailAndPassword: (
		email: string,
		password: string
	) => Promise<UserCredential | undefined>
	signInWithEmailAndPasswordUser: UserCredential | undefined
	signInWithEmailAndPasswordLoading: boolean
	signInWithEmailAndPasswordError: AuthError | undefined
	signOut: () => Promise<boolean>
	signOutLoading: boolean
	signOutError: Error | AuthError | undefined
	sendEmailVerification: () => Promise<boolean>
	sendEmailVerificationSending: boolean
	sendEmailVerificationError: Error | AuthError | undefined
	sendPasswordResetEmail: (
		email: string,
		actionCodeSettings?: ActionCodeSettings | undefined
	) => Promise<boolean>
	sendPasswordResetEmailSending: boolean
	sendPasswordResetEmailError: Error | AuthError | undefined
}

const AuthContext = createContext<AuthContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export const useAuthContext = (): AuthContextValue => {
	const context = useContext(AuthContext)
	if (!context) {
		throw new Error('useAuthContext must be used within an AuthContextProvider')
	}
	return context
}

export const AuthContextProvider = ({ children }: PropsWithChildren) => {
	const [authStateUser, authStateLoading, authStateError] = useAuthState(auth)
	const [
		authenticatedUserSnapshot,
		authenticatedUserSnapshotLoading,
		authenticatedUserSnapshotError,
	] = useDocument(getPlayerRef(authStateUser))
	const [
		createUserWithEmailAndPassword,
		createUserWithEmailAndPasswordUser,
		createUserWithEmailAndPasswordLoading,
		createUserWithEmailAndPasswordError,
	] = useCreateUserWithEmailAndPassword(auth)
	const [
		signInWithEmailAndPassword,
		signInWithEmailAndPasswordUser,
		signInWithEmailAndPasswordLoading,
		signInWithEmailAndPasswordError,
	] = useSignInWithEmailAndPassword(auth)
	const [signOut, signOutLoading, signOutError] = useSignOut(auth)
	const [
		sendEmailVerification,
		sendEmailVerificationSending,
		sendEmailVerificationError,
	] = useSendEmailVerification(auth)
	const [
		sendPasswordResetEmail,
		sendPasswordResetEmailSending,
		sendPasswordResetEmailError,
	] = useSendPasswordResetEmail(auth)

	// State to track user data refreshes and trigger re-renders
	const [userRefreshCount, setUserRefreshCount] = useState(0)

	// Function to manually refresh user data
	const refreshUser = useCallback(async () => {
		if (authStateUser) {
			await authStateUser.reload()
			// Also refresh the ID token to get updated claims
			await authStateUser.getIdToken(true)
			setUserRefreshCount((prev) => prev + 1)
		}
	}, [authStateUser])

	// Periodically refresh user data from Firebase Auth
	// Force token refresh only when email is not yet verified (to pick up verification)
	// Once verified, only reload user data (lightweight operation)
	useEffect(() => {
		if (!authStateUser) return

		const interval = setInterval(async () => {
			try {
				const wasUnverified = !authStateUser.emailVerified
				await authStateUser.reload()

				// Only force token refresh if email was unverified (to pick up new claim)
				// This avoids unnecessary network requests for already-verified users
				if (wasUnverified && authStateUser.emailVerified) {
					await authStateUser.getIdToken(true)
				}

				// Increment counter to trigger re-renders in consuming components
				setUserRefreshCount((prev) => prev + 1)
			} catch {
				// Silently handle errors (user might have been signed out)
			}
		}, USER_REFRESH_INTERVAL)

		return () => clearInterval(interval)
	}, [authStateUser])

	const contextValue: AuthContextValue = {
		authStateUser,
		authStateLoading,
		authStateError,
		userRefreshCount,
		refreshUser,
		authenticatedUserSnapshot: authenticatedUserSnapshot as
			| DocumentSnapshot<PlayerDocument>
			| undefined,
		authenticatedUserSnapshotLoading,
		authenticatedUserSnapshotError,
		createUserWithEmailAndPassword,
		createUserWithEmailAndPasswordUser,
		createUserWithEmailAndPasswordLoading,
		createUserWithEmailAndPasswordError,
		signInWithEmailAndPassword,
		signInWithEmailAndPasswordUser,
		signInWithEmailAndPasswordLoading,
		signInWithEmailAndPasswordError,
		signOut,
		signOutLoading,
		signOutError,
		sendEmailVerification,
		sendEmailVerificationSending,
		sendEmailVerificationError,
		sendPasswordResetEmail,
		sendPasswordResetEmailSending,
		sendPasswordResetEmailError,
	}

	return (
		<AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
	)
}
