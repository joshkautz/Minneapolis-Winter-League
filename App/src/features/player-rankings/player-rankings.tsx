/**
 * Player Rankings page component
 *
 * Displays the player rankings in a sophisticated leaderboard format
 */

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCollection } from 'react-firebase-hooks/firestore'
import { InlineMath, BlockMath } from 'react-katex'
import 'katex/dist/katex.min.css'

import { currentPlayerRankingsQuery } from '@/firebase/collections/player-rankings'
import { PlayerRankingDocument } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Trophy,
	TrendingUp,
	TrendingDown,
	Medal,
	Crown,
	Award,
	Info,
} from 'lucide-react'
import { cn } from '@/shared/utils'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { PageContainer, PageHeader } from '@/shared/components'

interface PlayerRankingsProps {
	showAdminControls?: boolean
}

// Algorithm version definitions
const ALGORITHM_VERSIONS = {
	'v1.0': {
		name: 'Genesis',
		description: 'Initial ELO-based implementation with seasonal decay',
		date: 'September 2025',
	},
	'v2.0': {
		name: 'Ultimate Tuning',
		description: 'Optimized for 20-point Ultimate Frisbee games',
		date: 'September 2025',
	},
	'v3.0': {
		name: 'Round Revolution',
		description: 'Round-based instead of season-based decay',
		date: 'September 2025',
	},
	'v4.0': {
		name: 'Asymmetric Gravity',
		description: 'Universal gravity well with asymmetric participation rewards',
		date: 'November 2025',
	},
} as const

const CURRENT_VERSION = 'v4.0'

// Helper component to render version-specific algorithm details
const AlgorithmVersionContent: React.FC<{ version: string }> = ({
	version,
}) => {
	switch (version) {
		case 'v1.0':
			return <AlgorithmV1Content />
		case 'v2.0':
			return <AlgorithmV2Content />
		case 'v3.0':
			return <AlgorithmV3Content />
		case 'v4.0':
			return <AlgorithmV4Content />
		default:
			return <AlgorithmV4Content />
	}
}

// v1.0 - Genesis
const AlgorithmV1Content: React.FC = () => (
	<>
		{/* Core Formula */}
		<div>
			<h4 className='font-semibold mb-3 text-base'>Core ELO Rating Formula</h4>
			<div className='bg-muted/30 p-3 rounded-lg border text-center mb-3'>
				<BlockMath math='R_{\text{new}} = R_{\text{old}} + K \times \alpha^s \times f_p \times (S_{\text{actual}} - E)' />
			</div>
			<p className='text-muted-foreground'>
				The initial implementation of the player ranking system using
				traditional ELO mathematics with point differential analysis and
				seasonal weighting.
			</p>
		</div>

		{/* Point Differential System */}
		<div>
			<h4 className='font-semibold mb-2'>Point Differential Weighting</h4>
			<p className='text-muted-foreground mb-2'>
				Point differentials are weighted with logarithmic scaling for large
				margins:
			</p>
			<div className='bg-muted/20 p-2 rounded text-center mb-2'>
				<InlineMath math='d_{\text{weighted}} = \begin{cases} d & \text{if } |d| \leq 10 \\ \text{sign}(d) \times [10 + \ln(|d| - 9)] & \text{if } |d| > 10 \end{cases}' />
			</div>
			<ul className='text-muted-foreground space-y-1 text-xs ml-4'>
				<li>• Differentials up to 10 points receive full weight</li>
				<li>• Larger differentials use logarithmic scaling</li>
				<li>• Prevents blowout games from dominating ratings</li>
			</ul>
		</div>

		{/* Team Strength Analysis */}
		<div>
			<h4 className='font-semibold mb-2'>Dynamic Team Strength</h4>
			<p className='text-muted-foreground mb-2'>
				Team strength calculated as average rating of roster players, with
				seasonal decay:
			</p>
			<div className='bg-muted/20 p-2 rounded text-center mb-2'>
				<InlineMath math='\bar{R}_{\text{team}} = \frac{1}{n} \sum_{i=1}^{n} [1200 + (R_i - 1200) \times 0.80^s]' />
			</div>
			<div className='bg-muted/20 p-2 rounded text-center'>
				<InlineMath math='E = \frac{1}{1 + 10^{(\bar{R}_{\text{opponent}} - \bar{R}_{\text{team}})/400}}' />
			</div>
		</div>

		{/* Inactivity System */}
		<div>
			<h4 className='font-semibold mb-2'>Season-Based Inactivity Decay</h4>
			<p className='text-muted-foreground mb-2'>
				Inactive players' ratings decay toward 1200 baseline per season:
			</p>
			<div className='bg-muted/20 p-2 rounded text-center mb-2'>
				<InlineMath math='R_{\text{new}} = 1200 + (R_{\text{old}} - 1200) \times 0.95^{\text{seasons inactive}}' />
			</div>
			<ul className='text-muted-foreground space-y-1 text-xs ml-4'>
				<li>• Decay applied once per season of inactivity</li>
				<li>• Simple but coarse-grained approach</li>
				<li>• No distinction between missing 1 game vs entire season</li>
			</ul>
		</div>

		{/* Algorithm Constants */}
		<div>
			<h4 className='font-semibold mb-3'>Key Algorithm Constants</h4>
			<div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						K-FACTOR
					</span>
					<span className='text-lg font-mono font-bold mb-1'>32</span>
					<p className='text-xs text-muted-foreground'>
						Maximum rating change per game
					</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						SEASON DECAY
					</span>
					<span className='text-lg font-mono font-bold mb-1'>0.80</span>
					<p className='text-xs text-muted-foreground'>
						Weight reduction per past season
					</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						PLAYOFF MULTIPLIER
					</span>
					<span className='text-lg font-mono font-bold mb-1'>2.0</span>
					<p className='text-xs text-muted-foreground'>
						Postseason game importance factor
					</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						INACTIVITY DECAY
					</span>
					<span className='text-lg font-mono font-bold mb-1'>0.95</span>
					<p className='text-xs text-muted-foreground'>
						Per season of inactivity
					</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						MAX DIFFERENTIAL
					</span>
					<span className='text-lg font-mono font-bold mb-1'>10</span>
					<p className='text-xs text-muted-foreground'>
						Full weight point differential threshold
					</p>
				</div>
			</div>
		</div>

		{/* Summary */}
		<div className='border-t pt-4'>
			<h4 className='font-semibold mb-2 text-xs'>Version Summary</h4>
			<p className='text-xs text-muted-foreground'>
				Genesis established the foundation with traditional ELO mechanics,
				seasonal decay, and point differential weighting. Designed for general
				ultimate frisbee games without sport-specific optimizations.
			</p>
		</div>
	</>
)

// v2.0 - Ultimate Tuning
const AlgorithmV2Content: React.FC = () => (
	<>
		{/* Core Formula */}
		<div>
			<h4 className='font-semibold mb-3 text-base'>Core ELO Rating Formula</h4>
			<div className='bg-muted/30 p-3 rounded-lg border text-center mb-3'>
				<BlockMath math='R_{\text{new}} = R_{\text{old}} + K \times \alpha^s \times f_p \times (S_{\text{actual}} - E)' />
			</div>
			<p className='text-muted-foreground'>
				Optimized for 40-minute Ultimate Frisbee games averaging ~20 total
				points. Constants tuned based on the unique characteristics of
				low-scoring ultimate games.
			</p>
		</div>

		{/* Point Differential System */}
		<div>
			<h4 className='font-semibold mb-2'>Point Differential Weighting</h4>
			<p className='text-muted-foreground mb-2'>
				<strong>KEY CHANGE:</strong> Threshold reduced from 10 to 5 points to
				better reflect significance in 20-point games:
			</p>
			<div className='bg-muted/20 p-2 rounded text-center mb-2'>
				<InlineMath math='d_{\text{weighted}} = \begin{cases} d & \text{if } |d| \leq 5 \\ \text{sign}(d) \times [5 + 2.2 \times \ln(|d| - 4)] & \text{if } |d| > 5 \end{cases}' />
			</div>
			<ul className='text-muted-foreground space-y-1 text-xs ml-4'>
				<li>• Reduced from 10-point threshold in v1.0</li>
				<li>• 5+ point margin is significant in lower-scoring games</li>
				<li>• Enhanced logarithmic scaling coefficient (2.2 vs 1.0)</li>
			</ul>
		</div>

		{/* Team Strength Analysis */}
		<div>
			<h4 className='font-semibold mb-2'>Dynamic Team Strength</h4>
			<p className='text-muted-foreground mb-2'>
				Team strength calculation with adjusted seasonal decay (0.82 vs 0.80):
			</p>
			<div className='bg-muted/20 p-2 rounded text-center mb-2'>
				<InlineMath math='\bar{R}_{\text{team}} = \frac{1}{n} \sum_{i=1}^{n} [1200 + (R_i - 1200) \times 0.82^s]' />
			</div>
			<div className='bg-muted/20 p-2 rounded text-center'>
				<InlineMath math='E = \frac{1}{1 + 10^{(\bar{R}_{\text{opponent}} - \bar{R}_{\text{team}})/400}}' />
			</div>
		</div>

		{/* Inactivity System */}
		<div>
			<h4 className='font-semibold mb-2'>Season-Based Inactivity Decay</h4>
			<p className='text-muted-foreground mb-2'>
				Inactive players' ratings decay toward 1200 baseline per season
				(unchanged from v1.0):
			</p>
			<div className='bg-muted/20 p-2 rounded text-center mb-2'>
				<InlineMath math='R_{\text{new}} = 1200 + (R_{\text{old}} - 1200) \times 0.95^{\text{seasons inactive}}' />
			</div>
			<ul className='text-muted-foreground space-y-1 text-xs ml-4'>
				<li>• Same season-based approach as v1.0</li>
				<li>• Still lacks granularity for partial participation</li>
			</ul>
		</div>

		{/* Algorithm Constants */}
		<div>
			<h4 className='font-semibold mb-3'>Key Algorithm Constants</h4>
			<div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						K-FACTOR
					</span>
					<span className='text-lg font-mono font-bold mb-1'>36</span>
					<p className='text-xs text-muted-foreground'>
						Increased from 32 (v1.0)
					</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						SEASON DECAY
					</span>
					<span className='text-lg font-mono font-bold mb-1'>0.82</span>
					<p className='text-xs text-muted-foreground'>
						Increased from 0.80 (v1.0)
					</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						PLAYOFF MULTIPLIER
					</span>
					<span className='text-lg font-mono font-bold mb-1'>1.8</span>
					<p className='text-xs text-muted-foreground'>
						Reduced from 2.0 (v1.0)
					</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						INACTIVITY DECAY
					</span>
					<span className='text-lg font-mono font-bold mb-1'>0.95</span>
					<p className='text-xs text-muted-foreground'>
						Per season (unchanged from v1.0)
					</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						MAX DIFFERENTIAL
					</span>
					<span className='text-lg font-mono font-bold mb-1'>5</span>
					<p className='text-xs text-muted-foreground'>
						Reduced from 10 (v1.0)
					</p>
				</div>
			</div>
		</div>

		{/* Summary */}
		<div className='border-t pt-4'>
			<h4 className='font-semibold mb-2 text-xs'>Version Summary</h4>
			<p className='text-xs text-muted-foreground'>
				Ultimate Tuning refined constants for Minneapolis Winter League's
				specific game format. Major changes: reduced differential threshold
				(10→5), increased K-factor (32→36), adjusted seasonal decay (0.80→0.82),
				and reduced playoff multiplier (2.0→1.8).
			</p>
		</div>
	</>
)

// v3.0 - Round Revolution
const AlgorithmV3Content: React.FC = () => (
	<>
		{/* Core Formula */}
		<div>
			<h4 className='font-semibold mb-3 text-base'>Core ELO Rating Formula</h4>
			<div className='bg-muted/30 p-3 rounded-lg border text-center mb-3'>
				<BlockMath math='R_{\text{new}} = R_{\text{old}} + K \times \alpha^s \times f_p \times (S_{\text{actual}} - E)' />
			</div>
			<p className='text-muted-foreground'>
				Core formula unchanged from v2.0. Major innovation: round-based decay
				instead of season-based inactivity penalties for more granular
				participation tracking.
			</p>
		</div>

		{/* Point Differential System */}
		<div>
			<h4 className='font-semibold mb-2'>Point Differential Weighting</h4>
			<p className='text-muted-foreground mb-2'>
				Point differential calculation unchanged from v2.0:
			</p>
			<div className='bg-muted/20 p-2 rounded text-center mb-2'>
				<InlineMath math='d_{\text{weighted}} = \begin{cases} d & \text{if } |d| \leq 5 \\ \text{sign}(d) \times [5 + 2.2 \times \ln(|d| - 4)] & \text{if } |d| > 5 \end{cases}' />
			</div>
			<ul className='text-muted-foreground space-y-1 text-xs ml-4'>
				<li>• Same 5-point threshold as v2.0</li>
				<li>• Same logarithmic scaling for large differentials</li>
			</ul>
		</div>

		{/* Team Strength Analysis */}
		<div>
			<h4 className='font-semibold mb-2'>Dynamic Team Strength</h4>
			<p className='text-muted-foreground mb-2'>
				Team strength calculation unchanged from v2.0:
			</p>
			<div className='bg-muted/20 p-2 rounded text-center mb-2'>
				<InlineMath math='\bar{R}_{\text{team}} = \frac{1}{n} \sum_{i=1}^{n} [1200 + (R_i - 1200) \times 0.82^s]' />
			</div>
			<div className='bg-muted/20 p-2 rounded text-center'>
				<InlineMath math='E = \frac{1}{1 + 10^{(\bar{R}_{\text{opponent}} - \bar{R}_{\text{team}})/400}}' />
			</div>
		</div>

		{/* Inactivity System */}
		<div>
			<h4 className='font-semibold mb-2'>Round-Based Inactivity Decay</h4>
			<p className='text-muted-foreground mb-2'>
				<strong>KEY CHANGE:</strong> Decay now applies per round instead of per
				season:
			</p>
			<div className='bg-muted/20 p-2 rounded text-center mb-2'>
				<InlineMath math='R_{\text{new}} = 1200 + (R_{\text{old}} - 1200) \times 0.996^{\text{rounds inactive}}' />
			</div>
			<ul className='text-muted-foreground space-y-1 text-xs ml-4'>
				<li>
					• Granular per-round decay (0.996) replaces coarse per-season decay
					(0.95)
				</li>
				<li>• Accumulates to similar seasonal effect over ~20 rounds</li>
				<li>• Fair to players who miss a few games vs entire season</li>
				<li>• More responsive to actual participation patterns</li>
			</ul>
		</div>

		{/* Algorithm Constants */}
		<div>
			<h4 className='font-semibold mb-3'>Key Algorithm Constants</h4>
			<div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						K-FACTOR
					</span>
					<span className='text-lg font-mono font-bold mb-1'>36</span>
					<p className='text-xs text-muted-foreground'>(Unchanged from v2.0)</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						SEASON DECAY
					</span>
					<span className='text-lg font-mono font-bold mb-1'>0.82</span>
					<p className='text-xs text-muted-foreground'>(Unchanged from v2.0)</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						PLAYOFF MULTIPLIER
					</span>
					<span className='text-lg font-mono font-bold mb-1'>1.8</span>
					<p className='text-xs text-muted-foreground'>(Unchanged from v2.0)</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						INACTIVITY DECAY
					</span>
					<span className='text-lg font-mono font-bold mb-1'>0.996</span>
					<p className='text-xs text-muted-foreground'>
						NEW: Per round (was 0.95 per season)
					</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						MAX DIFFERENTIAL
					</span>
					<span className='text-lg font-mono font-bold mb-1'>5</span>
					<p className='text-xs text-muted-foreground'>(Unchanged from v2.0)</p>
				</div>
			</div>
		</div>

		{/* Summary */}
		<div className='border-t pt-4'>
			<h4 className='font-semibold mb-2 text-xs'>Version Summary</h4>
			<p className='text-xs text-muted-foreground'>
				Round Revolution introduced per-round inactivity tracking (0.996 per
				round) replacing coarse seasonal decay (0.95 per season). This makes the
				system more responsive to participation patterns and fairer to players
				with partial attendance.
			</p>
		</div>
	</>
)

// v4.0 - Asymmetric Gravity (Current Version)
const AlgorithmV4Content: React.FC = () => (
	<>
		{/* Core Formula */}
		<div>
			<h4 className='font-semibold mb-3 text-base'>Core ELO Rating Formula</h4>
			<div className='bg-muted/30 p-3 rounded-lg border text-center mb-3'>
				<BlockMath math='R_{\text{new}} = R_{\text{old}} + K \times \alpha^s \times f_p \times (S_{\text{actual}} - E)' />
			</div>
			<p className='text-muted-foreground'>
				Core formula unchanged from v3.0. Revolutionary innovation: universal
				gravity well with asymmetric decay rates that always reward
				participation.
			</p>
		</div>

		{/* Point Differential System */}
		<div>
			<h4 className='font-semibold mb-2'>Point Differential Weighting</h4>
			<p className='text-muted-foreground mb-2'>
				Point differential calculation unchanged from v3.0:
			</p>
			<div className='bg-muted/20 p-2 rounded text-center mb-2'>
				<InlineMath math='d_{\text{weighted}} = \begin{cases} d & \text{if } |d| \leq 5 \\ \text{sign}(d) \times [5 + 2.2 \times \ln(|d| - 4)] & \text{if } |d| > 5 \end{cases}' />
			</div>
			<ul className='text-muted-foreground space-y-1 text-xs ml-4'>
				<li>• Same 5-point threshold as v2.0 and v3.0</li>
				<li>• Same logarithmic scaling for large differentials</li>
				<li>• Optimized for ~20 point Ultimate Frisbee games</li>
			</ul>
		</div>

		{/* Team Strength Analysis */}
		<div>
			<h4 className='font-semibold mb-2'>Dynamic Team Strength</h4>
			<p className='text-muted-foreground mb-2'>
				Team strength calculation unchanged from v3.0:
			</p>
			<div className='bg-muted/20 p-2 rounded text-center mb-2'>
				<InlineMath math='\bar{R}_{\text{team}} = \frac{1}{n} \sum_{i=1}^{n} [1200 + (R_i - 1200) \times 0.82^s]' />
			</div>
			<div className='bg-muted/20 p-2 rounded text-center'>
				<InlineMath math='E = \frac{1}{1 + 10^{(\bar{R}_{\text{opponent}} - \bar{R}_{\text{team}})/400}}' />
			</div>
		</div>

		{/* Universal Gravity Well & Asymmetric Decay */}
		<div>
			<h4 className='font-semibold mb-2'>
				Universal Gravity Well & Asymmetric Decay
			</h4>
			<p className='text-muted-foreground mb-2'>
				<strong>KEY CHANGE:</strong> ALL players drift toward 1200 baseline
				every round, with asymmetric rates that reward participation:
			</p>
			<div className='bg-muted/20 p-2 rounded text-center mb-2'>
				<InlineMath math='R_{\text{new}} = 1200 + (R_{\text{old}} - 1200) \times d' />
			</div>
			<p className='text-xs text-muted-foreground text-center mb-2'>
				where <InlineMath math='d' /> = decay factor (varies by activity and
				rating)
			</p>
			<div className='grid grid-cols-2 gap-2 mb-2'>
				<div className='bg-muted/30 p-2 rounded border'>
					<p className='text-xs font-medium mb-1 text-center'>Above 1200</p>
					<ul className='text-xs text-muted-foreground space-y-0.5'>
						<li>Active: d = 0.998 (slow decay)</li>
						<li>Inactive: d = 0.992 (fast decay)</li>
					</ul>
				</div>
				<div className='bg-muted/30 p-2 rounded border'>
					<p className='text-xs font-medium mb-1 text-center'>Below 1200</p>
					<ul className='text-xs text-muted-foreground space-y-0.5'>
						<li>Active: d = 0.992 (fast recovery)</li>
						<li>Inactive: d = 0.998 (slow recovery)</li>
					</ul>
				</div>
			</div>
			<ul className='text-muted-foreground space-y-1 text-xs ml-4'>
				<li>• Universal gravity (0.998) applied to ALL players every round</li>
				<li>
					• Asymmetric rates: participation ALWAYS benefits regardless of rating
				</li>
				<li>
					• Prevents "camping" - even active players at 1400 drift down ~5
					points/season
				</li>
				<li>
					• Active players gain ~7-21 point advantage over inactive players
				</li>
				<li>• Self-balancing system adjusts for turnover and skill changes</li>
			</ul>
		</div>

		{/* Algorithm Constants */}
		<div>
			<h4 className='font-semibold mb-3'>Key Algorithm Constants</h4>
			<div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						K-FACTOR
					</span>
					<span className='text-lg font-mono font-bold mb-1'>36</span>
					<p className='text-xs text-muted-foreground'>(Unchanged from v2.0)</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						SEASON DECAY
					</span>
					<span className='text-lg font-mono font-bold mb-1'>0.82</span>
					<p className='text-xs text-muted-foreground'>(Unchanged from v2.0)</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						PLAYOFF MULTIPLIER
					</span>
					<span className='text-lg font-mono font-bold mb-1'>1.8</span>
					<p className='text-xs text-muted-foreground'>(Unchanged from v2.0)</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						GRAVITY WELL (ACTIVE)
					</span>
					<span className='text-lg font-mono font-bold mb-1'>0.998</span>
					<p className='text-xs text-muted-foreground'>
						NEW: Universal gentle drift (playing)
					</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						DECAY (INACTIVE)
					</span>
					<span className='text-lg font-mono font-bold mb-1'>0.992</span>
					<p className='text-xs text-muted-foreground'>
						NEW: Strong drift (not playing)
					</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						MAX DIFFERENTIAL
					</span>
					<span className='text-lg font-mono font-bold mb-1'>5</span>
					<p className='text-xs text-muted-foreground'>(Unchanged from v2.0)</p>
				</div>
			</div>
		</div>

		{/* Summary */}
		<div className='border-t pt-4'>
			<h4 className='font-semibold mb-2 text-xs'>Version Summary</h4>
			<p className='text-xs text-muted-foreground'>
				Asymmetric Gravity replaces simple inactivity decay (0.996) with a
				universal gravity well that applies to ALL players every round. The
				asymmetric system (0.998 active, 0.992 inactive) always rewards
				participation, prevents camping, and creates a self-balancing rating
				ecosystem.
			</p>
		</div>
	</>
)

export const PlayerRankings: React.FC<PlayerRankingsProps> = ({
	showAdminControls = false,
}) => {
	const navigate = useNavigate()
	const [isDialogOpen, setIsDialogOpen] = useState(false)
	const [selectedVersion, setSelectedVersion] = useState(CURRENT_VERSION)
	const [rankingsSnapshot, loading, error] = useCollection(
		currentPlayerRankingsQuery()
	)

	const rankings = rankingsSnapshot?.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	})) as (PlayerRankingDocument & { id: string })[] | undefined

	// Helper function to process rankings with proper tie handling
	const processRankingsWithTies = (
		rankings: (PlayerRankingDocument & { id: string })[]
	) => {
		const tiedGroups = new Map<number, string[]>()
		const tiedPlayerIds = new Set<string>()
		const trueRankMap = new Map<string, number>()
		const medalEligibilityMap = new Map<string, boolean>()

		// Create player lookup map for sorting by name
		const playerLookup = new Map<
			string,
			PlayerRankingDocument & { id: string }
		>()
		rankings.forEach((player) => {
			playerLookup.set(player.id, player)
		})

		// Group players by their rounded ELO rating
		rankings.forEach((player) => {
			const roundedRating = Math.round(player.eloRating * 1000000) / 1000000

			if (!tiedGroups.has(roundedRating)) {
				tiedGroups.set(roundedRating, [])
			}
			tiedGroups.get(roundedRating)!.push(player.id)
		})

		// Sort players within each rating group alphabetically by name
		tiedGroups.forEach((playerIds, rating) => {
			if (playerIds.length > 1) {
				playerIds.sort((a, b) => {
					const playerA = playerLookup.get(a)!
					const playerB = playerLookup.get(b)!
					return playerA.playerName.localeCompare(playerB.playerName)
				})
				tiedGroups.set(rating, playerIds)
			}
		})

		// Identify tied players and calculate true ranks
		let currentTrueRank = 1
		const sortedRatings = Array.from(tiedGroups.keys()).sort((a, b) => b - a) // Highest first

		sortedRatings.forEach((rating) => {
			const playerIds = tiedGroups.get(rating)!

			if (playerIds.length > 1) {
				// These players are tied
				playerIds.forEach((id) => {
					tiedPlayerIds.add(id)
					trueRankMap.set(id, currentTrueRank)
					// Medal eligibility if any position in the tie group is <= 3
					medalEligibilityMap.set(id, currentTrueRank <= 3)
				})
			} else {
				// Single player at this rating
				const playerId = playerIds[0]
				trueRankMap.set(playerId, currentTrueRank)
				medalEligibilityMap.set(playerId, currentTrueRank <= 3)
			}

			// Advance rank by the number of players at this rating level
			currentTrueRank += playerIds.length
		})

		return {
			tiedPlayerIds,
			trueRankMap,
			medalEligibilityMap,
			sortedRankings: sortedRatings.flatMap((rating) => {
				const playerIds = tiedGroups.get(rating)!
				return playerIds.map((id) => playerLookup.get(id)!)
			}),
		}
	}

	const { trueRankMap, medalEligibilityMap, sortedRankings } = rankings
		? processRankingsWithTies(rankings)
		: {
				trueRankMap: new Map<string, number>(),
				medalEligibilityMap: new Map<string, boolean>(),
				sortedRankings: [],
			}

	const handlePlayerClick = (playerId: string) => {
		navigate(`/player-rankings/player/${playerId}`)
	}

	if (error) {
		return (
			<div className='container mx-auto px-4 py-8 space-y-6'>
				{/* Header */}
				<div className='text-center space-y-4'>
					<h1 className='text-3xl font-bold flex items-center justify-center gap-3'>
						<Medal className='h-8 w-8' />
						Player Rankings
					</h1>
					<p className='text-muted-foreground'>
						Player rankings based on performance and ELO rating system
					</p>
				</div>
				<Card>
					<CardContent className='p-6'>
						<p className='text-red-600'>
							Error loading Player Rankings: {error.message}
						</p>
					</CardContent>
				</Card>
			</div>
		)
	}

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title='Player Rankings'
				description='Player rankings based on performance and ELO rating system'
				icon={Medal}
			/>

			{/* Informational Alert */}
			<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
				<DialogTrigger asChild>
					<Alert className='cursor-pointer hover:bg-muted/50 transition-colors mb-6'>
						<Info className='h-4 w-4' />
						<AlertTitle>
							Player Ranking Algorithm ({CURRENT_VERSION})
						</AlertTitle>
						<AlertDescription>
							Rankings are calculated using an advanced ELO-based algorithm.
							Click to learn more about how players are ranked.
						</AlertDescription>
					</Alert>
				</DialogTrigger>
				<DialogContent className='max-w-4xl'>
					<VisuallyHidden>
						<DialogHeader>
							<DialogTitle className='flex items-center gap-2'>
								Player Ranking Algorithm
							</DialogTitle>
							<DialogDescription>
								Understanding how the Player Rankings are calculated
							</DialogDescription>
						</DialogHeader>
					</VisuallyHidden>

					{/* Version Selector */}
					<div className='border-b pb-4 mb-4'>
						<div className='flex items-center justify-between gap-4 pr-8'>
							<div>
								<h3 className='font-semibold text-lg'>Algorithm Version</h3>
								<p className='text-sm text-muted-foreground'>
									<span className='font-medium'>
										{
											ALGORITHM_VERSIONS[
												selectedVersion as keyof typeof ALGORITHM_VERSIONS
											].date
										}
									</span>
									{' — '}
									{
										ALGORITHM_VERSIONS[
											selectedVersion as keyof typeof ALGORITHM_VERSIONS
										].description
									}
								</p>
							</div>
							<Select
								value={selectedVersion}
								onValueChange={setSelectedVersion}
							>
								<SelectTrigger className='w-[200px]'>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{Object.entries(ALGORITHM_VERSIONS).map(([version, info]) => (
										<SelectItem key={version} value={version}>
											{version} - {info.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className='space-y-6 text-sm max-h-[60vh] overflow-y-auto pr-2'>
						<AlgorithmVersionContent version={selectedVersion} />
					</div>
				</DialogContent>
			</Dialog>

			{/* Rankings Table */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Medal className='h-5 w-5' />
						Player Rankings
					</CardTitle>
				</CardHeader>
				<CardContent>
					{loading ? (
						<div className='overflow-x-auto'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className='w-16'>Rank</TableHead>
										<TableHead className='w-32'>Player</TableHead>
										<TableHead className='w-32 text-center'>Rating</TableHead>
										<TableHead className='w-32 text-center'>Change</TableHead>
										<TableHead className='w-32 text-center'>Games</TableHead>
										<TableHead className='w-32 text-center'>Seasons</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{[...Array(8)].map((_, i) => (
										<TableRow key={i}>
											<TableCell>
												<div className='flex items-center gap-2'>
													<Skeleton className='h-4 w-4 opacity-20' />
													<Skeleton className='h-4 w-6 opacity-20' />
												</div>
											</TableCell>
											<TableCell>
												<div className='space-y-1'>
													<Skeleton className='h-4 w-32 opacity-20' />
												</div>
											</TableCell>
											<TableCell className='text-center'>
												<Skeleton className='h-4 w-20 mx-auto opacity-20' />
											</TableCell>
											<TableCell className='text-center'>
												<Skeleton className='h-4 w-12 mx-auto opacity-20' />
											</TableCell>
											<TableCell className='text-center'>
												<Skeleton className='h-4 w-8 mx-auto opacity-20' />
											</TableCell>
											<TableCell className='text-center'>
												<Skeleton className='h-4 w-6 mx-auto opacity-20' />
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					) : rankings && rankings.length > 0 && sortedRankings.length > 0 ? (
						<div className='overflow-x-auto'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className='w-16'>Rank</TableHead>
										<TableHead className='w-32'>Player</TableHead>
										<TableHead className='w-32 text-center'>Rating</TableHead>
										<TableHead className='w-32 text-center'>Change</TableHead>
										<TableHead className='w-32 text-center'>Games</TableHead>
										<TableHead className='w-32 text-center'>Seasons</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{sortedRankings.map((player) => {
										const trueRank = trueRankMap.get(player.id) || player.rank
										const isMedalEligible =
											medalEligibilityMap.get(player.id) || false

										return (
											<TableRow
												key={player.id}
												onClick={() => handlePlayerClick(player.id)}
												className={cn(
													'hover:bg-muted/50 cursor-pointer transition-colors',
													isMedalEligible &&
														'bg-gradient-to-r from-yellow-50 to-transparent dark:from-yellow-900/20'
												)}
											>
												<TableCell className='font-medium'>
													<div className='flex items-center gap-2'>
														{trueRank === 1 && (
															<Crown className='h-4 w-4 text-yellow-500' />
														)}
														{trueRank === 2 && (
															<Award className='h-4 w-4 text-gray-400' />
														)}
														{trueRank === 3 && (
															<Medal className='h-4 w-4 text-amber-600' />
														)}
														<div className='flex items-center gap-1'>
															#{trueRank}
														</div>
													</div>
												</TableCell>
												<TableCell>
													<div className='space-y-1'>
														<div
															className={cn(
																'font-medium',
																player.rank <= 3 && 'dark:text-foreground'
															)}
														>
															{player.playerName}
														</div>
													</div>
												</TableCell>
												<TableCell className='text-center'>
													{player.eloRating.toFixed(6)}
												</TableCell>
												<TableCell className='text-center'>
													{player.lastRatingChange !== 0 && (
														<div
															className={cn(
																'flex items-center justify-center gap-1',
																player.lastRatingChange > 0
																	? 'text-green-600'
																	: 'text-red-600'
															)}
														>
															{player.lastRatingChange > 0 ? (
																<TrendingUp className='h-3 w-3' />
															) : (
																<TrendingDown className='h-3 w-3' />
															)}
															{Math.abs(player.lastRatingChange)}
														</div>
													)}
												</TableCell>
												<TableCell className='text-center'>
													{player.totalGames}
												</TableCell>
												<TableCell className='text-center'>
													{player.totalSeasons}
												</TableCell>
											</TableRow>
										)
									})}
								</TableBody>
							</Table>
						</div>
					) : (
						<div className='text-center py-8'>
							<Trophy className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
							<p className='text-muted-foreground'>
								No player rankings available yet.
							</p>
							<p className='text-sm text-muted-foreground mt-2'>
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
						<div className='flex gap-4'>
							<Button variant='outline'>Recalculate Rankings (Full)</Button>
							<Button variant='outline'>Update Rankings (Incremental)</Button>
							<Button variant='outline'>View Calculation History</Button>
						</div>
					</CardContent>
				</Card>
			)}
		</PageContainer>
	)
}
