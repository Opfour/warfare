# Warfare

![Warfare Logo](assets/warfare.logo.png)

A modern remake of **Warfare 1.0** (1995) by Carric Moor Games. Turn-based hex strategy with city management, unit recruitment, tactical combat, and AI opponents — playable in the browser or as a standalone Windows desktop app.

## Play

**Browser (no build required):**

```bash
cd warfare
python3 -m http.server 8000
# Open http://localhost:8000
```

**Windows Desktop (standalone .exe):**

Download `Warfare_2.0.0_Windows_x64.zip` from [Releases](https://github.com/Opfour/warfare/releases), extract, and double-click `warfare.exe`. No browser or dependencies needed — runs in its own native window.

Or use the NSIS installer (`Warfare_2.0.0_x64-setup.exe`) for Start Menu shortcuts and uninstaller.

No frameworks. Just vanilla HTML5 + Canvas + ES Modules, wrapped in a Tauri desktop shell.

## Features

### Core Game

- **Hex grid map** — procedurally generated continent with islands, bridges, and varied terrain (plains, hills, forests, mountains, swamps)
- **50+ cities** — configurable count (20-80), each with population, economics, defense, knowledge, satisfaction, and garrison stats
- **7 unit types** — Commander, Scout, Raider, Army Corps, Artillery, Mechanized, Defender — each with unique movement, combat stats, and terrain costs
- **Tactical combat** — unit-type matchup matrix, terrain bonuses, city fortification, equipment capture, truce/surrender mechanics
- **Economy** — tax collection, investment allocation across 4 sectors, city growth, revolt system
- **AI opponents** — 4 personality types: Genteel, Aggressive, Insane, Benevolent
- **Unit management** — recruitment, replenishment, splitting, merging, troop transfers, standing orders

### New in Warfare 2.0

- **Sectors** — Map divided into a sector grid. Control all cities in a sector to rule it. Tax bonuses for controlled and adjacent sectors. Toggle overlay via menu bar.
- **Town Events** — 20 random event types per turn (plagues, fires, tech advances, economic booms, sabotage, etc.) with rubber-banding: winning leaders get more negative events, losing leaders get more positive ones. Toggleable.
- **Fog of War** — Enemy units hidden unless spotted. Two visibility levels (spotted vs. detailed). Ranged by difficulty. Explored hexes stay dimly visible. AI always has full vision. Toggleable.
- **Difficulty Settings** — Four levels (Easy, Normal, Hard, KILL THE HUMAN) affecting AI bonuses, fog visibility, and starting AI relationships.
- **Scoring & Hall of Fame** — Points for combat victories, leader kills, holding towns/sectors. Top 5 scores saved to localStorage.
- **Split Units** — Divide a unit's troops in half. Original keeps leadership/experience, new unit starts fresh.
- **Leader Relationships** — AI temperament system (Forgiving, Normal, Quick to Anger, Vengeful) affecting grudge and forgiveness rates. 8 relationship stages from Neutral to MUST KILL.
- **Strategy Hints** — Context-aware tips every 3 turns across 6 categories (early game, economy, combat, sectors, danger, general). 24 unique hints with cooldowns. Dismissible.

### Map Sizes

| Size | Dimensions | Max Cities |
|------|-----------|------------|
| Standard | 60×45 | 50 |
| Large | 100×75 | 100 |
| Huge | 120×90 | 200 |

## Quick Reference

| Unit | Move | ATK | DEF | Cost | Role |
|------|------|-----|-----|------|------|
| Commander | 3 | 2 | 10 | - | Leader. Death = elimination. |
| Scout | 15 | 1 | 1 | 60g | Fast recon. Views city stats. |
| Defender | 0 | 2 | 8 | 50g | Cheap garrison. Cannot leave city. |
| Army Corps | 7 | 7 | 7 | 100g | Balanced front-line troops. |
| Raider | 12 | 6 | 3 | 200g | Fast strike force. |
| Artillery | 4 | 3 | 9 | 300g | City defense specialist. |
| Mechanized | 5 | 9 | 3 | 350g | Negates fortification. |

## Documentation

Detailed docs for each game system:

- [Units & Combat](docs/units-and-combat.md) — unit types, stats, movement, terrain costs, combat matchups, capture mechanics
- [Technology](docs/technology.md) — 12 tech tiers from Primitive to Transcendent, knowledge growth, unit tech bonuses, notifications
- [Cities & Economy](docs/cities-and-economy.md) — city attributes, taxes, investment, growth, revolts, recruitment
- [Orders & Movement](docs/orders-and-movement.md) — standing orders, move-to system, animated movement, pathfinding
- [AI Opponents](docs/ai-opponents.md) — personality types, decision logic, behavior patterns
- [Controls](docs/controls.md) — mouse, keyboard, right-click menus, info panel, menu bar
- [New Features](docs/new-features.md) — sectors, events, fog of war, difficulty, scoring, split units, relationships, hints

## Architecture

```
warfare/
├── index.html              # Single page app shell
├── css/warfare.css         # All styling
├── js/
│   ├── main.js             # Entry point, game loop, UI wiring
│   ├── config.js           # Constants, balance values, combat matrix
│   ├── hex.js              # Hex math (axial coords, neighbors, distance)
│   ├── map.js              # Continent + island generation, terrain, cities
│   ├── renderer.js         # Canvas drawing (grid, terrain, cities, units, HUD)
│   ├── camera.js           # Viewport pan, scroll, zoom, bounds clamping
│   ├── input.js            # Mouse/keyboard, hex click, pathfinding, animation
│   ├── unit.js             # Unit creation, recruitment, management, splitting
│   ├── player.js           # Player model, treasury, income
│   ├── combat.js           # Combat resolution, matchups, capture, truce/surrender
│   ├── ai.js               # AI decision engine, 4 personalities
│   ├── turn.js             # Turn manager, phase sequencing, auto-movement
│   ├── investment.js        # Tax/investment, city growth, revolt logic
│   ├── orders.js           # Unit orders system (attack, hold, dig-in, move-to, etc.)
│   ├── sectors.js          # Sector grid, ownership, tax bonuses
│   ├── events.js           # Random town events (20 types, rubber-banding)
│   ├── fog.js              # Fog of war, visibility ranges, explored hexes
│   ├── hints.js            # Strategy hints (24 tips, 6 categories, cooldowns)
│   ├── save.js             # Save/load to localStorage
│   └── utils.js            # Seeded RNG, helpers
├── assets/                 # Logo and images
├── docs/                   # Detailed game documentation
└── src-tauri/              # Tauri desktop wrapper (Windows .exe build)
    ├── Cargo.toml          # Rust dependencies
    ├── tauri.conf.json     # Window config, bundle settings
    ├── build.rs            # Tauri build script
    ├── icons/icon.ico      # App icon (generated from logo)
    └── src/main.rs         # Rust entry point
```

## Desktop Build (Windows)

The game runs as a standalone Windows application via [Tauri](https://tauri.app). The .exe is 3.3MB — all JS, CSS, and HTML are embedded inside. Uses WebView2 (built into Windows 10/11).

**Prerequisites:** Rust 1.89+, `cargo-tauri`, `cargo-xwin` (for cross-compilation from Linux)

**Build from source:**

```bash
# Copy frontend assets to dist/
cp -r index.html js css assets favicon.png dist/

# Cross-compile Windows .exe + NSIS installer
cd src-tauri
cargo tauri build --target x86_64-pc-windows-msvc

# Output:
#   target/x86_64-pc-windows-msvc/release/warfare.exe           (standalone .exe)
#   target/x86_64-pc-windows-msvc/release/bundle/nsis/Warfare_2.0.0_x64-setup.exe  (installer)
```

Rebuild after game changes: update `dist/` with current frontend files, then re-run `cargo tauri build`.

## Origins

Warfare 1.0 was a Windows 3.1 turn-based strategy game released in 1995 by Carric Moor Games. This remake preserves the core gameplay — hex grid, city economics, 7 unit types, AI personalities — while modernizing the interface and adding new systems: sectors, town events, fog of war, difficulty scaling, scoring, split units, leader relationships, and strategy hints.

If you played the original game and have suggestions/corrections drop an issue and we'll review and implement the changes if it improves gameplay!

## License

AGPL-3.0 — See [LICENSE](LICENSE) for details.