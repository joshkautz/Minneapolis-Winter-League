import { useId, useState, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useObjectUrl } from '@/shared/hooks/use-object-url'
import {
	ALLOWED_IMAGE_TYPES,
	ALLOWED_IMAGE_TYPES_LABEL,
	MAX_IMAGE_BYTES,
	formatMegabytes,
	imageProblem,
} from '@/shared/image-rules'

interface ImageFieldProps {
	label: string
	/** How the message names the image, capitalised: "The logo". */
	subject: string
	/** The image already saved, shown until a new file is chosen. */
	currentUrl?: string | null
	/** Called with the chosen file, or undefined when it cannot be used. */
	onFileChange: (file: File | undefined) => void
	disabled?: boolean
	previewAlt: string
	/** Shown in place of a preview when there is no image, if given. */
	emptyLabel?: string
	/** Controls shown under the preview, such as a remove button. */
	children?: ReactNode
}

/**
 * An image picker for team logos and badge images. A file that breaks the
 * upload rules is refused as soon as it is chosen, with the reason shown
 * under the field, so the form never sends an image the server would turn
 * away.
 */
export const ImageField = ({
	label,
	subject,
	currentUrl,
	onFileChange,
	disabled,
	previewAlt,
	emptyLabel,
	children,
}: ImageFieldProps) => {
	const inputId = useId()
	const descriptionId = `${inputId}-description`
	const errorId = `${inputId}-error`
	const [file, setFile] = useState<File>()
	const [problem, setProblem] = useState<string | null>(null)
	const previewUrl = useObjectUrl(file) ?? currentUrl ?? undefined

	const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const chosen = event.target.files?.[0]
		if (!chosen) return
		const reason = imageProblem(
			{ sizeBytes: chosen.size, contentType: chosen.type },
			subject
		)
		setProblem(reason)
		if (reason) {
			// Clear the input so choosing the same file again still fires.
			event.target.value = ''
			setFile(undefined)
			onFileChange(undefined)
			return
		}
		setFile(chosen)
		onFileChange(chosen)
	}

	return (
		<div className='space-y-2'>
			<Label htmlFor={inputId}>{label}</Label>
			<Input
				id={inputId}
				type='file'
				accept={ALLOWED_IMAGE_TYPES.join(',')}
				onChange={handleChange}
				disabled={disabled}
				aria-invalid={problem !== null}
				aria-describedby={
					problem ? `${descriptionId} ${errorId}` : descriptionId
				}
			/>
			<p id={descriptionId} className='text-xs text-muted-foreground'>
				{ALLOWED_IMAGE_TYPES_LABEL}, up to {formatMegabytes(MAX_IMAGE_BYTES)}
			</p>
			{problem && (
				<p id={errorId} role='alert' className='text-sm text-destructive'>
					{problem}
				</p>
			)}
			{previewUrl ? (
				<div className='group flex items-center justify-center w-40 h-40 mx-auto rounded-md overflow-hidden'>
					<img
						src={previewUrl}
						alt={previewAlt}
						className='w-full h-full object-cover transition-transform duration-300 group-hover:scale-105'
					/>
				</div>
			) : emptyLabel ? (
				<div className='flex items-center justify-center w-40 h-40 mx-auto rounded-md bg-muted'>
					<span className='text-sm text-muted-foreground'>{emptyLabel}</span>
				</div>
			) : null}
			{children}
		</div>
	)
}
