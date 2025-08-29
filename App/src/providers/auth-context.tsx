// React
import React, { PropsWithChildren, createContext, useContext } from 'react'

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
import {
	getPlayerRef,
	FirestoreError,
	DocumentSnapshot,
	DocumentData,
} from '@/firebase/firestore'
import { PlayerDocument } from '@/shared/utils'

interface AuthContextValue {
	authStateUser: User | null | undefined
	authStateLoading: boolean
	authStateError: Error | undefined
	authenticatedUserSnapshot:
		| DocumentSnapshot<PlayerDocument, DocumentData>
		| undefined
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

export const useAuthContext = (): AuthContextValue => {
	const context = useContext(AuthContext)
	if (!context) {
		throw new Error('useAuthContext must be used within an AuthContextProvider')
	}
	return context
}

export const AuthContextProvider: React.FC<PropsWithChildren> = ({
	children,
}) => {
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

	const contextValue: AuthContextValue = {
		authStateUser,
		authStateLoading,
		authStateError,
		authenticatedUserSnapshot: authenticatedUserSnapshot as
			| DocumentSnapshot<PlayerDocument, DocumentData>
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
