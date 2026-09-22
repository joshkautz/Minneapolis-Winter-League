import { describe, expect, it } from 'vitest'
import {
	calculateTeamMu,
	calculateTeamSigma,
	normCdf,
	normPdf,
	updateRatings,
	vWin,
	wWin,
} from './trueskill.js'
import { TRUESKILL_CONSTANTS } from '../constants.js'

/**
 * TrueSkill produces the public player rankings. The maths is easy to break
 * subtly — a sign flip or a swapped sigma still returns plausible-looking
 * numbers — so these pin the properties the algorithm must hold rather than
 * just exercising the functions.
 */

const { INITIAL_MU, INITIAL_SIGMA, MIN_SIGMA } = TRUESKILL_CONSTANTS
const newPlayer = () => ({ mu: INITIAL_MU, sigma: INITIAL_SIGMA })

describe('normCdf', () => {
	it('is 0.5 at the mean', () => {
		expect(normCdf(0)).toBeCloseTo(0.5, 6)
	})

	it('matches known values of the standard normal', () => {
		expect(normCdf(1)).toBeCloseTo(0.8413, 3)
		expect(normCdf(-1)).toBeCloseTo(0.1587, 3)
		expect(normCdf(1.96)).toBeCloseTo(0.975, 3)
	})

	it('is symmetric about zero', () => {
		for (const x of [0.5, 1, 2, 3]) {
			expect(normCdf(x) + normCdf(-x)).toBeCloseTo(1, 6)
		}
	})

	it('is monotonically increasing', () => {
		const xs = [-3, -1, 0, 1, 3]
		const ys = xs.map(normCdf)
		expect(ys).toEqual([...ys].sort((a, b) => a - b))
	})

	it('saturates in the tails without going out of bounds', () => {
		expect(normCdf(-10)).toBeGreaterThanOrEqual(0)
		expect(normCdf(10)).toBeLessThanOrEqual(1)
	})
})

describe('normPdf', () => {
	it('peaks at the mean with the standard normal constant', () => {
		expect(normPdf(0)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 6)
	})

	it('is symmetric and decreasing away from zero', () => {
		expect(normPdf(1)).toBeCloseTo(normPdf(-1), 10)
		expect(normPdf(2)).toBeLessThan(normPdf(1))
	})
})

describe('vWin and wWin', () => {
	it('vWin is positive, so a win always pushes mu upward', () => {
		for (const t of [-3, 0, 3]) {
			expect(vWin(t, 0.001)).toBeGreaterThan(0)
		}
	})

	it('vWin is larger for an upset than for an expected win', () => {
		// A low t means the winner was the weaker side: bigger correction.
		expect(vWin(-2, 0.001)).toBeGreaterThan(vWin(2, 0.001))
	})

	it('wWin stays within (0, 1), so variance only shrinks', () => {
		for (const t of [-3, -1, 0, 1, 3]) {
			const w = wWin(t, 0.001)
			expect(w).toBeGreaterThan(0)
			expect(w).toBeLessThan(1)
		}
	})
})

describe('team aggregation', () => {
	it('sums mu across the roster', () => {
		expect(
			calculateTeamMu([
				{ mu: 25, sigma: 8 },
				{ mu: 30, sigma: 8 },
			])
		).toBe(55)
	})

	it('combines sigma in quadrature and adds per-player performance variance', () => {
		// sigma_team^2 = sum(sigma_i^2) + n * BETA^2, so two players with
		// sigma 3 and 4 give sqrt(9 + 16 + 2*BETA^2), not the bare sqrt(25) = 5.
		const { BETA } = TRUESKILL_CONSTANTS
		expect(
			calculateTeamSigma([
				{ mu: 25, sigma: 3 },
				{ mu: 25, sigma: 4 },
			])
		).toBeCloseTo(Math.sqrt(9 + 16 + 2 * BETA * BETA), 10)
	})

	it('adds one BETA term for a single-player team', () => {
		const { BETA } = TRUESKILL_CONSTANTS
		expect(calculateTeamMu([{ mu: 25, sigma: 8 }])).toBe(25)
		expect(calculateTeamSigma([{ mu: 25, sigma: 8 }])).toBeCloseTo(
			Math.sqrt(64 + BETA * BETA),
			10
		)
	})

	it('grows team uncertainty as the roster grows', () => {
		// More players means more combined performance variance.
		const one = calculateTeamSigma([{ mu: 25, sigma: 8 }])
		const three = calculateTeamSigma([
			{ mu: 25, sigma: 8 },
			{ mu: 25, sigma: 8 },
			{ mu: 25, sigma: 8 },
		])
		expect(three).toBeGreaterThan(one)
	})
})

describe('updateRatings', () => {
	it('raises the winner’s mu and lowers the loser’s', () => {
		const { winners, losers } = updateRatings([newPlayer()], [newPlayer()])
		expect(winners[0].mu).toBeGreaterThan(INITIAL_MU)
		expect(losers[0].mu).toBeLessThan(INITIAL_MU)
	})

	it('reduces uncertainty for everyone who played', () => {
		// Every game is evidence, win or lose.
		const { winners, losers } = updateRatings([newPlayer()], [newPlayer()])
		expect(winners[0].sigma).toBeLessThan(INITIAL_SIGMA)
		expect(losers[0].sigma).toBeLessThan(INITIAL_SIGMA)
	})

	it('moves evenly matched players by equal and opposite amounts', () => {
		const { winners, losers } = updateRatings([newPlayer()], [newPlayer()])
		const gain = winners[0].mu - INITIAL_MU
		const loss = INITIAL_MU - losers[0].mu
		expect(gain).toBeCloseTo(loss, 10)
	})

	it('moves ratings more after an upset than after an expected result', () => {
		const strong = { mu: 40, sigma: INITIAL_SIGMA }
		const weak = { mu: 10, sigma: INITIAL_SIGMA }

		const upset = updateRatings([weak], [strong])
		const expected = updateRatings([strong], [weak])

		const upsetGain = upset.winners[0].mu - weak.mu
		const expectedGain = expected.winners[0].mu - strong.mu
		expect(upsetGain).toBeGreaterThan(expectedGain)
	})

	it('moves a confident player less than an uncertain one', () => {
		// mu shifts in proportion to sigma^2, so an established player is stickier.
		const confident = updateRatings([{ mu: 25, sigma: 1 }], [newPlayer()])
		const uncertain = updateRatings([{ mu: 25, sigma: 8 }], [newPlayer()])
		expect(confident.winners[0].mu - 25).toBeLessThan(
			uncertain.winners[0].mu - 25
		)
	})

	it('scales the update by the playoff multiplier', () => {
		const regular = updateRatings([newPlayer()], [newPlayer()], 1.0)
		const playoff = updateRatings([newPlayer()], [newPlayer()], 2.0)
		const regularGain = regular.winners[0].mu - INITIAL_MU
		const playoffGain = playoff.winners[0].mu - INITIAL_MU
		expect(playoffGain).toBeCloseTo(regularGain * 2, 10)
	})

	it('updates every member of a multi-player roster', () => {
		const { winners, losers } = updateRatings(
			[newPlayer(), newPlayer(), newPlayer()],
			[newPlayer(), newPlayer(), newPlayer()]
		)
		expect(winners).toHaveLength(3)
		expect(losers).toHaveLength(3)
		for (const w of winners) expect(w.mu).toBeGreaterThan(INITIAL_MU)
		for (const l of losers) expect(l.mu).toBeLessThan(INITIAL_MU)
	})

	it('never drops sigma below the floor', () => {
		const { winners, losers } = updateRatings(
			[{ mu: 25, sigma: MIN_SIGMA }],
			[{ mu: 25, sigma: MIN_SIGMA }]
		)
		expect(winners[0].sigma).toBeGreaterThanOrEqual(MIN_SIGMA)
		expect(losers[0].sigma).toBeGreaterThanOrEqual(MIN_SIGMA)
	})

	it('produces finite numbers for extreme mismatches', () => {
		// Guards against divide-by-zero or NaN leaking into stored rankings.
		const { winners, losers } = updateRatings(
			[{ mu: 1000, sigma: 0.01 }],
			[{ mu: -1000, sigma: 0.01 }]
		)
		for (const r of [...winners, ...losers]) {
			expect(Number.isFinite(r.mu)).toBe(true)
			expect(Number.isFinite(r.sigma)).toBe(true)
		}
	})

	it('converges toward a stable rating over repeated wins', () => {
		let rating = newPlayer()
		for (let i = 0; i < 20; i++) {
			rating = updateRatings([rating], [newPlayer()]).winners[0]
		}
		expect(rating.mu).toBeGreaterThan(INITIAL_MU)
		expect(rating.sigma).toBeLessThan(INITIAL_SIGMA)
		expect(Number.isFinite(rating.mu)).toBe(true)
	})
})
