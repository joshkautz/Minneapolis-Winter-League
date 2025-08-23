import {
	User,
	UserCredential,
	AuthError,
	ActionCodeSettings,
} from 'firebase/auth'

import { auth } from './app'

export {
	auth,
	type AuthError,
	type User,
	type UserCredential,
	type ActionCodeSettings,
}
