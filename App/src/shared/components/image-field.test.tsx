import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImageField } from './image-field'
import { MAX_IMAGE_BYTES } from '@/shared/image-rules'

/**
 * The image picker refuses a file the server would turn away as soon as it
 * is chosen, in the server's words, and never hands it to the form.
 */

const fileOf = (bytes: number, type: string, name = 'logo.png'): File => {
	const file = new File(['x'], name, { type })
	Object.defineProperty(file, 'size', { value: bytes })
	return file
}

let onFileChange: ReturnType<typeof vi.fn<(file: File | undefined) => void>>

const renderField = () =>
	render(
		<ImageField
			label='Team Logo'
			subject='The logo'
			onFileChange={onFileChange}
			previewAlt='Logo preview'
			emptyLabel='No logo'
		/>
	)

beforeEach(() => {
	onFileChange = vi.fn()
	URL.createObjectURL = vi.fn(() => 'blob:preview')
	URL.revokeObjectURL = vi.fn()
})

describe('ImageField', () => {
	it('says what it accepts', () => {
		renderField()
		expect(
			screen.getByText('PNG, JPEG, GIF or WebP, up to 5.0 MB')
		).toBeVisible()
		expect(screen.getByLabelText('Team Logo')).toHaveAttribute(
			'accept',
			'image/png,image/jpeg,image/gif,image/webp'
		)
	})

	it('passes an accepted image on and previews it', async () => {
		const user = userEvent.setup()
		renderField()
		const file = fileOf(1024, 'image/png')

		await user.upload(screen.getByLabelText('Team Logo'), file)

		expect(onFileChange).toHaveBeenLastCalledWith(file)
		expect(screen.getByAltText('Logo preview')).toHaveAttribute(
			'src',
			'blob:preview'
		)
		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	})

	it('refuses an image over the limit, saying how big it is', async () => {
		const user = userEvent.setup()
		renderField()

		await user.upload(
			screen.getByLabelText('Team Logo'),
			fileOf(MAX_IMAGE_BYTES + 1024 * 1024, 'image/jpeg')
		)

		expect(screen.getByRole('alert')).toHaveTextContent(
			'The logo is 6.0 MB, and the limit is 5.0 MB.'
		)
		expect(screen.getByLabelText('Team Logo')).toHaveAttribute(
			'aria-invalid',
			'true'
		)
		expect(onFileChange).toHaveBeenLastCalledWith(undefined)
		expect(screen.getByText('No logo')).toBeVisible()
	})

	it('clears the refusal once a good image is chosen', async () => {
		const user = userEvent.setup()
		renderField()
		const input = screen.getByLabelText('Team Logo')

		await user.upload(input, fileOf(MAX_IMAGE_BYTES * 2, 'image/png'))
		await user.upload(input, fileOf(10, 'image/png'))

		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	})

	it('shows the saved image until a new one is chosen', () => {
		render(
			<ImageField
				label='Team Logo'
				subject='The logo'
				currentUrl='https://example.com/current.png'
				onFileChange={onFileChange}
				previewAlt='Current logo'
			/>
		)
		expect(screen.getByAltText('Current logo')).toHaveAttribute(
			'src',
			'https://example.com/current.png'
		)
	})
})
