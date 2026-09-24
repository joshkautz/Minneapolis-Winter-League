import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { currentWaiverVersion } from '@/shared/waiver'
import { WaiverSignForm } from './waiver-sign-form'
import type { WaiverFormValues } from './waiver-form-schema'

/**
 * The waiver form a player signs in the app. The server re-checks all of it;
 * these pin what the player sees: the right signature section for their age,
 * and a form that cannot be sent half-filled.
 */

const TODAY = '2026-10-01'

const renderForm = (
	onSubmit = vi.fn(async (_values: WaiverFormValues) => {})
) => {
	render(
		<WaiverSignForm
			version={currentWaiverVersion()}
			participantName='Test Player'
			today={TODAY}
			onSubmit={onSubmit}
		/>
	)
	return onSubmit
}

const fillCommon = async (dateOfBirth: string) => {
	fireEvent.change(screen.getByLabelText('Date of birth'), {
		target: { value: dateOfBirth },
	})
	await userEvent.type(
		screen.getByLabelText('Mailing address'),
		'123 Main St, Minneapolis, MN'
	)
	await userEvent.type(screen.getByLabelText('Name'), 'Sam Doe')
	await userEvent.type(screen.getByLabelText('Relationship'), 'Partner')
	await userEvent.type(screen.getByLabelText('Phone'), '612 555 0100')
}

describe('WaiverSignForm', () => {
	it('shows the whole waiver to read', () => {
		renderForm()

		expect(
			screen.getByRole('heading', { name: 'Waiver and Release of Liability' })
		).toBeInTheDocument()
		expect(
			screen.getByText(/I AM VOLUNTARILY PARTICIPATING/)
		).toBeInTheDocument()
	})

	it('signs as an adult', async () => {
		const onSubmit = renderForm()

		await fillCommon('1990-05-17')
		await userEvent.click(screen.getByRole('checkbox'))
		await userEvent.type(
			screen.getByLabelText('Type your full name to sign'),
			'Test Player'
		)
		await userEvent.click(screen.getByRole('button', { name: 'Sign waiver' }))

		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
		expect(onSubmit.mock.calls[0][0]).toMatchObject({
			dateOfBirth: '1990-05-17',
			signerName: 'Test Player',
			agreed: true,
			emergencyContacts: [
				{ name: 'Sam Doe', relationship: 'Partner', phone: '612 555 0100' },
			],
		})
	})

	it('turns the signature into a parent or guardian’s for a minor', async () => {
		renderForm()

		expect(screen.queryByText(/I HEREBY CERTIFY/)).not.toBeInTheDocument()
		fireEvent.change(screen.getByLabelText('Date of birth'), {
			target: { value: '2012-06-01' },
		})

		expect(
			await screen.findByLabelText("Parent or guardian's full name")
		).toBeInTheDocument()
		expect(
			screen.getByLabelText('Relationship to Test Player')
		).toBeInTheDocument()
		expect(screen.getByText(/I HEREBY CERTIFY/)).toBeInTheDocument()
		expect(
			screen.queryByText(/AFFIRM THAT I AM OF THE AGE OF 18/)
		).not.toBeInTheDocument()
	})

	it('does not send an incomplete form, and says what is missing', async () => {
		const onSubmit = renderForm()

		await userEvent.click(screen.getByRole('button', { name: 'Sign waiver' }))

		expect(
			await screen.findByText('Enter your date of birth.')
		).toBeInTheDocument()
		expect(screen.getByText('Enter your mailing address.')).toBeInTheDocument()
		expect(
			screen.getByText('Check the box to agree to the waiver.')
		).toBeInTheDocument()
		expect(onSubmit).not.toHaveBeenCalled()
	})

	it('adds and removes emergency contacts, up to three', async () => {
		renderForm()

		const add = () =>
			userEvent.click(
				screen.getByRole('button', { name: 'Add another contact' })
			)
		await add()
		await add()

		expect(screen.getAllByLabelText('Name')).toHaveLength(3)
		expect(
			screen.queryByRole('button', { name: 'Add another contact' })
		).not.toBeInTheDocument()

		await userEvent.click(
			screen.getByRole('button', { name: 'Remove contact 3' })
		)
		expect(screen.getAllByLabelText('Name')).toHaveLength(2)
	})

	it('fills in the last signature’s details for a returning player', () => {
		render(
			<WaiverSignForm
				version={currentWaiverVersion()}
				participantName='Test Player'
				today={TODAY}
				defaultValues={{
					dateOfBirth: '1990-05-17',
					mailingAddress: '9 Old Rd',
					emergencyContacts: [
						{
							name: 'Old Contact',
							relationship: 'Friend',
							phone: '6125550000',
						},
					],
				}}
				onSubmit={vi.fn()}
			/>
		)

		expect(screen.getByLabelText('Mailing address')).toHaveValue('9 Old Rd')
		expect(screen.getByLabelText('Name')).toHaveValue('Old Contact')
		// The signature itself is never carried over.
		expect(screen.getByRole('checkbox')).not.toBeChecked()
		expect(screen.getByLabelText('Type your full name to sign')).toHaveValue('')
	})
})
