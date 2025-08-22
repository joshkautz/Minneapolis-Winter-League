import { ReloadIcon } from '@radix-ui/react-icons'
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
					<ReloadIcon
						className={'w-4 h-4 text-muted-foreground animate-spin'}
					/>
				</div>
			)}
		</div>
	)
}
