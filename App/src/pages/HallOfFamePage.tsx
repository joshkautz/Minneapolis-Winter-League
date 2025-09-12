/**
 * Hall of Fame page with conditional admin interface
 */

import React from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument } from 'react-firebase-hooks/firestore'

import { auth } from '@/firebase/auth'
import { getPlayerRef } from '@/firebase/collections/players'
import { HallOfFame } from '@/features/hallOfFame/HallOfFame'
import { HallOfFameAdmin } from '@/features/hallOfFame/HallOfFameAdmin'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Shield, Trophy } from 'lucide-react'

export const HallOfFamePage: React.FC = () => {
    const [user] = useAuthState(auth)
    const playerRef = getPlayerRef(user)
    const [playerSnapshot] = useDocument(playerRef)
    
    const isAdmin = playerSnapshot?.data()?.admin || false

    if (!isAdmin) {
        // Regular users see only the Hall of Fame
        return <HallOfFame />
    }

    // Admins see both the Hall of Fame and admin interface
    return (
        <Tabs defaultValue="hall-of-fame" className="w-full">
            <div className="container mx-auto px-4 py-8">
                <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
                    <TabsTrigger value="hall-of-fame" className="flex items-center gap-2">
                        <Trophy className="h-4 w-4" />
                        Hall of Fame
                    </TabsTrigger>
                    <TabsTrigger value="admin" className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Admin
                    </TabsTrigger>
                </TabsList>
            </div>
            
            <TabsContent value="hall-of-fame" className="mt-0">
                <HallOfFame showAdminControls={false} />
            </TabsContent>
            
            <TabsContent value="admin" className="mt-0">
                <HallOfFameAdmin />
            </TabsContent>
        </Tabs>
    )
}
