#!/usr/bin/env npx tsx
/**
 * Stripe Data Migration Script
 *
 * Migrates Stripe-related data from the Firebase Stripe Extension structure
 * to our custom implementation structure.
 *
 * OLD STRUCTURE (Firebase Stripe Extension):
 *   customers/{uid}
 *   ├── stripeId: string (Stripe customer ID)
 *   ├── email: string
 *   └── checkout_sessions/{sessionId}
 *   └── payments/{paymentId}
 *   └── subscriptions/{subscriptionId}
 *
 * NEW STRUCTURE (Custom Implementation):
 *   stripe/{uid}
 *   ├── stripeId: string (Stripe customer ID)
 *   ├── email: string
 *   └── checkouts/{sessionId}
 *   └── payments/{paymentId}
 *
 * Usage:
 *   npm run script:migrate-stripe -- --dry-run
 *   npm run script:migrate-stripe
 *   npm run script:migrate-stripe -- --delete-old
 *
 * Options:
 *   --dry-run     Preview migration without making changes
 *   --delete-old  Delete old documents after successful migration
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// Parse command line arguments
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const deleteOld = args.includes('--delete-old')

// Initialize Firebase Admin
function initializeFirebase(): void {
	if (process.env.FIRESTORE_EMULATOR_HOST) {
		console.log(
			`\n🔧 Using Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST}\n`
		)
		initializeApp({ projectId: 'demo-project' })
		return
	}

	const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
	if (!credentialsPath) {
		console.error('\n❌ Error: GOOGLE_APPLICATION_CREDENTIALS not set')
		console.error(
			'   Set this to the path of your Firebase service account key JSON file'
		)
		process.exit(1)
	}

	try {
		const serviceAccount = require(credentialsPath)
		initializeApp({ credential: cert(serviceAccount) })
		console.log(`\n🔑 Using service account: ${credentialsPath}\n`)
	} catch (error) {
		console.error(`\n❌ Error loading credentials: ${credentialsPath}`)
		console.error(error)
		process.exit(1)
	}
}

interface MigrationStats {
	customers: { migrated: number; skipped: number; errors: number }
	checkoutSessions: { migrated: number; skipped: number; errors: number }
	payments: { migrated: number; skipped: number; errors: number }
	deleted: { customers: number; checkoutSessions: number; payments: number }
}

async function migrate(): Promise<void> {
	console.log('═'.repeat(60))
	console.log('  STRIPE DATA MIGRATION')
	console.log('  customers/{uid}/... → stripe/{uid}/...')
	console.log('═'.repeat(60))

	if (isDryRun) {
		console.log('\n⚠️  DRY RUN MODE - No changes will be made\n')
	}

	if (deleteOld) {
		console.log(
			'⚠️  DELETE MODE - Old documents will be deleted after migration\n'
		)
	}

	initializeFirebase()
	const firestore = getFirestore()

	const stats: MigrationStats = {
		customers: { migrated: 0, skipped: 0, errors: 0 },
		checkoutSessions: { migrated: 0, skipped: 0, errors: 0 },
		payments: { migrated: 0, skipped: 0, errors: 0 },
		deleted: { customers: 0, checkoutSessions: 0, payments: 0 },
	}

	// Get all customers from the old collection
	console.log('📂 Reading customers collection...\n')
	const customersSnapshot = await firestore.collection('customers').get()

	if (customersSnapshot.empty) {
		console.log('✨ No documents found in customers collection.\n')
		return
	}

	console.log(`   Found ${customersSnapshot.size} customer document(s)\n`)

	// Process each customer
	for (const customerDoc of customersSnapshot.docs) {
		const uid = customerDoc.id
		const customerData = customerDoc.data()

		console.log(`\n👤 Processing customer: ${uid}`)

		try {
			// Check if customer already exists in new location
			const newCustomerRef = firestore.collection('stripe').doc(uid)
			const existingCustomer = await newCustomerRef.get()

			// Migrate customer document
			if (existingCustomer.exists) {
				console.log(`   ⏭️  Customer already exists in stripe/${uid}, skipping`)
				stats.customers.skipped++
			} else {
				// Prepare customer data for migration
				const newCustomerData: Record<string, unknown> = {}

				// Map stripeId (might be stored differently by extension)
				if (customerData.stripeId) {
					newCustomerData.stripeId = customerData.stripeId
				} else if (customerData.stripeLink) {
					// Some versions of the extension use stripeLink
					newCustomerData.stripeId = customerData.stripeLink
				}

				// Copy email if present
				if (customerData.email) {
					newCustomerData.email = customerData.email
				}

				// Add migration metadata
				newCustomerData.migratedAt = new Date()
				newCustomerData.migratedFrom = 'customers'

				if (isDryRun) {
					console.log(`   📝 Would migrate customer to stripe/${uid}`)
					if (Object.keys(newCustomerData).length > 0) {
						console.log(`      Data: ${JSON.stringify(newCustomerData)}`)
					}
				} else {
					await newCustomerRef.set(newCustomerData)
					console.log(`   ✅ Migrated customer to stripe/${uid}`)
				}
				stats.customers.migrated++
			}

			// Migrate checkout_sessions → checkouts
			const checkoutSessionsSnapshot = await customerDoc.ref
				.collection('checkout_sessions')
				.get()

			if (!checkoutSessionsSnapshot.empty) {
				console.log(
					`   📋 Found ${checkoutSessionsSnapshot.size} checkout session(s)`
				)

				for (const sessionDoc of checkoutSessionsSnapshot.docs) {
					const sessionId = sessionDoc.id
					const sessionData = sessionDoc.data()

					// Check if already migrated
					const newSessionRef = newCustomerRef
						.collection('checkouts')
						.doc(sessionId)
					const existingSession = await newSessionRef.get()

					if (existingSession.exists) {
						console.log(
							`      ⏭️  Checkout ${sessionId} already exists, skipping`
						)
						stats.checkoutSessions.skipped++
					} else {
						// Prepare session data (copy all fields)
						const newSessionData = {
							...sessionData,
							migratedAt: new Date(),
							migratedFrom: 'checkout_sessions',
						}

						if (isDryRun) {
							console.log(`      📝 Would migrate checkout: ${sessionId}`)
						} else {
							await newSessionRef.set(newSessionData)
							console.log(`      ✅ Migrated checkout: ${sessionId}`)
						}
						stats.checkoutSessions.migrated++
					}
				}
			}

			// Migrate payments (same subcollection name)
			const paymentsSnapshot = await customerDoc.ref
				.collection('payments')
				.get()

			if (!paymentsSnapshot.empty) {
				console.log(`   💳 Found ${paymentsSnapshot.size} payment(s)`)

				for (const paymentDoc of paymentsSnapshot.docs) {
					const paymentId = paymentDoc.id
					const paymentData = paymentDoc.data()

					// Check if already migrated
					const newPaymentRef = newCustomerRef
						.collection('payments')
						.doc(paymentId)
					const existingPayment = await newPaymentRef.get()

					if (existingPayment.exists) {
						console.log(
							`      ⏭️  Payment ${paymentId} already exists, skipping`
						)
						stats.payments.skipped++
					} else {
						// Prepare payment data (copy all fields)
						// Map status field if needed (extension might use 'succeeded' vs 'paid')
						const newPaymentData: Record<string, unknown> = {
							...paymentData,
							migratedAt: new Date(),
							migratedFrom: 'customers/payments',
						}

						// Normalize status field
						if (paymentData.status === 'succeeded') {
							newPaymentData.status = 'paid'
						}

						if (isDryRun) {
							console.log(`      📝 Would migrate payment: ${paymentId}`)
						} else {
							await newPaymentRef.set(newPaymentData)
							console.log(`      ✅ Migrated payment: ${paymentId}`)
						}
						stats.payments.migrated++
					}
				}
			}

			// Delete old documents if requested
			if (deleteOld && !isDryRun) {
				// Delete checkout_sessions
				for (const sessionDoc of checkoutSessionsSnapshot.docs) {
					await sessionDoc.ref.delete()
					stats.deleted.checkoutSessions++
				}

				// Delete payments
				for (const paymentDoc of paymentsSnapshot.docs) {
					await paymentDoc.ref.delete()
					stats.deleted.payments++
				}

				// Delete customer document
				await customerDoc.ref.delete()
				stats.deleted.customers++
				console.log(`   🗑️  Deleted old customer document`)
			}
		} catch (error) {
			console.error(`   ❌ Error processing customer ${uid}:`, error)
			stats.customers.errors++
		}
	}

	// Print summary
	console.log('\n' + '═'.repeat(60))
	console.log('  MIGRATION SUMMARY')
	console.log('═'.repeat(60))
	console.log(`  Customers:`)
	console.log(`    Migrated: ${stats.customers.migrated}`)
	console.log(`    Skipped:  ${stats.customers.skipped}`)
	console.log(`    Errors:   ${stats.customers.errors}`)
	console.log(`  Checkout Sessions:`)
	console.log(`    Migrated: ${stats.checkoutSessions.migrated}`)
	console.log(`    Skipped:  ${stats.checkoutSessions.skipped}`)
	console.log(`    Errors:   ${stats.checkoutSessions.errors}`)
	console.log(`  Payments:`)
	console.log(`    Migrated: ${stats.payments.migrated}`)
	console.log(`    Skipped:  ${stats.payments.skipped}`)
	console.log(`    Errors:   ${stats.payments.errors}`)

	if (deleteOld && !isDryRun) {
		console.log(`  Deleted:`)
		console.log(`    Customers:         ${stats.deleted.customers}`)
		console.log(`    Checkout Sessions: ${stats.deleted.checkoutSessions}`)
		console.log(`    Payments:          ${stats.deleted.payments}`)
	}

	console.log('═'.repeat(60))

	if (isDryRun) {
		console.log(
			'\n⚠️  This was a dry run. Run without --dry-run to apply changes.\n'
		)
	} else {
		console.log('\n✨ Migration complete!\n')

		if (!deleteOld && stats.customers.migrated > 0) {
			console.log(
				'💡 Tip: Run with --delete-old to remove old documents after verifying migration.\n'
			)
		}
	}
}

migrate().catch((error) => {
	console.error('\n❌ Migration failed:', error)
	process.exit(1)
})
