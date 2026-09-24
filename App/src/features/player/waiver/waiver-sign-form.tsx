import { useMemo } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { LoadingButton } from '@/shared/components'
import {
	WAIVER_LIMITS,
	fillParticipant,
	type WaiverVersion,
} from '@/shared/waiver'
import {
	EMPTY_CONTACT,
	isMinorForForm,
	waiverFormSchema,
	type WaiverFormValues,
} from './waiver-form-schema'
import { WaiverDocument, WaiverParagraphText } from './waiver-document'

/**
 * Read, fill in and sign the waiver, on one page.
 *
 * Four short sections in the order of the original form — the text, the
 * participant, emergency contacts, the signature — so nothing is hidden
 * behind a step. When the date of birth makes the player a minor, the
 * signature section turns into the parent or guardian's, as the paper form's
 * second page did.
 */
export const WaiverSignForm = ({
	version,
	participantName,
	today,
	defaultValues,
	onSubmit,
}: {
	version: WaiverVersion
	participantName: string
	/** `YYYY-MM-DD` in Minneapolis */
	today: string
	/** From the player's last signature, so a returning player need not retype. */
	defaultValues?: Partial<WaiverFormValues>
	onSubmit: (values: WaiverFormValues) => Promise<void>
}) => {
	const schema = useMemo(
		() => waiverFormSchema({ participantName, today }),
		[participantName, today]
	)
	const form = useForm<WaiverFormValues>({
		resolver: standardSchemaResolver(schema),
		mode: 'onTouched',
		defaultValues: {
			dateOfBirth: '',
			mailingAddress: '',
			emergencyContacts: [EMPTY_CONTACT],
			signerName: '',
			guardianRelationship: '',
			agreed: false,
			...defaultValues,
		},
	})
	const contacts = useFieldArray({
		control: form.control,
		name: 'emergencyContacts',
	})

	const dateOfBirth = useWatch({ control: form.control, name: 'dateOfBirth' })
	const minor = isMinorForForm(dateOfBirth, today)
	const submitting = form.formState.isSubmitting
	const contactsError = form.formState.errors.emergencyContacts?.message

	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit(onSubmit)}
				className='space-y-6'
				noValidate
			>
				<Card>
					<CardContent className='pt-6'>
						<WaiverDocument
							version={version}
							participantName={participantName}
						/>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className='text-base'>About the participant</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm'>
							<span className='text-muted-foreground'>Participant: </span>
							<span className='font-medium'>{participantName}</span>
						</p>
						<FormField
							control={form.control}
							name='dateOfBirth'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Date of birth</FormLabel>
									<FormControl>
										<Input
											type='date'
											max={today}
											autoComplete='bday'
											className='max-w-xs'
											{...field}
										/>
									</FormControl>
									<FormDescription>
										Players under 18 are signed for by a parent or guardian.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name='mailingAddress'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Mailing address</FormLabel>
									<FormControl>
										<Textarea
											rows={2}
											autoComplete='street-address'
											maxLength={WAIVER_LIMITS.MAX_ADDRESS_LENGTH}
											placeholder='Street, city, state and ZIP'
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className='text-base'>Emergency contacts</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							{version.emergencyContactsIntro}
						</p>
						{contacts.fields.map((contact, index) => (
							<fieldset
								key={contact.id}
								className='space-y-3 rounded-md border p-3 sm:p-4'
							>
								<div className='flex items-center justify-between gap-2'>
									<legend className='text-sm font-medium'>
										Contact {index + 1}
										{index === 0 && ' (required)'}
									</legend>
									{index > 0 && (
										<Button
											type='button'
											variant='ghost'
											size='sm'
											onClick={() => contacts.remove(index)}
											aria-label={`Remove contact ${index + 1}`}
										>
											<Trash2 className='h-4 w-4' aria-hidden='true' />
											Remove
										</Button>
									)}
								</div>
								<div className='grid gap-3 sm:grid-cols-3'>
									<FormField
										control={form.control}
										name={`emergencyContacts.${index}.name`}
										render={({ field }) => (
											<FormItem>
												<FormLabel>Name</FormLabel>
												<FormControl>
													<Input autoComplete='off' {...field} />
												</FormControl>
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name={`emergencyContacts.${index}.relationship`}
										render={({ field }) => (
											<FormItem>
												<FormLabel>Relationship</FormLabel>
												<FormControl>
													<Input
														autoComplete='off'
														placeholder='Partner, parent…'
														{...field}
													/>
												</FormControl>
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name={`emergencyContacts.${index}.phone`}
										render={({ field }) => (
											<FormItem>
												<FormLabel>Phone</FormLabel>
												<FormControl>
													<Input
														type='tel'
														inputMode='tel'
														autoComplete='off'
														{...field}
													/>
												</FormControl>
											</FormItem>
										)}
									/>
								</div>
							</fieldset>
						))}
						{contactsError && (
							<p role='alert' className='text-sm text-destructive'>
								{contactsError}
							</p>
						)}
						{contacts.fields.length < WAIVER_LIMITS.MAX_EMERGENCY_CONTACTS && (
							<Button
								type='button'
								variant='outline'
								size='sm'
								onClick={() => contacts.append(EMPTY_CONTACT)}
							>
								<Plus className='h-4 w-4' aria-hidden='true' />
								Add another contact
							</Button>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className='text-base'>
							{minor ? 'Parent or guardian signature' : 'Signature'}
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						{minor ? (
							<div className='space-y-3 text-sm'>
								<p>{version.guardianIntro}</p>
								<WaiverParagraphText
									paragraph={version.guardianCertification}
									participantName={participantName}
								/>
							</div>
						) : (
							<p className='text-sm font-semibold leading-relaxed'>
								{version.adultAffirmation}
							</p>
						)}

						<FormField
							control={form.control}
							name='agreed'
							render={({ field }) => (
								<FormItem className='flex items-start gap-3 rounded-md border p-3'>
									<FormControl>
										<Checkbox
											checked={field.value}
											onCheckedChange={(checked) =>
												field.onChange(checked === true)
											}
											onBlur={field.onBlur}
											className='mt-0.5'
										/>
									</FormControl>
									<div className='space-y-1'>
										<FormLabel className='font-normal leading-snug'>
											{minor
												? fillParticipant(
														version.guardianAgreement,
														participantName
													)
												: version.agreement}
										</FormLabel>
										<FormMessage />
									</div>
								</FormItem>
							)}
						/>

						<div className='grid gap-4 sm:grid-cols-2'>
							<FormField
								control={form.control}
								name='signerName'
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{minor
												? "Parent or guardian's full name"
												: 'Type your full name to sign'}
										</FormLabel>
										<FormControl>
											<Input
												autoComplete={minor ? 'off' : 'name'}
												maxLength={WAIVER_LIMITS.MAX_NAME_LENGTH}
												className='font-medium'
												{...field}
											/>
										</FormControl>
										<FormDescription>
											{minor
												? version.electronicSignatureConsent
												: `As it appears on your profile: ${participantName}. ${version.electronicSignatureConsent}`}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							{minor && (
								<FormField
									control={form.control}
									name='guardianRelationship'
									render={({ field }) => (
										<FormItem>
											<FormLabel>Relationship to {participantName}</FormLabel>
											<FormControl>
												<Input
													autoComplete='off'
													maxLength={WAIVER_LIMITS.MAX_RELATIONSHIP_LENGTH}
													placeholder='Mother, father, guardian…'
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}
						</div>

						<LoadingButton
							type='submit'
							size='lg'
							className='w-full sm:w-auto'
							loading={submitting}
							loadingText='Signing…'
						>
							Sign waiver
						</LoadingButton>
					</CardContent>
				</Card>
			</form>
		</Form>
	)
}
