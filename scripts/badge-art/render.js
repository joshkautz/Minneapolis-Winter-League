#!/usr/bin/env node
/**
 * Renders the league's badge artwork with GIMP.
 *
 *   node scripts/badge-art/render.js            every badge, plus sheet.png
 *   node scripts/badge-art/render.js bagel ...  just those badges
 *
 * Each badge is described in badges.js: its tier (which sets the rim), its
 * emblem, its sky and the scene drawn around the duck. This script writes the
 * Lucide icons those need as SVGs, then drives GIMP's Script-Fu with
 * draw.scm to compose every badge the same way. Output goes to
 * scripts/badge-art/out/, which is gitignored: the PNGs are uploaded as
 * badge images, and this script is how to make them again.
 *
 * Needs GIMP 3 (GIMP_CONSOLE overrides where to find gimp-console). Script-Fu
 * is used rather than Python-Fu because it is built into GIMP, so nothing
 * outside the app has to run.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BADGES, TIERS } from './badges.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const out = path.join(here, 'out')
const iconDir = path.join(out, 'icons')
const lucideIcons = path.join(
	repoRoot,
	'node_modules/lucide-react/dist/esm/icons'
)
const duck = path.join(repoRoot, 'App/public/winter-duck.png')
const gimp =
	process.env.GIMP_CONSOLE ??
	'/Applications/GIMP.app/Contents/MacOS/gimp-console-3.0'

/** The emblem is the same colour on every badge; draw.scm sets its size. */
const EMBLEM = { stroke: '#ffffff', fill: 'none', size: 196, strokeWidth: 2.4 }

const rgb = (hex) => {
	const n = Number.parseInt(hex.replace('#', ''), 16)
	return `'(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255})`
}
const str = (value) => JSON.stringify(value)
const num = (value) => Number(value).toFixed(1)

/** Writes a Lucide icon as an SVG of the given size and colours. */
async function iconFile({
	icon,
	stroke,
	fill = 'none',
	size,
	strokeWidth = 2,
}) {
	const key = createHash('sha1')
		.update(str([icon, stroke, fill, size, strokeWidth]))
		.digest('hex')
		.slice(0, 10)
	const file = path.join(iconDir, `${icon}-${key}.svg`)
	const { __iconData } = await import(
		pathToFileURL(path.join(lucideIcons, `${icon}.mjs`)).href
	)
	const body = __iconData.node
		.map(([tag, attrs]) => {
			const attributes = Object.entries(attrs)
				.filter(([name]) => name !== 'key')
				.map(([name, value]) => `${name}="${value}"`)
				.join(' ')
			return `<${tag} ${attributes}/>`
		})
		.join('')
	writeFileSync(
		file,
		`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
	)
	return file
}

/** One scene element as a Script-Fu call. */
async function drawCall(element) {
	const opacity = num((element.opacity ?? 1) * 100)
	switch (element.kind) {
		case 'rays':
			return `(flair-rays img ${rgb(element.colour)} ${element.count} ${opacity} ${num(element.x ?? 512)} ${num(element.y ?? 512)})`
		case 'circle':
			return `(flair-ellipse img ${rgb(element.colour)} ${opacity} ${num(element.x - element.d / 2)} ${num(element.y - element.d / 2)} ${num(element.d)} ${num(element.d)})`
		case 'ellipse':
			return `(flair-ellipse img ${rgb(element.colour)} ${opacity} ${num(element.x - element.w / 2)} ${num(element.y - element.h / 2)} ${num(element.w)} ${num(element.h)})`
		case 'ring':
			return `(flair-ring img ${rgb(element.colour)} ${opacity} ${num(element.x - element.d / 2)} ${num(element.y - element.d / 2)} ${num(element.d)} ${element.width})`
		case 'rect':
			return `(flair-rect img ${rgb(element.colour)} ${opacity} ${num(element.x)} ${num(element.y)} ${num(element.w)} ${num(element.h)})`
		case 'polygon':
			return `(flair-polygon img ${rgb(element.colour)} ${opacity} (vector ${element.points.map(num).join(' ')}))`
		case 'icon': {
			const file = await iconFile(element)
			const radians = ((element.angle ?? 0) * Math.PI) / 180
			return `(flair-image img ${str(file)} ${num(element.size)} ${num(element.x)} ${num(element.y)} ${radians.toFixed(4)} ${opacity})`
		}
		default:
			throw new Error(`Unknown scene element: ${element.kind}`)
	}
}

async function badgeProgram(badge) {
	const tier = TIERS[badge.tier]
	if (!tier) throw new Error(`${badge.id}: unknown tier ${badge.tier}`)
	const emblem = await iconFile({ icon: badge.emblem, ...EMBLEM })
	const scene = await Promise.all((badge.scene ?? []).map(drawCall))
	const props = await Promise.all((badge.props ?? []).map(drawCall))
	return [
		`(let ((img (badge-start ${rgb(badge.sky[0])} ${rgb(badge.sky[1])} ${rgb(tier.light)} ${rgb(tier.dark)})))`,
		...scene,
		`(badge-duck img ${str(duck)})`,
		...props,
		`(badge-finish img ${str(emblem)} ${rgb(tier.light)} ${rgb(tier.dark)} ${str(path.join(out, `${badge.id}.png`))}))`,
	].join('\n')
}

async function main() {
	const wanted = process.argv.slice(2)
	const badges = wanted.length
		? BADGES.filter((badge) => wanted.includes(badge.id))
		: BADGES
	const unknown = wanted.filter(
		(id) => !BADGES.some((badge) => badge.id === id)
	)
	if (unknown.length) throw new Error(`No such badge: ${unknown.join(', ')}`)

	mkdirSync(iconDir, { recursive: true })
	const programs = await Promise.all(badges.map(badgeProgram))
	const sheet = wanted.length
		? []
		: [
				`(contact-sheet (list ${badges.map((badge) => str(path.join(out, `${badge.id}.png`))).join(' ')}) (list ${badges.map((badge) => str(badge.name)).join(' ')}) 6 300 ${str(path.join(out, 'sheet.png'))})`,
			]
	const script = [
		`(load ${str(path.join(here, 'draw.scm'))})`,
		...programs,
		...sheet,
	].join('\n')
	writeFileSync(path.join(out, 'batch.scm'), script)

	execFileSync(
		gimp,
		[
			'-i',
			'--quit',
			'--batch-interpreter=plug-in-script-fu-eval',
			'-b',
			`(begin ${script})`,
		],
		{ stdio: ['ignore', 'inherit', 'inherit'] }
	)
	console.log(`Rendered ${badges.length} badge(s) to ${out}`)
}

await main()
