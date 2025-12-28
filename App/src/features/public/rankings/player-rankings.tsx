/**
 * Players page component
 *
 * Displays players in a ranked leaderboard format based on skill ratings.
 * Currently uses TrueSkill (v5.0), a Bayesian rating algorithm.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCollection } from 'react-firebase-hooks/firestore'
import { toast } from 'sonner'
import { InlineMath, BlockMath } from 'react-katex'
import 'katex/dist/katex.min.css'

import { currentPlayerRankingsQuery } from '@/firebase/collections/player-rankings'
import { PlayerRankingDocument, RATING_PRECISION_MULTIPLIER } from '@/types'
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
	User,
	Search,
} from 'lucide-react'
import { cn, logger } from '@/shared/utils'
import { PageContainer, PageHeader } from '@/shared/components'
import { Input } from '@/components/ui/input'

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
	'v5.0': {
		name: 'TrueSkill',
		description:
			'Bayesian skill rating with team-based inference and uncertainty tracking',
		date: 'December 2025',
	},
} as const

const CURRENT_VERSION = 'v5.0'

// Helper component to render version-specific algorithm details
const AlgorithmVersionContent = ({ version }: { version: string }) => {
	switch (version) {
		case 'v1.0':
			return <AlgorithmV1Content />
		case 'v2.0':
			return <AlgorithmV2Content />
		case 'v3.0':
			return <AlgorithmV3Content />
		case 'v4.0':
			return <AlgorithmV4Content />
		case 'v5.0':
			return <AlgorithmV5Content />
		default:
			return <AlgorithmV5Content />
	}
}

// v1.0 - Genesis
const AlgorithmV1Content = () => (
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
const AlgorithmV2Content = () => (
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
const AlgorithmV3Content = () => (
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
const AlgorithmV4Content = () => (
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

// v5.0 - TrueSkill (Current Version)
const AlgorithmV5Content = () => (
	<>
		{/* What is TrueSkill */}
		<div>
			<h4 className='font-semibold mb-3 text-base'>
				TrueSkill Bayesian Rating System
			</h4>
			<div className='bg-muted/30 p-3 rounded-lg border text-center mb-3'>
				<BlockMath math='\text{Skill} \sim \mathcal{N}(\mu, \sigma^2)' />
			</div>
			<p className='text-muted-foreground'>
				TrueSkill represents each player's skill as a probability distribution
				(bell curve) with two parameters: <strong>μ (mu)</strong> = estimated
				skill level, and <strong>σ (sigma)</strong> = uncertainty. This approach
				was developed by Microsoft Research for Xbox Live matchmaking.
			</p>
		</div>

		{/* Key Innovation */}
		<div>
			<h4 className='font-semibold mb-2'>
				Key Innovation: Team-Based Inference
			</h4>
			<p className='text-muted-foreground mb-2'>
				Unlike ELO which treats each player independently, TrueSkill infers
				individual skill from <strong>team outcomes</strong>. When your team
				wins, the algorithm determines how much credit each player deserves
				based on their uncertainty level.
			</p>
			<div className='bg-muted/20 p-2 rounded text-center mb-2'>
				<InlineMath math='\mu_{\text{team}} = \sum_{i=1}^{n} \mu_i' />
			</div>
			<ul className='text-muted-foreground space-y-1 text-xs ml-4'>
				<li>• Team skill = sum of all player skills</li>
				<li>• Players with high uncertainty (new players) learn faster</li>
				<li>• Experienced players have stable, confident ratings</li>
			</ul>
		</div>

		{/* How Ratings Update */}
		<div>
			<h4 className='font-semibold mb-2'>How Ratings Update</h4>
			<p className='text-muted-foreground mb-2'>
				After each game, TrueSkill updates both μ and σ using Bayesian
				inference:
			</p>
			<div className='bg-muted/20 p-2 rounded text-center mb-2'>
				<InlineMath math='\mu_{\text{new}} = \mu_{\text{old}} + \frac{\sigma^2}{c} \cdot v \cdot m' />
			</div>
			<div className='bg-muted/20 p-2 rounded text-center mb-2'>
				<InlineMath math='\sigma_{\text{new}}^2 = \sigma_{\text{old}}^2 \cdot (1 - \frac{\sigma^2}{c^2} \cdot w)' />
			</div>
			<p className='text-xs text-muted-foreground text-center mb-2'>
				where <InlineMath math='v' /> and <InlineMath math='w' /> are Gaussian
				correction factors, <InlineMath math='c' /> is total match uncertainty,
				and <InlineMath math='m' /> is an optional multiplier
			</p>
			<ul className='text-muted-foreground space-y-1 text-xs ml-4'>
				<li>
					• <strong>Win against stronger team:</strong> Large μ increase, σ
					decreases
				</li>
				<li>
					• <strong>Win against weaker team:</strong> Small μ increase (expected
					result)
				</li>
				<li>
					• <strong>Upset loss:</strong> Large μ decrease, σ may increase
				</li>
			</ul>
		</div>

		{/* Pure Win/Loss */}
		<div>
			<h4 className='font-semibold mb-2'>Pure Win/Loss Outcomes</h4>
			<p className='text-muted-foreground mb-2'>
				<strong>KEY CHANGE:</strong> Unlike previous versions that used point
				differentials, TrueSkill focuses purely on who wins:
			</p>
			<div className='grid grid-cols-2 gap-2 mb-2'>
				<div className='bg-green-500/10 p-2 rounded border border-green-500/30'>
					<p className='text-xs font-medium mb-1 text-center text-green-700 dark:text-green-400'>
						Win
					</p>
					<p className='text-xs text-muted-foreground text-center'>
						Rating increases based on opponent strength
					</p>
				</div>
				<div className='bg-red-500/10 p-2 rounded border border-red-500/30'>
					<p className='text-xs font-medium mb-1 text-center text-red-700 dark:text-red-400'>
						Loss
					</p>
					<p className='text-xs text-muted-foreground text-center'>
						Rating decreases based on opponent strength
					</p>
				</div>
			</div>
			<ul className='text-muted-foreground space-y-1 text-xs ml-4'>
				<li>• A 15-14 win counts the same as 15-5</li>
				<li>• Reduces influence of running up the score</li>
				<li>• Better reflects competitive Ultimate Frisbee outcomes</li>
			</ul>
		</div>

		{/* Decay System */}
		<div>
			<h4 className='font-semibold mb-2'>Gravity Well & Inactivity Decay</h4>
			<p className='text-muted-foreground mb-2'>
				Similar to v4.0, ratings drift toward the baseline (μ = 25) with
				asymmetric rates:
			</p>
			<div className='bg-muted/20 p-2 rounded text-center mb-2'>
				<InlineMath math='\mu_{\text{new}} = 25 + (\mu_{\text{old}} - 25) \times d' />
			</div>
			<div className='grid grid-cols-2 gap-2 mb-2'>
				<div className='bg-muted/30 p-2 rounded border'>
					<p className='text-xs font-medium mb-1 text-center'>Above μ = 25</p>
					<ul className='text-xs text-muted-foreground space-y-0.5'>
						<li>Active: d = 0.998 (slow decay)</li>
						<li>Inactive: d = 0.992 (fast decay)</li>
					</ul>
				</div>
				<div className='bg-muted/30 p-2 rounded border'>
					<p className='text-xs font-medium mb-1 text-center'>Below μ = 25</p>
					<ul className='text-xs text-muted-foreground space-y-0.5'>
						<li>Active: d = 0.992 (fast recovery)</li>
						<li>Inactive: d = 0.998 (slow recovery)</li>
					</ul>
				</div>
			</div>
			<p className='text-xs text-muted-foreground'>
				Additionally, inactive players' uncertainty (σ) grows slightly each
				round, reflecting decreased confidence in their current skill level.
			</p>
		</div>

		{/* Algorithm Constants */}
		<div>
			<h4 className='font-semibold mb-3'>Key Algorithm Constants</h4>
			<div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						INITIAL μ (MU)
					</span>
					<span className='text-lg font-mono font-bold mb-1'>25.0</span>
					<p className='text-xs text-muted-foreground'>
						Starting skill estimate for new players
					</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						INITIAL σ (SIGMA)
					</span>
					<span className='text-lg font-mono font-bold mb-1'>8.33</span>
					<p className='text-xs text-muted-foreground'>
						Starting uncertainty (μ/3)
					</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						PLAYOFF MULTIPLIER
					</span>
					<span className='text-lg font-mono font-bold mb-1'>2.0</span>
					<p className='text-xs text-muted-foreground'>
						Postseason games have 2× impact
					</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						SEASON DECAY
					</span>
					<span className='text-lg font-mono font-bold mb-1'>0.80</span>
					<p className='text-xs text-muted-foreground'>
						Historical season weighting
					</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						GRAVITY WELL (ACTIVE)
					</span>
					<span className='text-lg font-mono font-bold mb-1'>0.998</span>
					<p className='text-xs text-muted-foreground'>
						Per-round drift when playing
					</p>
				</div>

				<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
					<span className='text-xs font-medium text-muted-foreground mb-1'>
						DECAY (INACTIVE)
					</span>
					<span className='text-lg font-mono font-bold mb-1'>0.992</span>
					<p className='text-xs text-muted-foreground'>
						Per-round drift when not playing
					</p>
				</div>
			</div>
		</div>

		{/* Why TrueSkill */}
		<div>
			<h4 className='font-semibold mb-2'>Why TrueSkill?</h4>
			<ul className='text-muted-foreground space-y-1 text-xs ml-4'>
				<li>
					• <strong>Better for team sports:</strong> Infers individual skill
					from team outcomes
				</li>
				<li>
					• <strong>Handles uncertainty:</strong> New players converge quickly,
					veterans stay stable
				</li>
				<li>
					• <strong>Mathematically principled:</strong> Based on Bayesian
					probability theory
				</li>
				<li>
					• <strong>Industry standard:</strong> Used by Xbox Live, Halo, and
					other competitive platforms
				</li>
				<li>
					• <strong>Pure outcomes:</strong> Focuses on wins/losses, not point
					margins
				</li>
			</ul>
		</div>

		{/* Summary */}
		<div className='border-t pt-4'>
			<h4 className='font-semibold mb-2 text-xs'>Version Summary</h4>
			<p className='text-xs text-muted-foreground'>
				TrueSkill represents the biggest algorithm change since Genesis,
				replacing ELO with a Bayesian system that models skill as a probability
				distribution. Key benefits: team-based skill inference, uncertainty
				tracking for faster learning, pure win/loss outcomes, and mathematically
				principled updates. The gravity well and decay mechanics from v4.0 are
				preserved to reward participation.
			</p>
		</div>
	</>
)

export const PlayerRankings = ({
	showAdminControls = false,
}: PlayerRankingsProps) => {
	const navigate = useNavigate()
	const [isDialogOpen, setIsDialogOpen] = useState(false)
	const [selectedVersion, setSelectedVersion] = useState(CURRENT_VERSION)
	const [searchQuery, setSearchQuery] = useState('')
	const [rankingsSnapshot, loading, error] = useCollection(
		currentPlayerRankingsQuery()
	)

	// Log and notify on query errors
	useEffect(() => {
		if (error) {
			logger.error('Failed to load players:', {
				component: 'PlayerRankings',
				error: error.message,
			})
			toast.error('Failed to load players', {
				description: error.message,
			})
		}
	}, [error])

	// Type guard to validate ranking document has required properties
	const isValidRankingDoc = (
		data: unknown
	): data is PlayerRankingDocument & { id: string } => {
		if (!data || typeof data !== 'object') return false
		const doc = data as Record<string, unknown>
		return (
			typeof doc.id === 'string' &&
			typeof doc.playerName === 'string' &&
			typeof doc.rating === 'number' &&
			typeof doc.rank === 'number'
		)
	}

	const rankings = rankingsSnapshot?.docs
		.map((doc) => ({
			id: doc.id,
			...doc.data(),
		}))
		.filter(isValidRankingDoc)

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

		// Group players by their rounded rating
		rankings.forEach((player) => {
			const roundedRating =
				Math.round(player.rating * RATING_PRECISION_MULTIPLIER) /
				RATING_PRECISION_MULTIPLIER

			const existing = tiedGroups.get(roundedRating)
			if (existing) {
				existing.push(player.id)
			} else {
				tiedGroups.set(roundedRating, [player.id])
			}
		})

		// Sort players within each rating group alphabetically by name
		tiedGroups.forEach((playerIds, rating) => {
			if (playerIds.length > 1) {
				playerIds.sort((a, b) => {
					const playerA = playerLookup.get(a)
					const playerB = playerLookup.get(b)
					if (!playerA || !playerB) return 0
					return playerA.playerName.localeCompare(playerB.playerName)
				})
				tiedGroups.set(rating, playerIds)
			}
		})

		// Identify tied players and calculate true ranks
		let currentTrueRank = 1
		const sortedRatings = Array.from(tiedGroups.keys()).sort((a, b) => b - a) // Highest first

		sortedRatings.forEach((rating) => {
			const playerIds = tiedGroups.get(rating)
			if (!playerIds) return

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
				const playerIds = tiedGroups.get(rating) ?? []
				return playerIds
					.map((id) => playerLookup.get(id))
					.filter(
						(player): player is PlayerRankingDocument & { id: string } =>
							player !== undefined
					)
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
		navigate(`/players/${playerId}`)
	}

	// Filter rankings by search query
	const filteredRankings = sortedRankings.filter((player) =>
		player.playerName.toLowerCase().includes(searchQuery.toLowerCase())
	)

	if (error) {
		return (
			<div className='container mx-auto px-4 py-8 space-y-6'>
				{/* Header */}
				<div className='text-center space-y-4'>
					<h1 className='text-3xl font-bold flex items-center justify-center gap-3'>
						<User className='h-8 w-8' aria-hidden='true' />
						Players
					</h1>
					<p className='text-muted-foreground'>
						Players ranked by performance using the TrueSkill rating system
					</p>
				</div>
				<Card>
					<CardContent className='p-6'>
						<p className='text-red-600' role='alert'>
							Error loading players: {error.message}
						</p>
					</CardContent>
				</Card>
			</div>
		)
	}

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title='Players'
				description='Players ranked by performance using the TrueSkill rating system'
				icon={User}
			/>

			{/* Informational Alert */}
			<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
				<DialogTrigger asChild>
					<Alert
						className='cursor-pointer hover:bg-muted/50 transition-colors mb-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
						role='button'
						tabIndex={0}
						aria-label='Learn more about the ranking algorithm'
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault()
								setIsDialogOpen(true)
							}
						}}
					>
						<Info className='h-4 w-4' aria-hidden='true' />
						<AlertTitle>Ranking Algorithm ({CURRENT_VERSION})</AlertTitle>
						<AlertDescription>
							Rankings are calculated using the TrueSkill Bayesian rating
							system. Click to learn more about how players are ranked.
						</AlertDescription>
					</Alert>
				</DialogTrigger>
				<DialogContent className='max-w-4xl'>
					<DialogHeader>
						<DialogTitle className='flex items-center gap-2'>
							Ranking Algorithm
						</DialogTitle>
						<DialogDescription className='sr-only'>
							Understanding how the player rankings are calculated
						</DialogDescription>
					</DialogHeader>

					{/* Version Selector */}
					<div className='border-b pb-4 mb-4'>
						<div className='flex items-center justify-between gap-4 pr-8'>
							<div>
								<h3 className='font-semibold text-lg' aria-hidden='true'>
									Algorithm Version
								</h3>
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
								<SelectTrigger
									className='w-[200px]'
									aria-label='Select algorithm version'
								>
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
					<div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
						<CardTitle className='flex items-center gap-2'>
							<User className='h-5 w-5' aria-hidden='true' />
							Players
						</CardTitle>
						<div className='relative w-full sm:w-64'>
							<Search
								className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground'
								aria-hidden='true'
							/>
							<Input
								type='search'
								placeholder='Search players...'
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className='pl-9'
								aria-label='Search players by name'
							/>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					{loading ? (
						<div className='overflow-x-auto' aria-busy='true'>
							<Table aria-label='Player rankings loading'>
								<TableHeader>
									<TableRow>
										<TableHead scope='col' className='w-12 sm:w-16'>
											Rank
										</TableHead>
										<TableHead scope='col' className='min-w-[120px] sm:w-32'>
											Player
										</TableHead>
										<TableHead scope='col' className='w-16 sm:w-24 text-center'>
											Skill
										</TableHead>
										<TableHead scope='col' className='w-16 sm:w-24 text-center'>
											Change
										</TableHead>
										<TableHead scope='col' className='w-12 sm:w-20 text-center'>
											Games
										</TableHead>
										<TableHead scope='col' className='w-12 sm:w-20 text-center'>
											Seasons
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{Array.from({ length: 8 }, (_, i) => (
										<TableRow key={`skeleton-${i}`}>
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
							<Table aria-label='Player rankings'>
								<TableHeader>
									<TableRow>
										<TableHead scope='col' className='w-12 sm:w-16'>
											Rank
										</TableHead>
										<TableHead scope='col' className='min-w-[120px] sm:w-32'>
											Player
										</TableHead>
										<TableHead scope='col' className='w-16 sm:w-24 text-center'>
											Skill
										</TableHead>
										<TableHead scope='col' className='w-16 sm:w-24 text-center'>
											Change
										</TableHead>
										<TableHead scope='col' className='w-12 sm:w-20 text-center'>
											Games
										</TableHead>
										<TableHead scope='col' className='w-12 sm:w-20 text-center'>
											Seasons
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{filteredRankings.length === 0 ? (
										<TableRow>
											<TableCell
												colSpan={6}
												className='text-center py-8 text-muted-foreground'
												role='status'
												aria-live='polite'
											>
												No players found matching "{searchQuery}"
											</TableCell>
										</TableRow>
									) : (
										filteredRankings.map((player) => {
											const trueRank = trueRankMap.get(player.id) || player.rank
											const isMedalEligible =
												medalEligibilityMap.get(player.id) || false

											return (
												<TableRow
													key={player.id}
													onClick={() => handlePlayerClick(player.id)}
													onKeyDown={(e) => {
														if (e.key === 'Enter' || e.key === ' ') {
															e.preventDefault()
															handlePlayerClick(player.id)
														}
													}}
													tabIndex={0}
													aria-label={`View ${player.playerName}'s ranking history, rank ${trueRank}, rating ${player.rating.toFixed(2)}`}
													className={cn(
														'hover:bg-muted/50 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
														isMedalEligible &&
															'bg-gradient-to-r from-yellow-50 to-transparent dark:from-yellow-900/20'
													)}
												>
													<TableCell className='font-medium'>
														<div className='flex items-center gap-2'>
															{trueRank === 1 && (
																<Crown
																	className='h-4 w-4 text-yellow-500'
																	aria-hidden='true'
																/>
															)}
															{trueRank === 2 && (
																<Award
																	className='h-4 w-4 text-gray-400'
																	aria-hidden='true'
																/>
															)}
															{trueRank === 3 && (
																<Medal
																	className='h-4 w-4 text-amber-600'
																	aria-hidden='true'
																/>
															)}
															<span>#{trueRank}</span>
														</div>
													</TableCell>
													<TableCell>
														<div className='space-y-1'>
															<div
																className={cn(
																	'font-medium',
																	trueRank <= 3 && 'dark:text-foreground'
																)}
															>
																{player.playerName}
															</div>
														</div>
													</TableCell>
													<TableCell className='text-center font-mono'>
														{player.rating.toFixed(2)}
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
																	<TrendingUp
																		className='h-3 w-3'
																		aria-hidden='true'
																	/>
																) : (
																	<TrendingDown
																		className='h-3 w-3'
																		aria-hidden='true'
																	/>
																)}
																<span className='sr-only'>
																	{player.lastRatingChange > 0
																		? 'increased by'
																		: 'decreased by'}
																</span>
																{Math.abs(player.lastRatingChange).toFixed(2)}
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
										})
									)}
								</TableBody>
							</Table>
						</div>
					) : (
						<div className='text-center py-8'>
							<Trophy
								className='h-12 w-12 text-muted-foreground mx-auto mb-4'
								aria-hidden='true'
							/>
							<p className='text-muted-foreground'>No players available yet.</p>
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
						<Button
							variant='outline'
							onClick={() => navigate('/admin/rankings-management')}
						>
							Manage Rankings
						</Button>
					</CardContent>
				</Card>
			)}
		</PageContainer>
	)
}
