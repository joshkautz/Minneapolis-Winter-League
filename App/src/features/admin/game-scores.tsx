import React from 'react';
import { Trophy } from 'lucide-react';
import { PageContainer, PageHeader } from '@/shared/components';
import GamesTable from '@/components/GamesTable';

export const GameScores = () => {
  return (
    <PageContainer withSpacing>
      <PageHeader
        title="Game Scores"
        description="View and update game scores for all seasons"
        icon={Trophy}
      />
      <div className="bg-card rounded-lg border p-6">
        <GamesTable />
      </div>
    </PageContainer>
  );
};