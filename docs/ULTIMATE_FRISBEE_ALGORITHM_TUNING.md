# 40-Minute Ultimate Frisbee Algorithm Parameter Justification

## Corrected Analysis for 20-Point Games

The Hall of Fame ranking algorithm has been re-optimized for **40-minute Ultimate Frisbee games** with approximately **20 total points scored**. This is significantly different from traditional ultimate frisbee (first to 15) and requires more conservative parameter tuning.

### Key Game Characteristics

1. **Lower Scoring Games**
   - Typical scores: 11-9, 12-8, 10-10
   - Point differentials: 1-5 points common, 6-8 significant
   - Total points per game: ~20 (vs traditional ultimate's 30+)

2. **Time-Limited Format**
   - 40-minute games (vs play-to-15)
   - No ties allowed
   - More variance due to time pressure

3. **Scoring Context**
   - Each point represents ~5% of total game scoring
   - 1-2 point margins are very close games
   - 5+ point margins show clear skill advantage

### Revised Algorithm Adjustments

#### **K-Factor: 32 → 36 (+12.5%)**

**Reasoning:**

- Moderate increase acknowledges ultimate's skill component
- Conservative due to lower scoring = higher variance per point
- Balances responsiveness with stability

**Comparison:**

- Original hockey: K=32
- High-scoring ultimate: K=48 (too aggressive)
- 20-point ultimate: K=36 (appropriate middle ground)

#### **Point Differential Normalization: /100 → /80 (+25% sensitivity)**

**Reasoning:**

- More sensitive than hockey but less than high-scoring sports
- A 4-point margin (12-8) should register as meaningful
- Prevents over-reaction to small differences

**Examples:**

- 2-point win (11-9): actualScore = 0.525 (meaningful but small)
- 4-point win (12-8): actualScore = 0.55 (solid advantage)
- 6-point win (13-7): actualScore = 0.575 (clear dominance)

#### **Max Full Weight Differential: 10 → 5 (-50%)**

**Reasoning:**

- In 20-point games, a 5-point margin is already quite significant
- Represents 25% of total scoring
- Equivalent to a 3-goal lead in hockey

#### **Playoff Multiplier: 2.0 → 1.8 (-10%)**

**Reasoning:**

- Lower scoring = higher variance in elimination games
- Time pressure can create more "lucky" outcomes
- Slightly higher than normal ultimate but below hockey levels

#### **Season Decay Factor: 0.8 → 0.82 (+2.5%)**

**Reasoning:**

- Ultimate skills still transfer well between seasons
- Lower scoring reduces confidence in single-season skill assessment
- Conservative approach to historical weighting

#### **Point Differential Scaling: 2.0 → 2.2 (+10%)**

**Reasoning:**

- Large margins (6-8 points) are meaningful in 20-point games
- More conservative than high-scoring ultimate
- Recognizes skill while accounting for variance

### Scoring Context Analysis

#### **Game Outcome Significance**

| Point Differential | % of Total Game | Interpretation  | actualScore |
| ------------------ | --------------- | --------------- | ----------- |
| 1 point (11-10)    | 5%              | Very close      | 0.51        |
| 2 points (12-10)   | 10%             | Close game      | 0.525       |
| 3 points (12-9)    | 15%             | Solid win       | 0.538       |
| 4 points (12-8)    | 20%             | Clear advantage | 0.55        |
| 5 points (13-8)    | 25%             | Dominant win    | 0.563       |
| 6+ points (14-8+)  | 30%+            | Overwhelming    | 0.575+      |

#### **Comparison to Other Sports**

| Sport                | Typical Total | Close Margin       | Dominant Margin    |
| -------------------- | ------------- | ------------------ | ------------------ |
| Hockey               | 6 points      | 1 goal (17%)       | 3 goals (50%)      |
| **40min Ultimate**   | **20 points** | **2 points (10%)** | **5 points (25%)** |
| Basketball           | 200 points    | 5 points (2.5%)    | 15 points (7.5%)   |
| Traditional Ultimate | 30 points     | 2 points (7%)      | 5 points (17%)     |

### Expected Algorithm Behavior

#### **Rating Changes (Example)**

For equally-rated teams (1200 vs 1200):

| Game Result | Point Diff | Rating Change | Reasoning                        |
| ----------- | ---------- | ------------- | -------------------------------- |
| 11-10       | +1         | +0.4          | Minimal change for close game    |
| 12-9        | +3         | +1.4          | Moderate change for solid win    |
| 13-7        | +6         | +2.7          | Significant change for dominance |
| 15-5        | +10        | +3.8          | Near-maximum change (capped)     |

#### **New Player Convergence**

- **Games to stability**: 8-12 games (vs 6-8 for high-scoring)
- **Initial variance**: Higher due to smaller sample of meaningful margins
- **Skill detection**: Good but requires more games than basketball

#### **Competitive Balance**

- **Close games**: 1-2 point margins won't dramatically shift ratings
- **Skill gaps**: 4+ point consistent margins will create separation
- **Upset potential**: Lower scoring allows for more surprising results

### Validation Metrics

Monitor these indicators to ensure appropriate tuning:

1. **Rating Stability**
   - New players should stabilize within 8-12 games
   - Established players shouldn't swing >50 points from single games

2. **Predictive Accuracy**
   - Rating differences should correlate with point differentials
   - 100-point rating gap should predict ~2-3 point margin

3. **Margin Distribution**
   - Track actual game margins vs. predicted ranges
   - Ensure 5+ point games are appropriately weighted

4. **Skill Progression**
   - Improving players should see gradual rating increases
   - System should detect sustained improvement over 4-6 games

### Future Adjustments

If monitoring reveals:

- **Too much volatility**: Reduce K-factor to 32-34
- **Too slow convergence**: Increase K-factor to 38-40
- **Large margins over-weighted**: Reduce max full weight to 4
- **Close games under-valued**: Increase normalization sensitivity to /75

The goal remains mathematical fairness while accounting for the unique characteristics of time-limited, lower-scoring ultimate frisbee.
