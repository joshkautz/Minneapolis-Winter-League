/**
 * The artwork for every league badge: what render.js draws.
 *
 * Every badge shares one medallion — the tier's metal rim, a winter sky, the
 * same snowfall, the snowman duck at the centre and the emblem in a bubble at
 * the lower right — so the set reads as one family. What makes each its own
 * is the scene around the duck (`scene`, drawn behind it) and any props in
 * front of it (`props`), chosen for what the badge celebrates.
 *
 * Coordinates are on a 1024px canvas. The sky is the circle centred at
 * (512, 512) with radius 444; the duck stands centred, roughly x 330–695 and
 * y 217–807, with its eyes near (431, 466) and (587, 466); the emblem bubble
 * covers x and y 574–914.
 *
 * The badges' names, rules and descriptions live in Functions; `id` must match
 * the badge id there.
 */

/** Rim metals, from the most common badges to the rarest. */
export const TIERS = {
	common: { light: '#ecb88c', dark: '#804824' },
	uncommon: { light: '#f4f6fa', dark: '#7e8896' },
	rare: { light: '#ffe28c', dark: '#b07e12' },
	fall: { light: '#f0705c', dark: '#7a1c14' },
}

const ICY = ['#ecf7ff', '#5c96d2']

/** A repeatable pseudo-random sequence, so a scatter is the same every run. */
function seeded(seed) {
	let state = seed
	return () => {
		state = (state * 1664525 + 1013904223) % 4294967296
		return state / 4294967296
	}
}

/**
 * `count` items scattered over the sky, avoiding the duck and the emblem so
 * the scene frames them rather than hiding behind them.
 */
function scatter(seed, count, make) {
	const random = seeded(seed)
	const items = []
	while (items.length < count) {
		const angle = random() * Math.PI * 2
		const radius = 150 + random() * 270
		const x = 512 + Math.cos(angle) * radius
		const y = 512 + Math.sin(angle) * radius
		const onDuck = x > 340 && x < 690 && y > 230 && y < 800
		const onEmblem = x > 560 && y > 560
		if (onDuck || onEmblem) continue
		items.push(make({ x, y, random, index: items.length }))
	}
	return items
}

const CONFETTI = ['#e63946', '#2a9d8f', '#ffd166', '#f72585', '#4361ee']

const confetti = (seed, count) =>
	scatter(seed, count, ({ x, y, random, index }) =>
		random() < 0.5
			? {
					kind: 'circle',
					colour: CONFETTI[index % 5],
					x,
					y,
					d: 18 + random() * 14,
				}
			: {
					kind: 'polygon',
					colour: CONFETTI[index % 5],
					points: tilted(x, y, 34, 14, random() * Math.PI),
				}
	)

/** The four corners of a w × h rectangle centred at (x, y), turned by `angle`. */
function tilted(x, y, w, h, angle) {
	const cos = Math.cos(angle)
	const sin = Math.sin(angle)
	return [
		[-w / 2, -h / 2],
		[w / 2, -h / 2],
		[w / 2, h / 2],
		[-w / 2, h / 2],
	].flatMap(([dx, dy]) => [x + dx * cos - dy * sin, y + dx * sin + dy * cos])
}

/** A firework: dots in a ring around (x, y). */
const burst = (x, y, radius, colour, dots = 12) =>
	Array.from({ length: dots }, (_, i) => {
		const angle = (i / dots) * Math.PI * 2
		return {
			kind: 'circle',
			colour,
			x: x + Math.cos(angle) * radius,
			y: y + Math.sin(angle) * radius,
			d: 16,
		}
	})

const icons = (seed, count, icon, style) =>
	scatter(seed, count, ({ x, y, random }) => ({
		kind: 'icon',
		icon,
		x,
		y,
		size: style.size[0] + random() * (style.size[1] - style.size[0]),
		angle: (random() - 0.5) * (style.tilt ?? 40),
		stroke: style.stroke,
		fill: style.fill,
		opacity: style.opacity,
		strokeWidth: style.strokeWidth,
	}))

export const BADGES = [
	// ---- Rare ---------------------------------------------------------------
	{
		id: 'champions',
		name: 'Champions',
		tier: 'rare',
		emblem: 'trophy',
		sky: ['#fff6d4', '#e9a91f'],
		scene: [
			{ kind: 'rays', colour: '#ffffff', count: 14, opacity: 0.35 },
			...confetti(11, 26),
		],
	},
	{
		id: 'runner-up',
		name: 'Runner-up',
		tier: 'rare',
		emblem: 'medal',
		sky: ['#f6f8fb', '#8e9db3'],
		scene: [
			{ kind: 'rays', colour: '#ffffff', count: 10, opacity: 0.3 },
			...icons(12, 9, 'star', {
				size: [50, 80],
				stroke: '#c9d2de',
				fill: '#eef2f7',
				opacity: 0.95,
			}),
		],
	},
	{
		id: 'dynasty',
		name: 'Dynasty',
		tier: 'rare',
		emblem: 'crown',
		sky: ['#f1e6ff', '#5f3596'],
		scene: [
			{ kind: 'rays', colour: '#e9d8ff', count: 16, opacity: 0.25 },
			...icons(13, 8, 'crown', {
				size: [56, 84],
				stroke: '#e8c45c',
				fill: 'none',
				opacity: 0.55,
				tilt: 30,
			}),
		],
		props: [
			{
				kind: 'icon',
				icon: 'crown',
				x: 512,
				y: 222,
				size: 190,
				stroke: '#9a6b00',
				fill: '#f5c518',
				strokeWidth: 1.6,
			},
		],
	},
	{
		id: 'perfect-season',
		name: 'Perfect Season',
		tier: 'rare',
		emblem: 'gem',
		sky: ['#e9fff8', '#2b6c96'],
		scene: [
			{
				kind: 'ellipse',
				colour: '#7ff0c8',
				x: 512,
				y: 300,
				w: 980,
				h: 150,
				opacity: 0.35,
			},
			{
				kind: 'ellipse',
				colour: '#9ad7ff',
				x: 512,
				y: 390,
				w: 980,
				h: 110,
				opacity: 0.3,
			},
			...icons(14, 8, 'gem', {
				size: [56, 86],
				stroke: '#2a7fa8',
				fill: '#bff1ff',
				opacity: 0.95,
			}),
			...icons(15, 7, 'sparkle', {
				size: [36, 56],
				stroke: '#ffffff',
				fill: '#ffffff',
				opacity: 0.9,
			}),
		],
	},
	{
		id: 'bagel',
		name: 'Bagel',
		tier: 'rare',
		emblem: 'donut',
		sky: ['#fff1f6', '#e98aab'],
		scene: icons(16, 11, 'donut', {
			size: [62, 104],
			stroke: '#8d5524',
			fill: '#f9c1d5',
			opacity: 1,
			tilt: 90,
		}),
	},
	{
		id: 'early-bird',
		name: 'Early Bird',
		tier: 'rare',
		emblem: 'bird',
		sky: ['#fff2c4', '#ef7f62'],
		scene: [
			{
				kind: 'circle',
				colour: '#ffd25c',
				x: 512,
				y: 760,
				d: 620,
				opacity: 0.9,
			},
			{
				kind: 'rays',
				colour: '#fff3c4',
				count: 12,
				opacity: 0.35,
				x: 512,
				y: 760,
			},
			{
				kind: 'icon',
				icon: 'bird',
				x: 230,
				y: 300,
				size: 110,
				stroke: '#3b2f5c',
				angle: -8,
			},
			{
				kind: 'icon',
				icon: 'bird',
				x: 330,
				y: 200,
				size: 80,
				stroke: '#3b2f5c',
				angle: 6,
			},
			{
				kind: 'icon',
				icon: 'bird',
				x: 790,
				y: 290,
				size: 96,
				stroke: '#3b2f5c',
				angle: 4,
			},
		],
	},
	{
		id: 'close-call',
		name: 'Close Call',
		tier: 'rare',
		emblem: 'alarm-clock',
		sky: ['#e8edff', '#3d4a8c'],
		scene: [
			{
				kind: 'circle',
				colour: '#ffffff',
				x: 512,
				y: 512,
				d: 800,
				opacity: 0.18,
			},
			{
				kind: 'icon',
				icon: 'clock-12',
				x: 512,
				y: 512,
				size: 860,
				stroke: '#ffffff',
				opacity: 0.6,
				strokeWidth: 1.3,
			},
			...icons(17, 5, 'hourglass', {
				size: [54, 72],
				stroke: '#ffd166',
				fill: 'none',
				opacity: 0.85,
				tilt: 50,
			}),
		],
	},
	{
		id: 'celebrity',
		name: 'Celebrity',
		tier: 'rare',
		emblem: 'star',
		sky: ['#fff4e0', '#7a3f8f'],
		scene: [
			{
				kind: 'polygon',
				colour: '#fff7d6',
				opacity: 0.35,
				points: [120, 40, 210, 40, 600, 820, 330, 820],
			},
			{
				kind: 'polygon',
				colour: '#fff7d6',
				opacity: 0.35,
				points: [814, 40, 904, 40, 694, 820, 424, 820],
			},
			...icons(18, 9, 'star', {
				size: [46, 76],
				stroke: '#c48a00',
				fill: '#ffd43b',
				opacity: 1,
			}),
		],
	},
	{
		id: 'rising-stars',
		name: 'Rising Stars',
		tier: 'rare',
		emblem: 'trending-up',
		sky: ['#ecebff', '#33378a'],
		scene: [
			{
				kind: 'icon',
				icon: 'star',
				x: 170,
				y: 760,
				size: 44,
				stroke: '#ffe066',
				fill: '#ffe066',
			},
			{
				kind: 'icon',
				icon: 'star',
				x: 210,
				y: 640,
				size: 58,
				stroke: '#ffe066',
				fill: '#ffe066',
			},
			{
				kind: 'icon',
				icon: 'star',
				x: 245,
				y: 510,
				size: 72,
				stroke: '#ffe066',
				fill: '#ffe066',
			},
			{
				kind: 'icon',
				icon: 'star',
				x: 285,
				y: 370,
				size: 88,
				stroke: '#ffe066',
				fill: '#ffe066',
			},
			{
				kind: 'icon',
				icon: 'star',
				x: 360,
				y: 220,
				size: 104,
				stroke: '#ffe066',
				fill: '#ffe066',
			},
			{
				kind: 'icon',
				icon: 'star',
				x: 760,
				y: 190,
				size: 120,
				stroke: '#ffe066',
				fill: '#ffe066',
			},
			...icons(19, 7, 'sparkle', {
				size: [28, 44],
				stroke: '#ffffff',
				fill: '#ffffff',
				opacity: 0.85,
			}),
		],
	},

	// ---- Uncommon -----------------------------------------------------------
	{
		id: 'podium',
		name: 'Podium',
		tier: 'uncommon',
		emblem: 'award',
		sky: ICY,
		scene: [
			{ kind: 'rect', colour: '#cfd8e3', x: 150, y: 830, w: 240, h: 200 },
			{ kind: 'rect', colour: '#f2c14e', x: 390, y: 770, w: 244, h: 260 },
			{ kind: 'rect', colour: '#d08c5b', x: 634, y: 870, w: 240, h: 160 },
			{
				kind: 'rect',
				colour: '#ffffff',
				x: 390,
				y: 770,
				w: 244,
				h: 10,
				opacity: 0.6,
			},
			{
				kind: 'icon',
				icon: 'medal',
				x: 215,
				y: 360,
				size: 140,
				stroke: '#9a6b00',
				fill: '#f5c518',
				angle: -10,
			},
			{
				kind: 'icon',
				icon: 'medal',
				x: 300,
				y: 205,
				size: 104,
				stroke: '#6b7685',
				fill: '#dfe5ec',
				angle: 6,
			},
			{
				kind: 'icon',
				icon: 'medal',
				x: 805,
				y: 300,
				size: 118,
				stroke: '#7a4420',
				fill: '#e2a173',
				angle: 10,
			},
		],
	},
	{
		id: 'giant-slayer',
		name: 'Giant Slayer',
		tier: 'uncommon',
		emblem: 'sword',
		sky: ['#eef2f6', '#4f5f72'],
		scene: [
			{
				kind: 'icon',
				icon: 'sword',
				x: 512,
				y: 512,
				size: 780,
				stroke: '#f1f5f9',
				angle: -45,
				opacity: 0.8,
				strokeWidth: 1.5,
			},
			{
				kind: 'icon',
				icon: 'sword',
				x: 512,
				y: 512,
				size: 780,
				stroke: '#f1f5f9',
				angle: 45,
				opacity: 0.8,
				strokeWidth: 1.5,
			},
		],
	},
	{
		id: 'merciless',
		name: 'Merciless',
		tier: 'uncommon',
		emblem: 'skull',
		sky: ['#ffe4e1', '#8f1b1f'],
		scene: [
			{ kind: 'rays', colour: '#5a0f12', count: 18, opacity: 0.2 },
			...icons(20, 8, 'skull', {
				size: [52, 78],
				stroke: '#4a0c0f',
				fill: '#f8d7d4',
				opacity: 0.8,
				tilt: 40,
			}),
		],
	},
	{
		id: 'bounce-back',
		name: 'Bounce Back',
		tier: 'uncommon',
		emblem: 'rotate-ccw',
		sky: ICY,
		scene: [
			{ kind: 'rect', colour: '#dceaf7', x: 0, y: 790, w: 1024, h: 240 },
			// A path down from the upper left, a bounce off the snow, and back
			// up again.
			...[
				[120, 250],
				[130, 340],
				[145, 430],
				[165, 520],
				[190, 610],
				[220, 700],
				[255, 780],
				[285, 720],
				[305, 650],
			].map(([x, y]) => ({
				kind: 'circle',
				colour: '#1c4f82',
				x,
				y,
				d: 20,
				opacity: 0.55,
			})),
		],
	},
	{
		id: 'frozen-out',
		name: 'Frozen Out',
		tier: 'uncommon',
		emblem: 'snowflake',
		sky: ['#f2fbff', '#2a78b0'],
		scene: [
			{
				kind: 'ring',
				colour: '#ffffff',
				x: 512,
				y: 512,
				d: 860,
				width: 26,
				opacity: 0.5,
			},
			...icons(21, 10, 'snowflake', {
				size: [80, 170],
				stroke: '#ffffff',
				fill: 'none',
				opacity: 0.8,
				tilt: 60,
			}),
		],
	},
	{
		id: 'hot-streak',
		name: 'Hot Streak',
		tier: 'uncommon',
		emblem: 'flame',
		sky: ['#fff3da', '#ef6f22'],
		scene: [
			...[160, 270, 380, 490, 600, 710, 820].map((x, i) => ({
				kind: 'icon',
				icon: 'flame',
				x,
				y: 880 - (i % 2) * 40,
				size: 230 + (i % 3) * 30,
				stroke: '#d9480f',
				fill: '#ff8c1a',
				angle: (i - 3) * 4,
			})),
			...[215, 435, 655].map((x) => ({
				kind: 'icon',
				icon: 'flame',
				x,
				y: 900,
				size: 150,
				stroke: '#f59f00',
				fill: '#ffd43b',
			})),
		],
	},
	{
		id: 'show-off',
		name: 'Show Off',
		tier: 'uncommon',
		emblem: 'sparkles',
		sky: ['#feeaff', '#ad46cf'],
		scene: [
			{ kind: 'rays', colour: '#ffffff', count: 12, opacity: 0.2 },
			...icons(22, 13, 'sparkle', {
				size: [40, 92],
				stroke: '#ffffff',
				fill: '#ffffff',
				opacity: 0.95,
				tilt: 30,
			}),
		],
	},
	{
		id: 'speedrunners',
		name: 'Speedrunners',
		tier: 'uncommon',
		emblem: 'zap',
		sky: ['#eef7ff', '#3b7cc8'],
		scene: [
			...[
				[90, 340, 260],
				[70, 420, 300],
				[100, 500, 250],
				[80, 580, 290],
				[110, 660, 240],
			].map(([x, y, w]) => ({
				kind: 'rect',
				colour: '#ffffff',
				x,
				y,
				w,
				h: 18,
				opacity: 0.75,
			})),
			{
				kind: 'icon',
				icon: 'zap',
				x: 800,
				y: 300,
				size: 150,
				stroke: '#e8590c',
				fill: '#ffd43b',
				angle: 12,
			},
			{
				kind: 'icon',
				icon: 'zap',
				x: 230,
				y: 230,
				size: 110,
				stroke: '#e8590c',
				fill: '#ffd43b',
				angle: -14,
			},
		],
	},
	{
		id: 'fresh-faces',
		name: 'Fresh Faces',
		tier: 'uncommon',
		emblem: 'sprout',
		sky: ['#f2fff0', '#5aa95e'],
		scene: [
			{ kind: 'ellipse', colour: '#8fd694', x: 512, y: 960, w: 1200, h: 420 },
			...[150, 250, 790].map((x, i) => ({
				kind: 'icon',
				icon: 'sprout',
				x,
				y: 800 - (i % 2) * 30,
				size: 110,
				stroke: '#2b8a3e',
			})),
			...[200, 300, 840, 120].map((x, i) => ({
				kind: 'icon',
				icon: 'flower',
				x,
				y: 720 + (i % 2) * 70,
				size: 72,
				stroke: '#c2255c',
				fill: '#ffd8e8',
			})),
			...icons(23, 4, 'sprout', {
				size: [60, 80],
				stroke: '#2b8a3e',
				fill: 'none',
				opacity: 0.5,
				tilt: 20,
			}),
		],
	},
	{
		id: 'reunion-tour',
		name: 'Reunion Tour',
		tier: 'uncommon',
		emblem: 'handshake',
		sky: ['#fff4e6', '#e07a50'],
		scene: [
			...icons(24, 8, 'heart', {
				size: [54, 84],
				stroke: '#c92a4a',
				fill: '#ff8fa3',
				opacity: 0.95,
				tilt: 40,
			}),
			{
				kind: 'icon',
				icon: 'bus',
				x: 210,
				y: 780,
				size: 150,
				stroke: '#1c3d5a',
				fill: '#ffd166',
				angle: -4,
			},
			{
				kind: 'icon',
				icon: 'map-pin',
				x: 800,
				y: 230,
				size: 96,
				stroke: '#1c3d5a',
				fill: '#ff6b6b',
			},
		],
	},
	{
		id: 'old-guard',
		name: 'Old Guard',
		tier: 'uncommon',
		emblem: 'castle',
		sky: ['#fbe9d7', '#5f4f8c'],
		scene: [
			{
				kind: 'icon',
				icon: 'castle',
				x: 230,
				y: 760,
				size: 330,
				stroke: '#2f2550',
				fill: '#4b3d6e',
				opacity: 0.85,
				strokeWidth: 1.6,
			},
			{
				kind: 'icon',
				icon: 'castle',
				x: 800,
				y: 660,
				size: 260,
				stroke: '#2f2550',
				fill: '#4b3d6e',
				opacity: 0.7,
				strokeWidth: 1.6,
			},
			{
				kind: 'rect',
				colour: '#2f2550',
				x: 0,
				y: 900,
				w: 1024,
				h: 130,
				opacity: 0.85,
			},
		],
	},

	// ---- Common -------------------------------------------------------------
	{
		id: 'universe-point',
		name: 'Universe Point',
		tier: 'common',
		emblem: 'target',
		sky: ICY,
		scene: [
			// An archery target: one point decides it.
			{ kind: 'circle', colour: '#f8f9fa', x: 512, y: 512, d: 820 },
			{ kind: 'circle', colour: '#343a40', x: 512, y: 512, d: 680 },
			{ kind: 'circle', colour: '#339af0', x: 512, y: 512, d: 540 },
			{ kind: 'circle', colour: '#e03131', x: 512, y: 512, d: 400 },
			{ kind: 'circle', colour: '#ffd43b', x: 512, y: 512, d: 260 },
		],
	},
	{
		id: 'just-warming-up',
		name: 'Just Warming Up',
		tier: 'common',
		emblem: 'thermometer',
		sky: ['#fff5e8', '#e3955a'],
		scene: [
			{
				kind: 'icon',
				icon: 'coffee',
				x: 200,
				y: 700,
				size: 170,
				stroke: '#7f4f24',
				fill: '#f3e3d3',
				angle: -6,
			},
			{
				kind: 'icon',
				icon: 'thermometer',
				x: 230,
				y: 330,
				size: 190,
				stroke: '#c92a2a',
				fill: '#ffe3e3',
				angle: -10,
			},
			{
				kind: 'icon',
				icon: 'coffee',
				x: 820,
				y: 360,
				size: 130,
				stroke: '#7f4f24',
				fill: '#f3e3d3',
				angle: 8,
			},
			...icons(25, 6, 'sparkle', {
				size: [26, 40],
				stroke: '#fff3bf',
				fill: '#fff3bf',
				opacity: 0.9,
			}),
		],
	},
	{
		id: 'welcome',
		name: 'Welcome',
		tier: 'common',
		emblem: 'party-popper',
		sky: ICY,
		scene: [
			...confetti(26, 24),
			{
				kind: 'icon',
				icon: 'party-popper',
				x: 210,
				y: 300,
				size: 150,
				stroke: '#7048e8',
				fill: '#e5dbff',
				angle: 0,
			},
			{
				kind: 'icon',
				icon: 'party-popper',
				x: 810,
				y: 300,
				size: 150,
				stroke: '#7048e8',
				fill: '#e5dbff',
				angle: 90,
			},
		],
	},
	{
		id: 'veteran',
		name: 'Veteran',
		tier: 'common',
		emblem: 'shield-check',
		sky: ['#eef3fa', '#46699e'],
		scene: [
			{
				kind: 'icon',
				icon: 'chevrons-up',
				x: 512,
				y: 520,
				size: 900,
				stroke: '#ffffff',
				opacity: 0.25,
				strokeWidth: 2.8,
			},
			...icons(27, 7, 'star', {
				size: [38, 58],
				stroke: '#ffffff',
				fill: '#ffffff',
				opacity: 0.8,
			}),
		],
	},

	// ---- Fall ---------------------------------------------------------------
	{
		id: 'turkey-bowl',
		name: 'Turkey Bowl',
		tier: 'fall',
		emblem: 'drumstick',
		sky: ['#fff1df', '#d65d2a'],
		scene: scatter(28, 14, ({ x, y, random, index }) => ({
			kind: 'icon',
			icon: 'leaf',
			x,
			y,
			size: 64 + random() * 50,
			angle: random() * 360,
			stroke: ['#a33f00', '#9c2020', '#b07d00'][index % 3],
			fill: ['#f08c00', '#d63a3a', '#fab005'][index % 3],
		})),
	},
	{
		id: 'opening-night',
		name: 'Opening Night',
		tier: 'fall',
		emblem: 'flag',
		sky: ['#5568c0', '#121a3d'],
		scene: [
			...burst(220, 300, 80, '#ffd43b'),
			...burst(810, 260, 70, '#ff6b9a'),
			...burst(300, 650, 60, '#63e6be'),
			...burst(190, 470, 40, '#ffffff', 8),
			...burst(840, 470, 46, '#a5d8ff', 10),
		],
	},
	{
		id: 'last-dance',
		name: 'Last Dance',
		tier: 'fall',
		emblem: 'music',
		sky: ['#f4e8ff', '#5a2a80'],
		scene: [
			{
				kind: 'polygon',
				colour: '#ff8fd1',
				opacity: 0.3,
				points: [80, 120, 170, 60, 560, 800, 380, 840],
			},
			{
				kind: 'polygon',
				colour: '#7ae7ff',
				opacity: 0.3,
				points: [944, 120, 854, 60, 464, 800, 644, 840],
			},
			...icons(29, 9, 'music', {
				size: [56, 90],
				stroke: '#ffffff',
				fill: 'none',
				opacity: 0.95,
				tilt: 40,
			}),
			...icons(30, 4, 'music-2', {
				size: [56, 80],
				stroke: '#ffe066',
				fill: 'none',
				opacity: 0.95,
				tilt: 40,
			}),
		],
	},
]
