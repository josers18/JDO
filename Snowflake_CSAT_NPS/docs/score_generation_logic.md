# Score Generation Logic

## Overview

CSAT and NPS scores are generated using a deterministic pseudo-random model that produces realistic, correlated customer satisfaction data. The system uses Snowflake's `HASH()` function for reproducible randomness -- the same account and date combination always yields the same scores.

## CSAT Score Generation

### Monthly Procedure (Ongoing)

The monthly procedure (`SP_GENERATE_MONTHLY_CSAT`) uses a **context-aware** approach:

1. **Baseline**: 3-month rolling average of each account's historical CSAT scores
2. **Event injection**: Deterministic random events that simulate real-world occurrences
3. **Clamping**: Scores bounded to [20, 100]

#### Event Probability Model

| Event Type | Probability | Effect | Real-World Analog |
|------------|-------------|--------|-------------------|
| Negative event | 15% | Baseline -10 to -20 points | Service outage, billing error, product issue |
| Positive event | 15% | Baseline +8 to +15 points | Successful onboarding, issue resolution, feature launch |
| Normal drift | 70% | Baseline +/- 5 points | Routine interactions, no significant events |

The pseudo-random number is derived from:
```
rnd = ABS(HASH(ACCOUNT_ID || target_month)) % 100
```

New accounts with no history default to a baseline CSAT of **65** (Fair).

### Historical Backfill (One-Time)

The backfill used an **archetype-based** approach to create diverse, realistic trajectories across 39 months:

#### Account Archetypes

| Archetype | Distribution | Starting CSAT | Trajectory | Description |
|-----------|-------------|---------------|------------|-------------|
| **Positive** | 30% | ~55 | Upward (+0.8/mo) | Improving relationship, growing satisfaction |
| **Negative** | 20% | ~75 | Downward (-0.9/mo) | Deteriorating experience, declining scores |
| **Neutral** | 30% | ~67 | Flat (+/- noise) | Stable relationship, minor fluctuations |
| **Recovery** | 10% | ~40 | V-shaped | Starts low, dips further, recovers after month 18 |
| **Volatile** | 10% | ~60 | Wild swings | Unpredictable, large month-to-month variation |

Archetype assignment is deterministic:
```
archetype = HASH(ACCOUNT_ID) % 100
  < 30  -> POSITIVE
  < 50  -> NEGATIVE
  < 80  -> NEUTRAL
  < 90  -> RECOVERY
  else  -> VOLATILE
```

#### Archetype Score Formulas

**Positive**: `55 + (month_index * 0.8) + noise[-5, +5]`
- Starts at 55, reaches ~86 by month 39

**Negative**: `75 - (month_index * 0.9) + noise[-5, +5]`
- Starts at 75, drops to ~40 by month 39

**Neutral**: `67 + noise[-6, +6]`
- Stable band of 61-73

**Recovery**:
- Months 0-11: `40 - (index * 0.5) + noise[-4, +4]` (declining)
- Months 12-17: `34 + ((index - 12) * 2) + noise[-4, +4]` (turning point)
- Months 18+: `46 + ((index - 18) * 1.5) + noise[-4, +4]` (recovery)

**Volatile**: `60 + noise[-20, +20]`
- Range spans 40-80 with no trend

## CSAT-to-NPS Correlation

NPS is derived from CSAT using piecewise linear mapping that ensures the two metrics move together realistically.

### Mapping Bands

| CSAT Range | NPS Formula | Typical NPS |
|------------|------------|-------------|
| 20 - 50 | `1 + (CSAT - 20) / 10` | 1 - 4 |
| 51 - 65 | `4 + (CSAT - 51) / 7.5` | 4 - 6 |
| 66 - 80 | `6 + (CSAT - 66) / 7.5` | 6 - 8 |
| 81 - 90 | `8 + (CSAT - 81) / 10` | 8 - 9 |
| 91 - 100 | `9 + (CSAT - 91) / 10` | 9 - 10 |

NPS is rounded to the nearest integer and clamped to [0, 10].

## Description Mappings

### CSAT Descriptions

| Score Range | Description |
|-------------|-------------|
| 20 - 50 | Poor |
| 51 - 65 | Fair |
| 66 - 80 | Good |
| 81 - 90 | Very Good |
| 91 - 100 | Excellent |

### NPS Categories

| Score Range | Category | Meaning |
|-------------|----------|---------|
| 0 - 6 | Detractor | Unhappy, may churn or discourage others |
| 7 - 8 | Passives | Satisfied but not enthusiastic |
| 9 - 10 | Promoter | Loyal advocates, likely to refer |

## Example Trajectories

### Positive Account (CSAT over 39 months)
```
55 → 57 → 59 → 60 → 63 → 64 → 65 → 68 → 70 → 72 → ... → 85
```

### Recovery Account (CSAT over 39 months)
```
40 → 38 → 37 → 36 → 35 → 34 → 33 → 34 → 32 → 31 → 30 → 29 →
34 → 38 → 42 → 44 → 46 → 48 → 50 → 53 → 55 → 57 → ... → 77
```

### Volatile Account (CSAT over 39 months)
```
72 → 45 → 68 → 40 → 78 → 52 → 65 → 43 → 80 → 55 → ...
```
