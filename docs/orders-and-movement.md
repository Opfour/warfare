# Orders & Movement

## Standing Orders

Each unit has a standing order that affects combat behavior:

| Order | ATK Bonus | DEF Bonus | Notes |
|-------|-----------|-----------|-------|
| **Attack** | 1.2x | 1.0x | Aggressive posture |
| **Advance** | 1.0x | 1.0x | Default forward movement |
| **Hold** | 1.0x | 1.2x | Defensive posture, fights back |
| **Dig In** | 0.8x | 1.5x | Maximum defense, reduced offense |
| **Retreat** | 1.0x | 0.7x | Will not fight back if attacked |
| **Move To** | 1.0x | 1.0x | Auto-moves toward destination each turn |

Orders can be set via:
- Unit card buttons in the info panel
- Right-click context menu on a hex with your units
- The Orders menu bar button (with a unit selected)

## Movement

### Movement Points

Each unit type has a base movement value that resets each turn:

| Unit | Move Points |
|------|-------------|
| Scout | 15 |
| Raider | 12 |
| Army Corps | 7 |
| Mechanized | 5 |
| Artillery | 4 |
| Commander | 3 |
| Defender | 0 (cannot move) |

### Terrain Costs

Moving into a hex costs movement points based on terrain and unit type. See [Units & Combat](units-and-combat.md) for the full terrain cost table.

Key rules:
- **Commander** ignores all terrain (cost 1 everywhere)
- **Scout** is lightly penalized (cost 1-2 for most terrain)
- **Artillery** cannot cross mountains or swamps
- **Mechanized** cannot cross mountains; swamps cost 4
- All units can cross bridges at cost 1

### Movement Range

Click a unit to see its movement range highlighted in yellow. The range is calculated via BFS (breadth-first search) using the unit's remaining movement points and terrain costs.

### Animated Movement

When you click a destination hex within range:
1. A shortest path is calculated (Dijkstra's algorithm)
2. The unit moves hex-by-hex at ~150ms per step
3. Movement points are deducted per step based on terrain cost
4. Input is locked during animation

### Move To Order

The "Move To" system lets you set a long-distance destination:

1. Click the "move to..." button on a unit card
2. Cursor changes to crosshair
3. Click any hex on the map to set the destination
4. Press Escape to cancel

Each turn, the unit automatically moves as far as it can toward the destination. When it arrives, orders switch to Hold. If the path is blocked, it moves to the closest reachable hex.

## Pathfinding

Both immediate movement and Move To use Dijkstra's algorithm:
- Respects per-unit terrain costs
- Avoids impassable terrain (oceans, mountains for artillery/mech)
- Stays within available movement points per turn
- For Move To, continues across multiple turns until arrival
