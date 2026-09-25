import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { REGISTRATION_SPOTS } from '@/shared/utils'

const { useTeamsContext } = vi.hoisted(() => ({ useTeamsContext: vi.fn() }))
vi.mock('@/providers', () => ({ useTeamsContext }))

const { useIsTeamRegistrationFull } =
	await import('./use-is-team-registration-full')

const teams = (registered: number, unregistered = 0) => ({
	currentSeasonTeamsQuerySnapshot: {
		docs: [
			...Array.from({ length: registered }, () => ({
				data: () => ({ registered: true }),
			})),
			...Array.from({ length: unregistered }, () => ({
				data: () => ({ registered: false }),
			})),
		],
	},
})

describe('useIsTeamRegistrationFull', () => {
	beforeEach(() => {
		useTeamsContext.mockReset()
	})

	it('is not full while a spot is left', () => {
		useTeamsContext.mockReturnValue(teams(REGISTRATION_SPOTS - 1, 5))
		const { result } = renderHook(() => useIsTeamRegistrationFull())
		expect(result.current).toBe(false)
	})

	it('is full once every spot is registered', () => {
		useTeamsContext.mockReturnValue(teams(REGISTRATION_SPOTS))
		const { result } = renderHook(() => useIsTeamRegistrationFull())
		expect(result.current).toBe(true)
	})

	it('counts only registered teams, however many have signed up', () => {
		useTeamsContext.mockReturnValue(teams(0, REGISTRATION_SPOTS + 3))
		const { result } = renderHook(() => useIsTeamRegistrationFull())
		expect(result.current).toBe(false)
	})

	it('is not full before the teams have loaded', () => {
		useTeamsContext.mockReturnValue({
			currentSeasonTeamsQuerySnapshot: undefined,
		})
		const { result } = renderHook(() => useIsTeamRegistrationFull())
		expect(result.current).toBe(false)
	})
})
