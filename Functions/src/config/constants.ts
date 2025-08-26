/**
 * Application constants and configuration
 */

import { ENV } from './environment.js'

// Dropbox Sign Configuration
export const DROPBOX_SIGN_CONFIG = {
	API_KEY: ENV.dropboxSignApiKey,
	TEMPLATE_ID: '2ea9b881ec6798e7c6122ebaa51baf50689c573c',
	TEST_MODE: !ENV.isProduction,
} as const

// Firebase Configuration
export const FIREBASE_CONFIG = {
	REGION: 'us-central1',
	CORS_ORIGINS: ['https://mplswinterleague.com'],
} as const

// Business Logic Constants
export const TEAM_CONFIG = {
	MIN_PLAYERS_FOR_REGISTRATION: 10,
} as const

// Email Configuration
export const EMAIL_CONFIG = {
	WAIVER_SUBJECT: 'Minneapolis Winter League - Release of Liability',
	WAIVER_MESSAGE:
		"We're so excited you decided to join Minneapolis Winter League. " +
		'Please make sure to sign this Release of Liability to finalize ' +
		'your participation. Looking forward to seeing you!',
} as const
