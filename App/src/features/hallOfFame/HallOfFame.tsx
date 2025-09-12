/**
 * Hall of Fame page component
 * 
 * Displays the player rankings in a sophisticated leaderboard format
 */

import React, { useState } from 'react'
import { useCollection } from 'react-firebase-hooks/firestore'

import { 
    currentPlayerRankingsQuery, 
    activePlayerRankingsQuery,
    topPlayerRankingsQuery 
} from '@/firebase/collections/hallOfFame'
import { PlayerRankingDocument } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Trophy, TrendingUp, TrendingDown, Medal, Crown, Award } from 'lucide-react'
import { cn } from '@/shared/utils'

interface HallOfFameProps {
    showAdminControls?: boolean
}

export const HallOfFame: React.FC<HallOfFameProps> = ({ showAdminControls = false }) => {
    const [viewMode, setViewMode] = useState<'all' | 'active' | 'top50'>('all')
    
    // Get the appropriate query based on view mode
    const getQuery = () => {
        switch (viewMode) {
            case 'active':
                return activePlayerRankingsQuery()
            case 'top50':
                return topPlayerRankingsQuery(50)
            default:
                return currentPlayerRankingsQuery()
        }
    }

    const [rankingsSnapshot, loading, error] = useCollection(getQuery())

    const rankings = rankingsSnapshot?.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as (PlayerRankingDocument & { id: string })[] | undefined

    if (error) {
        return (
            <div className="container mx-auto px-4 py-8">
                <Card>
                    <CardContent className="p-6">
                        <p className="text-red-600">Error loading Hall of Fame: {error.message}</p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="container mx-auto px-4 py-8 space-y-6">
            {/* Header */}
            <div className="text-center space-y-4">
                <h1 className="text-4xl font-bold flex items-center justify-center gap-3">
                    <Trophy className="h-10 w-10 text-yellow-500" />
                    Hall of Fame
                    <Trophy className="h-10 w-10 text-yellow-500" />
                </h1>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                    Player rankings based on performance across all seasons. Rankings consider point differentials, 
                    opponent strength, playoff performance, and recent activity.
                </p>
            </div>

            {/* View Mode Controls */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex flex-wrap gap-2 justify-center">
                        <Button
                            variant={viewMode === 'all' ? 'default' : 'outline'}
                            onClick={() => setViewMode('all')}
                            size="sm"
                        >
                            All Players
                        </Button>
                        <Button
                            variant={viewMode === 'active' ? 'default' : 'outline'}
                            onClick={() => setViewMode('active')}
                            size="sm"
                        >
                            Active Only
                        </Button>
                        <Button
                            variant={viewMode === 'top50' ? 'default' : 'outline'}
                            onClick={() => setViewMode('top50')}
                            size="sm"
                        >
                            Top 50
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Rankings Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Medal className="h-5 w-5" />
                        Player Rankings
                        {rankings && (
                            <Badge variant="secondary">
                                {rankings.length} players
                            </Badge>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-3">
                            {[...Array(10)].map((_, i) => (
                                <div key={i} className="flex items-center space-x-4">
                                    <Skeleton className="h-12 w-12 rounded-full" />
                                    <div className="space-y-2 flex-1">
                                        <Skeleton className="h-4 w-1/3" />
                                        <Skeleton className="h-3 w-1/4" />
                                    </div>
                                    <Skeleton className="h-6 w-16" />
                                </div>
                            ))}
                        </div>
                    ) : rankings && rankings.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-16">Rank</TableHead>
                                        <TableHead>Player</TableHead>
                                        <TableHead className="text-center">Rating</TableHead>
                                        <TableHead className="text-center">Change</TableHead>
                                        <TableHead className="text-center">Games</TableHead>
                                        <TableHead className="text-center">Seasons</TableHead>
                                        <TableHead className="text-center">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rankings.map((player) => (
                                        <TableRow 
                                            key={player.id}
                                            className={cn(
                                                "hover:bg-muted/50",
                                                player.rank <= 3 && "bg-gradient-to-r from-yellow-50 to-transparent"
                                            )}
                                        >
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    {player.rank === 1 && <Crown className="h-4 w-4 text-yellow-500" />}
                                                    {player.rank === 2 && <Award className="h-4 w-4 text-gray-400" />}
                                                    {player.rank === 3 && <Medal className="h-4 w-4 text-amber-600" />}
                                                    #{player.rank}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    <div className="font-medium">{player.playerName}</div>
                                                    {player.seasonStats.length > 0 && (
                                                        <div className="text-xs text-muted-foreground">
                                                            Last active: {player.seasonStats[player.seasonStats.length - 1]?.seasonName}
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <div className="font-mono font-medium text-lg">
                                                    {player.eloRating}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {player.lastRatingChange !== 0 && (
                                                    <div className={cn(
                                                        "flex items-center justify-center gap-1",
                                                        player.lastRatingChange > 0 ? "text-green-600" : "text-red-600"
                                                    )}>
                                                        {player.lastRatingChange > 0 ? (
                                                            <TrendingUp className="h-3 w-3" />
                                                        ) : (
                                                            <TrendingDown className="h-3 w-3" />
                                                        )}
                                                        {Math.abs(player.lastRatingChange)}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {player.totalGames}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {player.totalSeasons}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge 
                                                    variant={player.isActive ? "default" : "secondary"}
                                                    className={cn(
                                                        player.isActive 
                                                            ? "bg-green-100 text-green-800 hover:bg-green-200" 
                                                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                                    )}
                                                >
                                                    {player.isActive ? "Active" : "Inactive"}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground">No player rankings available yet.</p>
                            <p className="text-sm text-muted-foreground mt-2">
                                Rankings will appear after the first calculation is completed.
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Admin Controls */}
            {showAdminControls && (
                <Card>
                    <CardHeader>
                        <CardTitle>Admin Controls</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex gap-4">
                            <Button variant="outline">
                                Recalculate Rankings (Full)
                            </Button>
                            <Button variant="outline">
                                Update Rankings (Incremental)
                            </Button>
                            <Button variant="outline">
                                View Calculation History
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
