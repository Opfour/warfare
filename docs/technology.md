# Technology & Science

## Overview

Knowledge is the engine of civilization. Unlike other city stats, **knowledge is uncapped** — it grows indefinitely with investment and accelerates over time. As knowledge accumulates, cities advance through technology tiers that unlock progressively more powerful weapons, defenses, and economic bonuses.

A city with knowledge 50 fields medieval armies. A city with knowledge 1000 deploys spacecraft and orbital strikes.

## Tech Tiers

| Tier | Era | Knowledge | ATK Bonus | DEF Bonus | Econ Bonus | Unlocks |
|------|-----|-----------|-----------|-----------|------------|---------|
| 1 | Primitive | 0 | - | - | - | Basic weapons and fortifications |
| 2 | Ancient | 30 | +5% | +5% | +5% | Bronze weapons, stone walls |
| 3 | Medieval | 60 | +10% | +10% | +10% | Steel weapons, castles, siege engines |
| 4 | Renaissance | 100 | +15% | +15% | +15% | Gunpowder, cannons, early firearms |
| 5 | Industrial | 175 | +25% | +20% | +25% | Factories, railways, rifled artillery, ironclads |
| 6 | Modern | 275 | +35% | +30% | +35% | Tanks, aircraft, radar, modern infantry |
| 7 | Atomic | 400 | +50% | +40% | +45% | Nuclear capability, jet fighters, guided missiles |
| 8 | Information | 550 | +65% | +55% | +55% | Stealth, drones, cyber warfare, precision weapons |
| 9 | Advanced | 700 | +80% | +70% | +65% | Energy weapons, powered armor, AI targeting |
| 10 | Future | 850 | +100% | +85% | +75% | Laser weapons, shield generators, orbital platforms |
| 11 | Space Age | 1000 | +125% | +100% | +90% | Spacecraft, orbital strikes, planetary defense grid |
| 12 | Transcendent | 1250 | +150% | +125% | +100% | Antimatter weapons, warp tech, post-scarcity economy |

## How Tech Bonuses Work

### Units Recruited at High-Tech Cities

When you recruit a unit, it inherits permanent ATK and DEF bonuses based on the recruiting city's tech tier:

```
Tech ATK Bonus = Base Attack x Tier ATK%
Tech DEF Bonus = Base Defense x Tier DEF%
```

**Example:** An Army Corps (ATK 7, DEF 7) recruited at a Modern-era city (35% bonus):
- ATK bonus: 7 x 0.35 = +2.5
- DEF bonus: 7 x 0.30 = +2.1
- Effective stats: 9.5 ATK, 9.1 DEF

These bonuses are shown in green (ATK) and blue (DEF) on unit cards. They stack with equipment captured from defeated enemies.

### Economic Bonus

Higher tech tiers automatically boost city economics each turn, creating a virtuous cycle: more knowledge → better economy → more tax income → more investment → even more knowledge.

### Population Growth

Tech level accelerates population growth through the economic bonus multiplier. Advanced cities grow significantly faster.

### Garrison Replenishment

Higher defense + tech tier means garrisons replenish faster. A Space Age city rebuilds its garrison much faster than a Primitive one.

## Knowledge Growth

Knowledge growth is **compounding** — it accelerates at higher levels:

```
Growth = Investment% x 0.02 x 0.5 x (1 + Knowledge x 0.001)
```

At knowledge 0, growth is normal. At knowledge 500, growth is 1.5x faster. At knowledge 1000, growth is 2x faster. This means early investment in knowledge pays enormous dividends in the long run.

## Notifications

When a city advances to a new tech tier, a toast notification appears at the top of the screen showing:
- City name
- New era name
- Description of what's been unlocked

You don't need to click on cities to discover upgrades — the game tells you automatically.

## Strategic Implications

- **Early game:** Knowledge investment seems slow. Defenders and scouts are cheap; focus on expansion.
- **Mid game:** Industrial and Modern cities start pulling ahead. Units from high-tech cities are noticeably stronger.
- **Late game:** A single Space Age city can produce units that outclass entire armies from Primitive cities. Knowledge supremacy wins wars.
- **The AI invests too:** AI opponents (especially Benevolent and Genteel types) also develop their technology. Don't let them reach high tiers unchallenged.

## City Display

The info panel shows knowledge as:

```
Knowledge: 347 — Modern (347/400 → Atomic)
```

This tells you the raw value, current era, and progress toward the next tier.
