import React, { useState, useMemo } from "react";
import { useGamesContext } from "@/providers/games-context";
import { useSeasonsContext } from "@/providers/seasons-context";
import { useCollection } from "react-firebase-hooks/firestore";
import { doc, updateDoc, query, collection, where, documentId } from "firebase/firestore";
import { DocumentReference, TeamDocument, GameDocument } from "@/types";
import { firestore } from "@/firebase/app";
import { Collections } from "@/types";
import { toast } from "sonner";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Extend GameDocument to include round number
interface GameWithRound extends GameDocument {
  id: string;
  round: number;
}

export default function GamesTable() {
  // Context hooks
  const { gamesQuerySnapshot, gamesQuerySnapshotLoading } = useGamesContext();
  const { selectedSeasonQueryDocumentSnapshot } = useSeasonsContext();

  // Local state
  const [editId, setEditId] = useState<string | null>(null);
  const [editScores, setEditScores] = useState<{ homeScore: number; awayScore: number }>({
    homeScore: 0,
    awayScore: 0,
  });

  // Team data
  const teamRefs = selectedSeasonQueryDocumentSnapshot?.data()?.teams ?? [];
  const teamsQueryRef = teamRefs.length > 0 ? query(
    collection(firestore, Collections.TEAMS),
    where(documentId(), 'in', teamRefs.map((ref: DocumentReference<TeamDocument>) => ref.id))
  ) : undefined;
  
  const [teamsQuerySnapshot] = useCollection(teamsQueryRef);
  const teams = teamsQuerySnapshot?.docs.map(doc => ({ 
    id: doc.id, 
    ...doc.data() as TeamDocument 
  })) ?? [];

  // Process and sort games
  const games = useMemo(() => {
    if (!gamesQuerySnapshot) return [];

    const seasonStart = selectedSeasonQueryDocumentSnapshot?.data()?.dateStart;
    
    return gamesQuerySnapshot.docs.map((doc): GameWithRound => {
      const data = doc.data() as GameDocument;
      const round = (data.date && seasonStart)
        ? Math.floor((data.date.toDate().getTime() - seasonStart.toDate().getTime()) / (1000 * 60 * 60 * 24)) + 1
        : 0;

      return {
        ...data,
        id: doc.id,
        round,
      };
    }).sort((a, b) => {
      // Sort by round first
      const roundDiff = a.round - b.round;
      if (roundDiff !== 0) return roundDiff;
      // Then by date
      return a.date.toDate().getTime() - b.date.toDate().getTime();
    });
  }, [gamesQuerySnapshot, selectedSeasonQueryDocumentSnapshot]);

  // Team name helper
  const getTeamName = (ref: DocumentReference<TeamDocument> | null) => {
    if (!ref) return "TBD";
    const team = teams.find(t => t.id === ref.id);
    return team?.name || "TBD";
  };

  // Event handlers
  const handleEdit = (game: GameWithRound) => {
    setEditId(game.id);
    setEditScores({ 
      homeScore: game.homeScore, 
      awayScore: game.awayScore 
    });
  };

  const handleSave = async (game: GameWithRound) => {
    try {
      const gameRef = doc(firestore, Collections.GAMES, game.id);
      await updateDoc(gameRef, {
        homeScore: editScores.homeScore,
        awayScore: editScores.awayScore,
      });
      setEditId(null);
      toast.success("Game scores updated successfully");
    } catch (error) {
      toast.error("Failed to update scores: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setEditScores(prev => ({
      ...prev,
      [e.target.name]: value
    }));
  };

  // Loading state
  if (gamesQuerySnapshotLoading) {
    return <div>Loading games...</div>;
  }

  // Render table
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Round</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Home Team</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Away Team</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {games.map((game) => (
          <TableRow key={game.id}>
            <TableCell>{game.round}</TableCell>
            <TableCell>{game.date.toDate().toLocaleDateString()}</TableCell>
            <TableCell>{getTeamName(game.home)}</TableCell>
            <TableCell>
              {editId === game.id ? (
                <Input
                  type="number"
                  name="homeScore"
                  value={editScores.homeScore}
                  onChange={handleChange}
                  className="w-20"
                />
              ) : (
                game.homeScore
              )}
            </TableCell>
            <TableCell>{getTeamName(game.away)}</TableCell>
            <TableCell>
              {editId === game.id ? (
                <Input
                  type="number"
                  name="awayScore"
                  value={editScores.awayScore}
                  onChange={handleChange}
                  className="w-20"
                />
              ) : (
                game.awayScore
              )}
            </TableCell>
            <TableCell>
              {editId === game.id ? (
                <div className="flex gap-2 justify-end">
                  <Button size="sm" onClick={() => handleSave(game)}>Save</Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditId(null)}>Cancel</Button>
                </div>
              ) : (
                <Button size="sm" onClick={() => handleEdit(game)}>Edit</Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}