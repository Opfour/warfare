# Warfare -- Hex Strategy Game

HTML5 remake of Warfare 1.0 (1995) by Carric Moor Games. Turn-based hex strategy with city management, unit recruitment, tactical combat, and AI opponents.

## Stack

Vanilla HTML5 + Canvas + ES Modules. No build step, no frameworks.

## Run

```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

## Key Files

- `index.html` -- Single page app shell
- `css/warfare.css` -- All styling
- `js/main.js` -- Entry point, game loop, UI wiring
- `js/config.js` -- Constants, balance values, combat matrix
- `js/hex.js` -- Hex math (axial coords, neighbors, distance)
- `js/map.js` -- Continent + island generation, terrain, cities
- `js/renderer.js` -- Canvas drawing (grid, terrain, cities, units, HUD)
- `js/combat.js` -- Combat resolution, matchups, capture, truce/surrender
- `js/ai.js` -- AI decision engine, 4 personalities
- `js/turn.js` -- Turn manager, phase sequencing
- `js/unit.js` -- Unit creation, recruitment, management
- `js/city.js` -- City model and attributes
- `js/investment.js` -- Tax/investment, city growth, revolt logic
- `js/orders.js` -- Unit orders system
- `js/save.js` -- Save/load (planned)

## Game Systems

- 7 unit types: Commander, Scout, Raider, Army Corps, Artillery, Mechanized, Defender
- 4 AI personalities: Genteel, Aggressive, Insane, Benevolent
- Economy: tax collection, investment allocation, city growth, revolts
- Procedural hex map with terrain types

## Docs

Detailed docs in `docs/`: units-and-combat, technology, cities-and-economy, orders-and-movement, ai-opponents, controls.

## Rules

- No frameworks or build tools. Keep it vanilla JS.
- Test in browser. Open dev console for errors.


## Git Recon (run before reading code)

```bash
# Churn hotspots
git log --format=format: --name-only --since="1 year ago" | sort | uniq -c | sort -nr | head -20
# Bus factor
git shortlog -sn --no-merges
# Bug clusters
git log -i -E --grep="fix|bug|broken" --name-only --format= | sort | uniq -c | sort -nr | head -20
# Activity timeline
git log --format='%ad' --date=format:'%Y-%m' | sort | uniq -c
# Crisis patterns
git log --oneline --since="1 year ago" | grep -iE 'revert|hotfix|emergency|rollback'
```
