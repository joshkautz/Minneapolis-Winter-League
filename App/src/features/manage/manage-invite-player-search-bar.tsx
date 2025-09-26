import { LoadingSpinner } from '@/shared/components'
import { Input } from '@/components/ui/input'

export const ManageInvitePlayerSearchBar = ({
	value,
	onChange,
	searching,
}: {
	value: string
	onChange: React.Dispatch<React.SetStateAction<string>>
	searching: boolean
}) => {
	return (
		<div className={'mt-2 relative'}>
			<Input
				placeholder={'Start typing to search...'}
				value={value}
				onChange={(e) => onChange(e.target.value)}
			/>
			{searching && (
				<div className={'absolute inset-y-0 right-3 h-full items-center flex'}>
					<LoadingSpinner size='sm' className='text-muted-foreground' />
				</div>
			)}
		</div>
	)
}
