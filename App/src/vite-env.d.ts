/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_FIREBASE_ENV: string
	readonly VITE_USE_EMULATORS: string
	readonly VITE_LOG_LEVEL: string
	// Add other environment variables as needed
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}
