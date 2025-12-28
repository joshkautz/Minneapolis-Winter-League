import { ChangeEvent, useRef } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

interface FileUploadFieldProps {
	label: string
	accept?: string
	onFileSelect: (file: File) => void
	disabled?: boolean
	className?: string
	/** Optional description of accepted file types (e.g., "PNG, JPG up to 5MB") */
	acceptDescription?: string
}

/**
 * Reusable file upload field component
 * Provides consistent file upload UI across the application
 */
export const FileUploadField = ({
	label,
	accept = 'image/*',
	onFileSelect,
	disabled = false,
	className,
	acceptDescription,
}: FileUploadFieldProps) => {
	const fileInputRef = useRef<HTMLInputElement>(null)

	const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0]
		if (file) {
			onFileSelect(file)
		}
	}

	return (
		<div className={className}>
			<Label htmlFor='file-upload'>{label}</Label>
			<Input
				id='file-upload'
				ref={fileInputRef}
				type='file'
				accept={accept}
				onChange={handleFileChange}
				disabled={disabled}
				className='cursor-pointer'
				aria-describedby={
					acceptDescription ? 'file-upload-description' : undefined
				}
			/>
			{acceptDescription && (
				<p
					id='file-upload-description'
					className='text-xs text-muted-foreground mt-1'
				>
					{acceptDescription}
				</p>
			)}
		</div>
	)
}
