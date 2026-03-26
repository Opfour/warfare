# Units & Combat

## Unit Types

### Commander
- **Move:** 3 | **ATK:** 2 | **DEF:** 10 | **Cost:** Free
- Your leader. Ignores all terrain costs (moves at cost 1 everywhere).
- **Death = elimination.** If your commander dies, you lose the game. All your cities go neutral and units are removed.
- Can relocate between cities but should be protected at all times.

### Scout
- **Move:** 15 | **ATK:** 1 | **DEF:** 1 | **Troops:** 5 | **Cost:** 60g
- Fastest unit in the game. Lightly penalized by rough terrain.
- Best used for exploration, scouting enemy positions, and racing to claim neutral cities.
- Very weak in combat — avoid direct engagements.

### Defender
- **Move:** 0 | **ATK:** 2 | **DEF:** 8 | **Troops:** 2000 | **Cost:** 50g
- Cannot leave a city. Cheapest unit to recruit.
- Gets a 1.4x fortification bonus when defending in a city.
- Strong against raiders (1.3x) and army corps (1.2x) on defense.
- Essential for holding captured cities.

### Army Corps
- **Move:** 7 | **ATK:** 7 | **DEF:** 7 | **Troops:** 5000 | **Cost:** 100g
- Balanced front-line unit with the highest troop capacity.
- Can absorb captured troops from any unit type.
- Effective against scouts (2.0x) and raiders (1.2x).
- The backbone of any army.

### Raider
- **Move:** 12 | **ATK:** 6 | **DEF:** 3 | **Troops:** 1000 | **Cost:** 200g
- Fast offensive unit. Effectiveness scales with origin city's knowledge and economics.
- Strong against artillery (1.4x) and scouts (1.8x).
- Weak against mechanized (0.6x) and defenders (0.7x).
- Best for flanking, hit-and-run, and targeting undefended positions.

### Artillery
- **Move:** 4 | **ATK:** 3 | **DEF:** 9 | **Troops:** 500 | **Cost:** 300g
- Slow but extremely tough on defense. Gets a 1.3x city defense bonus.
- Strong against army corps (1.3x) and defenders (1.3x).
- Very weak against mechanized (0.5x) — their main counter.
- Cannot cross mountains or swamps.

### Mechanized
- **Move:** 5 | **ATK:** 9 | **DEF:** 3 | **Troops:** 500 | **Cost:** 350g
- Highest base attack. Negates city fortification bonuses.
- Dominates artillery (1.8x), defenders (1.5x), and raiders (1.5x).
- Weak defense makes them vulnerable to attrition.
- Cannot cross mountains; heavily penalized in swamps.

## Terrain Movement Costs

| Terrain | Base | Commander | Scout | Army/Raider | Artillery | Mechanized |
|---------|------|-----------|-------|-------------|-----------|------------|
| Plains | 1 | 1 | 1 | 1 | 1 | 1 |
| Bridge | 1 | 1 | 1 | 1 | 1 | 1 |
| Hills | 2 | 1 | 1 | 2 | 3 | 3 |
| Forest | 2 | 1 | 1 | 2 | 3 | 3 |
| Mountain | 3 | 1 | 2 | 3 | Blocked | Blocked |
| Swamp | 3 | 1 | 2 | 3 | Blocked | 4 |
| Ocean | - | - | - | - | - | - |

## Combat System

### Strength Calculation

```
Effective Strength = Troops x (Base Stat + Equipment Bonus) x Order Bonus x Matchup Multiplier x Terrain Bonus
```

Each combat round, both sides inflict casualties proportional to their strength ratio at a base rate of 8% per round.

### Unit Matchup Matrix

Each attacker type has a specific multiplier when fighting each defender type:

| Attacker vs | CMD | DEF | SCT | ARMY | RAD | ART | MECH |
|-------------|-----|-----|-----|------|-----|-----|------|
| Commander | 1.0 | 0.5 | 1.5 | 0.4 | 0.4 | 0.3 | 0.3 |
| Defender | 1.5 | 1.0 | 1.8 | 1.2 | 1.3 | 0.8 | 0.7 |
| Scout | 0.8 | 0.3 | 1.0 | 0.2 | 0.3 | 0.5 | 0.2 |
| Army Corps | 1.5 | 0.9 | 2.0 | 1.0 | 1.2 | 0.7 | 0.8 |
| Raider | 1.5 | 0.7 | 1.8 | 0.9 | 1.0 | 1.4 | 0.6 |
| Artillery | 1.8 | 1.3 | 1.5 | 1.3 | 0.8 | 1.0 | 0.5 |
| Mechanized | 1.8 | 1.5 | 2.0 | 1.2 | 1.5 | 1.8 | 1.0 |

### Battle Options

When initiating combat, you can choose:

- **Fight** — exchange rounds (up to 20), then battle pauses so you can reassess
- **Fight to Death** — no round limit; one side will be destroyed
- **Offer Truce** — both sides stop fighting and keep their troops. AI accepts based on how badly they're losing
- **Demand Surrender** — if you heavily outmatch the enemy, they may give up entirely. You get all their troops and equipment
- **Withdraw** — fight one round then disengage
- **Retreat** — leave without fighting

### Capture Mechanics

When you defeat an enemy or force a surrender, you get captured spoils:

- **Prisoners** — 10-30% of the enemy's troops survive (50-70% on surrender)
- **Equipment** — gear worth gold or usable as permanent stat boosts

You choose what to do:

| Option | Effect |
|--------|--------|
| Use equipment | Permanent ATK/DEF boost to your unit |
| Sell equipment | Convert to gold |
| Absorb troops | Add prisoners to your unit (same type or Army Corps only) |
| Troops + use equipment | Both |
| Troops + sell equipment | Both |
| Disband all | Release everything |

Equipment bonuses stack across multiple captures and are shown on unit cards as green (ATK) and blue (DEF) numbers.

### Terrain Defense Bonuses

| Terrain | Multiplier |
|---------|-----------|
| Plains | 1.0x |
| Hills | 1.3x |
| Forest | 1.2x |
| Mountain | 1.5x |
| Swamp | 0.8x |
| Bridge | 0.9x |

City fortification adds 1.5x (negated by Mechanized). Artillery in cities gets an additional 1.3x. Defenders in cities get an additional 1.4x.
