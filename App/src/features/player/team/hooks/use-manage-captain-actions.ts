import { useCallback, useMemo, useState } from 'react'
import {
	deleteTeamViaFunction,
	manageTeamPlayerViaFunction,
} from '@/firebase/collections/functions'
import { toast } from 'sonner'
import { logger } from '@/shared/utils'
import { useTeamsContext } from '@/providers'
import { useUserStatus } from '@/shared/hooks/use-user-status'

/**
 * Custom hook for managing captain actions (edit, leave, delete team)
 *
 * Encapsulates state management and business logic for team captain operations.
 */
export const useManageCaptainActions = () => {
	const { currentSeasonTeamsQuerySnapshot } = useTeamsContext()
	const { userSnapshot: authenticatedUserSnapshot, currentSeasonData } =
		useUserStatus()

	// UI state
	const [open, setOpen] = useState(false)
	const [editTeamDialogOpen, setEditTeamDialogOpen] = useState(false)
	const [leaveTeamDialogOpen, setLeaveTeamDialogOpen] = useState(false)
	const [deleteTeamDialogOpen, setDeleteTeamDialogOpen] = useState(false)

	// Computed team data
	const teamQueryDocumentSnapshot = useMemo(
		() =>
			currentSeasonTeamsQuerySnapshot?.docs.find(
				(team) => team.id === currentSeasonData?.team?.id
			),
		[currentSeasonTeamsQuerySnapshot, currentSeasonData]
	)

	// Remove user from team handler
	const removeFromTeamOnClickHandler = useCallback(async () => {
		if (!authenticatedUserSnapshot?.id || !teamQueryDocumentSnapshot?.id) {
			toast.error('Missing required data to leave team')
			return
		}

		try {
			await manageTeamPlayerViaFunction({
				teamId: teamQueryDocumentSnapshot.id,
				playerId: authenticatedUserSnapshot.id,
				action: 'remove',
			})

			logger.userAction('team_left', 'useManageCaptainActions', {
				teamId: teamQueryDocumentSnapshot?.id,
				userId: authenticatedUserSnapshot?.id,
			})
			logger.firebase('removeFromTeam', 'teams', undefined, {
				teamId: teamQueryDocumentSnapshot?.id,
			})
			toast.success('Success', {
				description: 'You have left the team.',
			})
			// Close the confirmation dialog
			setLeaveTeamDialogOpen(false)
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error)

			logger.error(
				'Leave team failed',
				error instanceof Error ? error : new Error(errorMessage),
				{
					component: 'useManageCaptainActions',
					action: 'leave_team',
					teamId: teamQueryDocumentSnapshot?.id,
				}
			)

			// Show the specific error message from Firebase function
			toast.error('Failed to leave team', {
				description: errorMessage,
			})
		}
	}, [authenticatedUserSnapshot, teamQueryDocumentSnapshot])

	// Delete team handler
	const deleteTeamOnClickHandler = useCallback(async () => {
		if (!teamQueryDocumentSnapshot?.id) {
			toast.error('Missing team data to delete team')
			return
		}

		try {
			await deleteTeamViaFunction(teamQueryDocumentSnapshot.id)

			logger.userAction('team_deleted', 'useManageCaptainActions', {
				teamId: teamQueryDocumentSnapshot?.id,
				userId: authenticatedUserSnapshot?.id,
			})
			logger.firebase('deleteTeam', 'teams', undefined, {
				teamId: teamQueryDocumentSnapshot?.id,
			})
			toast.success('Success', {
				description: 'Team has been deleted.',
			})
			// Close the confirmation dialog
			setDeleteTeamDialogOpen(false)
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error)

			logger.error(
				'Delete team failed',
				error instanceof Error ? error : new Error(errorMessage),
				{
					component: 'useManageCaptainActions',
					action: 'delete_team',
					teamId: teamQueryDocumentSnapshot?.id,
				}
			)

			// Show the specific error message from Firebase function
			toast.error('Failed to delete team', {
				description: errorMessage,
			})
		}
	}, [authenticatedUserSnapshot, teamQueryDocumentSnapshot])

	// Edit team handler
	const handleEditTeamClick = useCallback(() => {
		// Close dropdown first
		setOpen(false)
		// Open dialog immediately - let Radix handle focus management
		setEditTeamDialogOpen(true)
	}, [])

	// Leave team dialog handler
	const handleLeaveTeamClick = useCallback(() => {
		// Close dropdown first
		setOpen(false)
		// Open confirmation dialog
		setLeaveTeamDialogOpen(true)
	}, [])

	// Delete team dialog handler
	const handleDeleteTeamClick = useCallback(() => {
		// Close dropdown first
		setOpen(false)
		// Open confirmation dialog
		setDeleteTeamDialogOpen(true)
	}, [])

	return {
		// State
		open,
		setOpen,
		editTeamDialogOpen,
		setEditTeamDialogOpen,
		leaveTeamDialogOpen,
		setLeaveTeamDialogOpen,
		deleteTeamDialogOpen,
		setDeleteTeamDialogOpen,

		// Data
		teamQueryDocumentSnapshot,

		// Handlers
		removeFromTeamOnClickHandler,
		deleteTeamOnClickHandler,
		handleEditTeamClick,
		handleLeaveTeamClick,
		handleDeleteTeamClick,
	}
}
