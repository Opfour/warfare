# Cities & Economy

## City Attributes

Each city has the following stats (0-100 scale unless noted):

| Attribute | Description |
|-----------|-------------|
| **Population** | Total citizens. Grows each turn based on economics and satisfaction. Source of tax income and conscripts. |
| **Economics** | Determines tax efficiency and income. Improved via investment. |
| **Defense** | City fortification strength. Improves garrison replenishment rate. |
| **Knowledge** | Intellectual development. Affects raider effectiveness when recruited here. |
| **Satisfaction** | How happy citizens are. Drops from high taxes, conquest. Below 20 triggers revolts. |
| **Garrison** | Local militia (not a unit). Slowly replenishes based on population and defense investment. Damaged during revolts and combat. |

### City Rating

Cities are graded S through F based on a composite score:

```
Score = Population(25%) + Knowledge(20%) + Defense(20%) + Economics(25%) + Satisfaction(10%)
```

| Grade | Score |
|-------|-------|
| S | 80+ |
| A | 65-79 |
| B | 50-64 |
| C | 35-49 |
| D | 20-34 |
| F | Below 20 |

## Taxes

Each city generates income per turn:

```
Income = Population x (Economics / 100) x (Tax Rate / 100) x 0.05
```

Total income from all cities is shown on the HUD as green `+X/turn` text.

### Tax Rate Effects

- **Below 30%** — Satisfaction slowly increases (+0.05 per point below 30 per turn)
- **30-50%** — Neutral; no satisfaction impact
- **Above 50%** — Satisfaction drops (-0.1 per point above 50 per turn)
- Tax rate range: 0% to 80%

## Investment

Each city has 4 investment sectors. Allocations are percentages that sum to 100%:

| Sector | Effect |
|--------|--------|
| **Defense** | Increases city defense stat; improves garrison replenishment |
| **Knowledge** | Increases knowledge stat; boosts raider quality when recruited here |
| **Public** | Increases citizen satisfaction directly |
| **Economics** | Increases economics stat; improves tax income over time |

Growth per turn per sector: `allocation% x 0.02 x 0.5` (capped at 100).

## Population Growth

```
Growth = Population x 0.02 x (Economics x Satisfaction / 10000)
```

High economics and satisfaction produce compounding growth. Conquered cities grow slowly due to low satisfaction.

## Recruitment

Units are recruited at cities you own. Costs gold from your treasury and conscripts a small number of citizens (reduces population).

- Batch recruitment: create 1, 2, 3, 5, or 10 units at once
- Population requirement: each unit type needs a minimum city population
- Conscription cost: ~10% of city population or 30% of unit's max troops (whichever is less)

### Replenishment

Units stationed in your cities can replenish lost troops for gold. Cost per troop is based on:

```
Cost/troop = (Unit Cost / Max Troops) x (1 + (100 - City Economics) / 100)
```

Better city economics = cheaper replenishment. Replenishing also conscripts a small amount from local population.

## Revolts

When city satisfaction drops below 20, a revolt may occur:

- **Chance:** (20 - Satisfaction) x 3% per turn (max 60%)
- **Effect:** Garrison loses 30-70% of troops. Units in the city lose half that percentage.
- **Recovery:** Satisfaction bumps up slightly after a revolt (citizens vented)

Revolts are devastating. Keep satisfaction above 20 by investing in public works and not over-taxing.

## Capturing Cities

When you defeat all enemy units at a city:

- City ownership transfers to you
- Garrison reduced to 30% (battle damage)
- Satisfaction drops by 20 (conquest unhappiness)
- Recruit defenders immediately to hold it

## Unit Splitting & Merging

At any hex with 2+ of your units:

- **Merge** — combine two units into one (choose which type to keep). Troops transfer up to the type's max capacity.
- **Transfer** — move a specific number of troops from one unit to another.
- **Split** — available in the recruit dialog; take troops from an existing unit to form a new one.

Army Corps can absorb captured troops from any unit type during combat.
