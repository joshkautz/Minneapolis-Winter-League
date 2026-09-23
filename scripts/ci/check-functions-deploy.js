#!/usr/bin/env node
/**
 * Refuse a Functions deploy that would delete a function or change what
 * triggers one.
 *
 * CI deploys with `firebase deploy --only functions --force`. The `--force`
 * is needed because the CLI will not, non-interactively, deploy a function
 * that is newly retried on failure — and several are, deliberately (see
 * `.claude/rules/functions.md`). But `--force` approves every other prompt
 * too, including two that exist to stop data loss:
 *
 * - **Deleting** a deployed function that is missing from the source. Drop an
 *   export from `Functions/src/index.ts` by accident and `--force` removes
 *   the function from production without a word.
 * - **Changing a function's trigger** — say a document trigger from
 *   `written` to `updated`, or v1 to v2. The CLI warns that events can be
 *   lost in the switch.
 *
 * Without `--force` both fail the deploy, which is the behaviour worth
 * keeping. This script restores it: run it before the forced deploy, and it
 * exits non-zero if the deploy would do either.
 *
 * Usage:
 *   firebase functions:list --json > deployed.json
 *   node scripts/ci/check-functions-deploy.js deployed.json
 *
 * Compares against the built manifest, `Functions/dist/index.js`, so run it
 * after building Functions. A deletion or trigger change that is intended is
 * done by hand first (`firebase functions:delete <name>`), after which this
 * check passes.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'..'
)

/**
 * What triggers an endpoint, as a comparable string. Works for both the
 * CLI's view of a deployed function and a function object's `__endpoint`,
 * which share this shape.
 */
export function triggerOf(endpoint) {
	if (endpoint.callableTrigger) return 'callable'
	if (endpoint.httpsTrigger) return 'https'
	if (endpoint.scheduleTrigger) return 'schedule'
	if (endpoint.taskQueueTrigger) return 'taskQueue'
	if (endpoint.blockingTrigger) {
		return `blocking:${endpoint.blockingTrigger.eventType}`
	}
	if (endpoint.eventTrigger) return `event:${endpoint.eventTrigger.eventType}`
	return 'unknown'
}

/** `{ name → { platform, trigger } }` from the deploy manifest's exports. */
export function localEndpointsFrom(manifest) {
	const endpoints = {}
	for (const [name, value] of Object.entries(manifest)) {
		const endpoint = value?.__endpoint
		if (!endpoint) continue
		endpoints[name] = {
			platform: endpoint.platform,
			trigger: triggerOf(endpoint),
		}
	}
	return endpoints
}

/** `{ name → { platform, trigger } }` from `firebase functions:list --json`. */
export function deployedEndpointsFrom(listOutput) {
	const endpoints = {}
	for (const endpoint of listOutput.result ?? []) {
		endpoints[endpoint.id] = {
			platform: endpoint.platform,
			trigger: triggerOf(endpoint),
		}
	}
	return endpoints
}

/**
 * The changes a forced deploy would make that it should not make silently.
 * Pure: the tests drive it with plain objects.
 */
export function unsafeChanges(deployed, local) {
	const deletions = Object.keys(deployed)
		.filter((name) => !(name in local))
		.sort()

	const triggerChanges = Object.keys(deployed)
		.filter((name) => name in local)
		.filter(
			(name) =>
				deployed[name].trigger !== local[name].trigger ||
				deployed[name].platform !== local[name].platform
		)
		.sort()
		.map((name) => ({
			name,
			from: `${deployed[name].platform} ${deployed[name].trigger}`,
			to: `${local[name].platform} ${local[name].trigger}`,
		}))

	return { deletions, triggerChanges }
}

async function main() {
	const deployedPath = process.argv[2]
	if (!deployedPath) {
		console.error(
			'Usage: node scripts/ci/check-functions-deploy.js <functions:list --json output>'
		)
		process.exit(2)
	}

	const listOutput = JSON.parse(await readFile(deployedPath, 'utf8'))
	if (listOutput.status !== 'success' || !Array.isArray(listOutput.result)) {
		// An empty or failed listing would read as "nothing deployed" and let
		// every deletion through.
		console.error('functions:list did not return a usable result:')
		console.error(JSON.stringify(listOutput).slice(0, 500))
		process.exit(1)
	}

	// v1 triggers read the project from the environment to describe
	// themselves. Take it from the listing so both sides name the same one.
	process.env.GCLOUD_PROJECT ??= listOutput.result[0]?.project

	const manifestUrl = pathToFileURL(
		path.join(repoRoot, 'Functions', 'dist', 'index.js')
	)
	const manifest = await import(manifestUrl.href)

	const deployed = deployedEndpointsFrom(listOutput)
	const local = localEndpointsFrom(manifest)
	const { deletions, triggerChanges } = unsafeChanges(deployed, local)

	console.log(
		`Deployed: ${Object.keys(deployed).length} functions. ` +
			`Source: ${Object.keys(local).length}.`
	)

	if (deletions.length === 0 && triggerChanges.length === 0) {
		console.log('No deletions or trigger changes. Safe to deploy.')
		return
	}

	for (const name of deletions) {
		console.error(
			`Would delete ${name}: it is deployed but not exported from Functions/src/index.ts.`
		)
	}
	for (const change of triggerChanges) {
		console.error(
			`Would change the trigger of ${change.name}: ${change.from} -> ${change.to}.`
		)
	}
	console.error(
		'\nRefusing to deploy with --force. If this is intended, run ' +
			'`firebase functions:delete <name>` by hand first, then re-run the deploy.'
	)
	process.exit(1)
}

// Run only when executed, not when the tests import the functions above.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	main().catch((error) => {
		console.error(error)
		process.exit(1)
	})
}
