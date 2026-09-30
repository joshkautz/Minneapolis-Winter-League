import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'

const loggerError = vi.fn()
vi.mock('firebase-functions/v2', () => ({
	logger: { error: (...args: unknown[]) => loggerError(...args) },
}))

const { handleFunctionError, rethrowAsHttpsError } = await import('./errors.js')

const caught = (run: () => never): unknown => {
	try {
		run()
	} catch (error) {
		return error
	}
	throw new Error('expected a throw')
}

beforeEach(() => loggerError.mockReset())

describe('rethrowAsHttpsError', () => {
	it("passes a callable's own refusal through unchanged", () => {
		const refusal = new HttpsError('permission-denied', 'Captains only.')
		expect(caught(() => rethrowAsHttpsError(refusal, 'Not saved.'))).toBe(
			refusal
		)
		expect(loggerError).not.toHaveBeenCalled()
	})

	it('hides anything else behind the fixed message, and logs it', () => {
		const failure = new Error('10 ABORTED: transaction contention')
		const thrown = caught(() =>
			rethrowAsHttpsError(failure, 'The team could not be saved.', {
				teamId: 't1',
			})
		)

		expect(thrown).toBeInstanceOf(HttpsError)
		expect((thrown as HttpsError).code).toBe('internal')
		expect((thrown as HttpsError).message).toBe('The team could not be saved.')
		expect(loggerError).toHaveBeenCalledWith(
			'The team could not be saved.',
			expect.objectContaining({
				error: '10 ABORTED: transaction contention',
				stack: failure.stack,
				teamId: 't1',
			})
		)
	})

	it('logs a thrown non-error as text', () => {
		caught(() => rethrowAsHttpsError('boom', 'Not saved.'))
		expect(loggerError).toHaveBeenCalledWith(
			'Not saved.',
			expect.objectContaining({ error: 'boom' })
		)
	})
})

describe('handleFunctionError', () => {
	it('names the context and keeps the original as the cause', () => {
		const failure = new Error('deadline exceeded')
		const wrapped = handleFunctionError(failure, 'userDeleted', { uid: 'u1' })

		expect(wrapped.message).toBe('userDeleted failed: deadline exceeded')
		expect(wrapped.cause).toBe(failure)
		expect(loggerError).toHaveBeenCalledWith(
			'Error in userDeleted:',
			expect.objectContaining({ error: 'deadline exceeded', uid: 'u1' })
		)
	})
})
