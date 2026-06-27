# New Features — From Original Game Manual

Features added to the HTML5 remake based on reverse-engineering the original Warfare 1.0 (1995) by Carric Moor Games.

## Sectors

The map is divided into a sector grid (5×5 for 1-2 opponents, 6×6 for 3). Each sector contains at least one city. Control all cities in a sector to rule it.

- **Tax bonus:** Cities in a controlled sector produce 15% more tax
- **Adjacent bonus:** Each adjacent controlled sector adds 20% more tax to border cities
- **Overlay:** Toggle "Sectors" button in menu bar to see sector borders and ownership colors
- **Info panel:** Click any hex to see sector number, owner, and tax bonus

## Town Events

Random events occur each turn with 15% chance per city. Events are beneficial or catastrophic, with rubber-banding:

- **Winning leaders** get more negative events (plagues, fires, sabotage)
- **Losing leaders** get more positive events (tech advances, investment booms)
- **20 event types:** Plague, Flu, Arson, Terrorist Bombings, Earthquake, Minor Tech Advance, Investments Pay Off, Shield Dome, Enemy Tech Stolen, Town Expansion, Economic Boom, Golden Harvest, Refugees, Cultural Renaissance, Sabotage, Bacteriological Accident, Minor Uprising, Famine, Accident, Brilliant Advance
- **Toggle:** "Events: On/Off" button in menu bar

## Fog of War

Enemy units are hidden unless spotted by your units. Two visibility levels:

- **Spotted:** Unit seen, leader identified (generic icon, no stats)
- **Detailed:** Full stats visible (unit type, troops, attack, defense)
- **Ranges by difficulty:** Easy (all visible), Normal (5/3 hexes), Hard (3/1), KILL THE HUMAN (2/0)
- **Tech modifier:** Higher enemy technology reduces your spotting range
- **Explored hexes:** Stay visible at reduced brightness; unexplored areas are dark
- **Toggle:** "Fog: On/Off" button in menu bar
- **AI always has full visibility**

## Difficulty Settings

Four difficulty levels affecting AI bonuses, fog of war, and starting relationships:

| Level | AI Multiplier | Visibility | AI Attitude |
|-------|--------------|------------|-------------|
| Easy | 0.8× tax/growth/tech | All visible | Neutral |
| Normal | 1.0× | Standard fog | Annoyed |
| Hard | 1.3× | Reduced fog | Hate |
| KILL THE HUMAN | 1.6× | Minimal fog | MUST KILL |

## Scoring & Hall of Fame

Points awarded for actions:
- Combat victory: +25
- Leader kill: +10,000
- Holding a town per turn: +100
- Holding a sector per turn: +250

Top 5 scores saved to localStorage as Hall of Fame. Shown on game over.

## Split Units

Divide a unit's troops in half. Original unit keeps leadership/experience. New unit gets leadership=0. Cannot split units with fewer than 2 troops.

- "Split Unit" button appears on unit cards in the info panel

## Leader Relationships (AI Temperament)

Each AI leader has a temperament affecting how relationships evolve:

| Temperament | Grudge Rate | Forgiveness |
|-------------|------------|-------------|
| Forgiving | 0.5× | 2.0× |
| Normal | 1.0× | 1.0× |
| Quick to Anger | 1.5× | 0.5× |
| Vengeful | 2.0× | 0.25× |

Relationship stages: Neutral → Miffed → Unhappy → Annoyed → Angry → Hate → Despise → MUST KILL

- AI prioritizes attacking leaders with worse relationships
- Relationships degrade when attacked or when that leader is winning
- Relationships recover over time or when that leader attacks others

## Strategy Hints

Context-aware tips shown every 3 turns at the bottom of the screen:

- **Early game:** City claiming, expansion advice
- **Economy:** Investment priorities, tax management
- **Combat:** Unit matchups, fortification cracking
- **Sectors:** Territory control strategy
- **Danger:** Commander protection, enemy proximity warnings
- **General:** Mid-game and late-game tips

24 unique hints across 6 categories, with cooldowns to avoid repetition. Dismissible via X button.