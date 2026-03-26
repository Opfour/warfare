# AI Opponents

## Overview

The game supports 1-4 AI opponents, each assigned a personality that drives all their decisions: what to build, where to invest, when to attack, and when to retreat.

## Personality Types

### Genteel
> *"A measured approach wins wars."*

- **Expansion:** Low (0.3) — slow to grab neutral cities
- **Militarism:** Low (0.2) — small military, prefers economy
- **Development:** High (0.8) — invests heavily in city growth
- **Aggression:** Low (0.2) — rarely initiates attacks
- **Retreat Threshold:** High (0.7) — retreats when odds dip below 70%
- **Recklessness:** Very low (0.1) — never takes bad fights

**Strategy:** Builds a strong economic base, only fights when provoked or holding a clear advantage. Dangerous in long games where their economy compounds.

### Aggressive
> *"Strike fast, strike hard."*

- **Expansion:** High (0.8) — races to claim territory
- **Militarism:** High (0.8) — large military budgets
- **Development:** Low (0.3) — neglects city development
- **Aggression:** High (0.8) — actively seeks out enemies
- **Retreat Threshold:** Low (0.3) — fights even at poor odds
- **Recklessness:** Medium (0.5) — sometimes overcommits

**Strategy:** Expands rapidly and builds armies early. Can overwhelm unprepared opponents but may exhaust their economy in extended wars.

### Insane
> *"Chaos is a ladder."*

- **Expansion:** Maximum (1.0) — grabs everything in reach
- **Militarism:** Very high (0.9) — massive military spending
- **Development:** Minimal (0.1) — almost no investment
- **Aggression:** Maximum (1.0) — attacks anything, anytime
- **Retreat Threshold:** Near-zero (0.05) — almost never retreats
- **Recklessness:** Very high (0.9) — takes suicidal fights

**Strategy:** Unpredictable and relentless. Throws everything at opponents regardless of odds. Can be devastating early but self-destructs if the game goes long.

### Benevolent
> *"A prosperous nation is a strong nation."*

- **Expansion:** Moderate (0.4) — claims nearby neutrals
- **Militarism:** Very low (0.1) — minimal military
- **Development:** Very high (0.9) — maximum city investment
- **Aggression:** Very low (0.1) — almost never attacks first
- **Retreat Threshold:** High (0.8) — avoids losses
- **Recklessness:** Minimal (0.05) — never takes bad fights

**Strategy:** Focuses entirely on economic development. Weak early but becomes extremely wealthy and can field elite units in the late game. Best countered with early pressure.

## AI Decision Logic

Each AI turn follows this sequence:

1. **Collect taxes** from all owned cities
2. **Set investment** — weighted by personality (aggressive = more defense/military, benevolent = more economics/public)
3. **Recruit units** — prioritized by personality's militarism value
4. **Evaluate each unit** — for each unit, the AI considers:
   - Grab a nearby neutral city (weighted by expansion)
   - Attack a nearby enemy unit or city (weighted by aggression)
   - Defend home territory (always considered)
   - Retreat if threatened and strength ratio is below retreat threshold
5. **Execute moves** — units act on their evaluated priorities

### Commander Protection

The AI keeps its commander in a safe city. The commander only moves if an enemy unit is within 3 hexes (emergency relocation).

## Multiple Opponents

You can play against up to 4 AI opponents simultaneously. Each can have the same or different personalities. In the New Game dialog, all opponents share the selected personality — future versions may allow mixed personalities.

AI opponents do not ally with each other but may incidentally fight over territory.
