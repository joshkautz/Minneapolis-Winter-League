import { ReactNode, cloneElement, isValidElement } from 'react'
import {
	FormField,
	FormItem,
	FormLabel,
	FormControl,
	FormMessage,
} from '@/components/ui/form'
import { ControllerProps, FieldPath, FieldValues } from 'react-hook-form'

interface FormFieldWrapperProps<
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends Omit<ControllerProps<TFieldValues, TName>, 'render'> {
	label: string
	children: ReactNode
}

/**
 * Reusable form field wrapper that provides consistent styling and structure
 * Reduces boilerplate for form fields across the application
 */
export function FormFieldWrapper<
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ label, children, ...props }: FormFieldWrapperProps<TFieldValues, TName>) {
	return (
		<FormField
			{...props}
			render={({ field }) => (
				<FormItem>
					<FormLabel>{label}</FormLabel>
					<FormControl>
						{isValidElement(children)
							? cloneElement(children, field)
							: children}
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	)
}
