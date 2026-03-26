# Controls

## Mouse

| Action | Effect |
|--------|--------|
| **Left click** hex | Select hex, show info panel (city stats, unit cards) |
| **Left click** unit | Select unit, show movement range |
| **Left click** highlighted hex | Move selected unit to that hex |
| **Left click + drag** | Pan the map |
| **Middle click + drag** | Pan the map (alternative) |
| **Right click** hex | Open context menu (recruit, orders, select unit) |
| **Scroll wheel** | (Reserved for future zoom) |

## Keyboard

| Key | Effect |
|-----|--------|
| **W / Arrow Up** | Scroll map up |
| **S / Arrow Down** | Scroll map down |
| **A / Arrow Left** | Scroll map left |
| **D / Arrow Right** | Scroll map right |
| **Escape** | Close context menu, deselect unit/hex, cancel move-to pick mode |

## Info Panel (Right Side)

Appears when you click a hex with a city or units:

### City Section
- City name, owner, population
- Knowledge, defense, economics, satisfaction, garrison stats
- City rating (S through F) with composite score
- **Recruit Unit** button (your cities only)

### Units Section
- Expandable unit cards — click `[+]` to see full stats
- Shows: troops, moves remaining, attack, defense, orders, equipment bonuses
- **Order buttons** — set standing orders inline (attack, retreat, hold, advance, dig-in)
- **Move to...** — enter destination-pick mode (crosshair cursor)
- **Replenish Troops** — restore lost troops for gold (only in your cities)
- **Manage Troops** — merge units, transfer troops (when 2+ of your units share a hex)

### Close
- Click the X button or press Escape

## Right-Click Context Menu

Right-click any hex to see available actions:

- **At your city:** Recruit Unit, Invest
- **At your units:** Select unit, set orders (submenu with all order types)
- Multiple units show separate entries for each

## Menu Bar

| Button | Function |
|--------|----------|
| **New** | Start a new game (configure opponents, personality, city count) |
| **End Turn** | Process AI turns, collect taxes, grow cities, check revolts, advance turn |
| **Invest** | Open investment dialog for selected or first owned city |
| **Orders** | Open orders dialog for selected unit |
| **List** | View all your cities and units in tables |
| **Reports** | Strategic overview — your forces vs opponents |

## HUD (On-Canvas)

- **Bottom-left:** Turn counter
- **Bottom-right:** Gold treasury (large gold text) with income per turn (green text)
- **Bottom-left (on hover):** Hex coordinates, terrain type, city name and population
