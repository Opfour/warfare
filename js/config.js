// Game constants and balance values
export const HEX_SIZE = 28; // pixels from center to corner
export const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
export const HEX_HEIGHT = 2 * HEX_SIZE;

// Default map settings
export const DEFAULT_MAP_WIDTH = 60;
export const DEFAULT_MAP_HEIGHT = 45;
export const DEFAULT_CITY_COUNT = 50;
export const DEFAULT_LAND_RATIO = 0.40;

// Map scaling by opponent count — more players = bigger continent
export const MAP_SCALE = [
    { opponents: 1, width: 60,  height: 45,  cities: 50,  regions: 5  },
    { opponents: 2, width: 80,  height: 60,  cities: 75,  regions: 7  },
    { opponents: 3, width: 100, height: 75,  cities: 100, regions: 10 },
];

export function getMapScale(opponents) {
    return MAP_SCALE.find(s => s.opponents === opponents) || MAP_SCALE[MAP_SCALE.length - 1];
}

// Terrain types
export const TERRAIN = {
    OCEAN: 'ocean',
    PLAINS: 'plains',
    HILLS: 'hills',
    FOREST: 'forest',
    MOUNTAIN: 'mountain',
    SWAMP: 'swamp',
    BRIDGE: 'bridge',
    RIVER: 'river',
    DESERT: 'desert',
    ISTHMUS: 'isthmus',
};

// Terrain colors
export const TERRAIN_COLORS = {
    [TERRAIN.OCEAN]: '#2266aa',
    [TERRAIN.PLAINS]: '#4a8c3f',
    [TERRAIN.HILLS]: '#6b8f3a',
    [TERRAIN.FOREST]: '#2d6e2d',
    [TERRAIN.MOUNTAIN]: '#8a8a7a',
    [TERRAIN.SWAMP]: '#3a6a5a',
    [TERRAIN.BRIDGE]: '#8a7a5a',
    [TERRAIN.RIVER]: '#3377cc',
    [TERRAIN.DESERT]: '#c4a94d',
    [TERRAIN.ISTHMUS]: '#7a9a5a',
};

// Terrain symbols drawn on hex tiles for easy identification
export const TERRAIN_SYMBOLS = {
    [TERRAIN.OCEAN]: '~',
    [TERRAIN.PLAINS]: '',       // blank — default terrain
    [TERRAIN.HILLS]: '^^^',
    [TERRAIN.FOREST]: '♣',
    [TERRAIN.MOUNTAIN]: '▲',
    [TERRAIN.SWAMP]: '≈',
    [TERRAIN.BRIDGE]: '═',
    [TERRAIN.RIVER]: '≋',
    [TERRAIN.DESERT]: '░',
    [TERRAIN.ISTHMUS]: '⌇',
};

// Base terrain movement cost (1 = normal, higher = slower)
export const TERRAIN_MOVE_COST = {
    [TERRAIN.OCEAN]: Infinity,
    [TERRAIN.PLAINS]: 1,
    [TERRAIN.HILLS]: 2,
    [TERRAIN.FOREST]: 2,
    [TERRAIN.MOUNTAIN]: 3,
    [TERRAIN.SWAMP]: 3,
    [TERRAIN.BRIDGE]: 1,
    [TERRAIN.RIVER]: 2,
    [TERRAIN.DESERT]: 2,
    [TERRAIN.ISTHMUS]: 1,
};

// Per-unit-type terrain cost overrides
export const UNIT_TERRAIN_COST = {
    [TERRAIN.OCEAN]: {},
    [TERRAIN.PLAINS]: {},
    [TERRAIN.HILLS]: {
        commander: 1, scout: 1, raider: 2, army_corps: 2,
        artillery: 3, mechanized: 3, defender: 2,
    },
    [TERRAIN.FOREST]: {
        commander: 1, scout: 1, raider: 2, army_corps: 2,
        artillery: 3, mechanized: 3, defender: 2,
    },
    [TERRAIN.MOUNTAIN]: {
        commander: 1, scout: 2, raider: 3, army_corps: 3,
        artillery: Infinity, mechanized: Infinity, defender: 3,
    },
    [TERRAIN.SWAMP]: {
        commander: 1, scout: 2, raider: 3, army_corps: 3,
        artillery: Infinity, mechanized: 4, defender: 3,
    },
    [TERRAIN.BRIDGE]: {},
    [TERRAIN.RIVER]: {
        commander: 1, scout: 1, raider: 2, army_corps: 2,
        artillery: 3, mechanized: 3, defender: 2,
    },
    [TERRAIN.DESERT]: {
        commander: 1, scout: 2, raider: 2, army_corps: 3,
        artillery: Infinity, mechanized: 2, defender: 3,
    },
    [TERRAIN.ISTHMUS]: {},
};

// Get movement cost for a specific unit type on a terrain
export function getMoveCost(terrain, unitType) {
    const overrides = UNIT_TERRAIN_COST[terrain];
    if (overrides && overrides[unitType] !== undefined) {
        return overrides[unitType];
    }
    return TERRAIN_MOVE_COST[terrain];
}

// Terrain defense bonus multiplier
export const TERRAIN_DEFENSE_BONUS = {
    [TERRAIN.OCEAN]: 0,
    [TERRAIN.PLAINS]: 1.0,
    [TERRAIN.HILLS]: 1.3,
    [TERRAIN.FOREST]: 1.2,
    [TERRAIN.MOUNTAIN]: 1.5,
    [TERRAIN.SWAMP]: 0.8,
    [TERRAIN.BRIDGE]: 0.9,
    [TERRAIN.RIVER]: 1.4,
    [TERRAIN.DESERT]: 0.7,
    [TERRAIN.ISTHMUS]: 1.6,
};

// Unit types
export const UNIT_TYPE = {
    COMMANDER: 'commander',
    SCOUT: 'scout',
    RAIDER: 'raider',
    ARMY_CORPS: 'army_corps',
    ARTILLERY: 'artillery',
    MECHANIZED: 'mechanized',
    DEFENDER: 'defender',
};

// Unit stats — movement values match original Warfare 1.0
// Costs tiered by capability; replenish cost = cost / maxTroops per soldier
export const UNIT_STATS = {
    [UNIT_TYPE.COMMANDER]:  { move: 3,  attack: 2,  defense: 10, maxTroops: 1,    cost: 0,    symbol: '★', name: 'Commander' },
    [UNIT_TYPE.DEFENDER]:   { move: 0,  attack: 2,  defense: 8,  maxTroops: 2000, cost: 50,   symbol: '⛨', name: 'Defender' },
    [UNIT_TYPE.SCOUT]:      { move: 15, attack: 1,  defense: 1,  maxTroops: 5,    cost: 60,   symbol: '◈', name: 'Scout' },
    [UNIT_TYPE.ARMY_CORPS]: { move: 7,  attack: 7,  defense: 7,  maxTroops: 5000, cost: 100,  symbol: '⛊', name: 'Army Corps' },
    [UNIT_TYPE.RAIDER]:     { move: 12, attack: 6,  defense: 3,  maxTroops: 1000, cost: 200,  symbol: '⚔', name: 'Raider' },
    [UNIT_TYPE.ARTILLERY]:  { move: 4,  attack: 3,  defense: 9,  maxTroops: 500,  cost: 300,  symbol: '⊕', name: 'Artillery' },
    [UNIT_TYPE.MECHANIZED]: { move: 5,  attack: 9,  defense: 3,  maxTroops: 500,  cost: 350,  symbol: '⊛', name: 'Mechanized' },
};

// Unit-type vs unit-type combat effectiveness matrix
// Multiplier applied to attacker's strength when attacking a specific defender type
// > 1.0 = advantage, < 1.0 = disadvantage, 1.0 = neutral
export const COMBAT_MATCHUP = {
    //                        vs CMD   vs DEF   vs SCT   vs ARMY  vs RAD   vs ART   vs MECH
    [UNIT_TYPE.COMMANDER]:  { commander: 1.0, defender: 0.5, scout: 1.5, army_corps: 0.4, raider: 0.4, artillery: 0.3, mechanized: 0.3 },
    [UNIT_TYPE.DEFENDER]:   { commander: 1.5, defender: 1.0, scout: 1.8, army_corps: 1.2, raider: 1.3, artillery: 0.8, mechanized: 0.7 },
    [UNIT_TYPE.SCOUT]:      { commander: 0.8, defender: 0.3, scout: 1.0, army_corps: 0.2, raider: 0.3, artillery: 0.5, mechanized: 0.2 },
    [UNIT_TYPE.ARMY_CORPS]: { commander: 1.5, defender: 0.9, scout: 2.0, army_corps: 1.0, raider: 1.2, artillery: 0.7, mechanized: 0.8 },
    [UNIT_TYPE.RAIDER]:     { commander: 1.5, defender: 0.7, scout: 1.8, army_corps: 0.9, raider: 1.0, artillery: 1.4, mechanized: 0.6 },
    [UNIT_TYPE.ARTILLERY]:  { commander: 1.8, defender: 1.3, scout: 1.5, army_corps: 1.3, raider: 0.8, artillery: 1.0, mechanized: 0.5 },
    [UNIT_TYPE.MECHANIZED]: { commander: 1.8, defender: 1.5, scout: 2.0, army_corps: 1.2, raider: 1.5, artillery: 1.8, mechanized: 1.0 },
};

// AI personality presets
export const AI_PERSONALITY = {
    GENTEEL: {
        name: 'Genteel',
        expansion: 0.3,
        militarism: 0.2,
        development: 0.8,
        aggression: 0.2,
        retreatThreshold: 0.7,
        recklessness: 0.1,
    },
    AGGRESSIVE: {
        name: 'Aggressive',
        expansion: 0.8,
        militarism: 0.8,
        development: 0.3,
        aggression: 0.8,
        retreatThreshold: 0.3,
        recklessness: 0.5,
    },
    INSANE: {
        name: 'Insane',
        expansion: 1.0,
        militarism: 0.9,
        development: 0.1,
        aggression: 1.0,
        retreatThreshold: 0.05,
        recklessness: 0.9,
    },
    BENEVOLENT: {
        name: 'Benevolent',
        expansion: 0.4,
        militarism: 0.1,
        development: 0.9,
        aggression: 0.1,
        retreatThreshold: 0.8,
        recklessness: 0.05,
    },
};

// Player colors
export const PLAYER_COLORS = [
    '#3388ff', // blue (human)
    '#ff4444', // red
    '#44bb44', // green
    '#ffaa00', // orange
    '#aa44ff', // purple
];

// Neutral city color
export const NEUTRAL_COLOR = '#999999';

// Investment sectors
export const INVEST_SECTOR = {
    DEFENSE: 'defense',
    KNOWLEDGE: 'knowledge',
    PUBLIC: 'public',
    ECONOMICS: 'economics',
};

// City satisfaction threshold for revolt
export const REVOLT_THRESHOLD = 20;

// Camera scroll speed in pixels per frame
export const SCROLL_SPEED = 8;
export const SCROLL_ZONE = 30; // pixels from edge to trigger scroll arrows

// City base tax per population unit per economics point
export const TAX_RATE_BASE = 0.01;

// City growth rate base
export const GROWTH_RATE_BASE = 0.02;

// ─── Technology System ───────────────────────────────────────────
// Knowledge is uncapped — grows indefinitely with investment.
// Tech tier is determined by knowledge level. Higher tiers unlock
// advanced weapons, city features, and combat bonuses.

export const TECH_TIERS = [
    { tier: 1,  name: 'Primitive',      minKnowledge: 0,    atkBonus: 0,   defBonus: 0,   econBonus: 0,    desc: 'Basic weapons and fortifications' },
    { tier: 2,  name: 'Ancient',        minKnowledge: 30,   atkBonus: 0.05, defBonus: 0.05, econBonus: 0.05, desc: 'Bronze weapons, stone walls' },
    { tier: 3,  name: 'Medieval',       minKnowledge: 60,   atkBonus: 0.10, defBonus: 0.10, econBonus: 0.10, desc: 'Steel weapons, castle fortifications, siege engines' },
    { tier: 4,  name: 'Renaissance',    minKnowledge: 100,  atkBonus: 0.15, defBonus: 0.15, econBonus: 0.15, desc: 'Gunpowder, cannons, early firearms' },
    { tier: 5,  name: 'Industrial',     minKnowledge: 175,  atkBonus: 0.25, defBonus: 0.20, econBonus: 0.25, desc: 'Factories, railways, rifled artillery, ironclads' },
    { tier: 6,  name: 'Modern',         minKnowledge: 275,  atkBonus: 0.35, defBonus: 0.30, econBonus: 0.35, desc: 'Tanks, aircraft, radar, modern infantry' },
    { tier: 7,  name: 'Atomic',         minKnowledge: 400,  atkBonus: 0.50, defBonus: 0.40, econBonus: 0.45, desc: 'Nuclear capability, jet fighters, guided missiles' },
    { tier: 8,  name: 'Information',    minKnowledge: 550,  atkBonus: 0.65, defBonus: 0.55, econBonus: 0.55, desc: 'Stealth, drones, cyber warfare, precision weapons' },
    { tier: 9,  name: 'Advanced',       minKnowledge: 700,  atkBonus: 0.80, defBonus: 0.70, econBonus: 0.65, desc: 'Energy weapons, powered armor, AI targeting' },
    { tier: 10, name: 'Future',         minKnowledge: 850,  atkBonus: 1.00, defBonus: 0.85, econBonus: 0.75, desc: 'Laser weapons, shield generators, orbital platforms' },
    { tier: 11, name: 'Space Age',      minKnowledge: 1000, atkBonus: 1.25, defBonus: 1.00, econBonus: 0.90, desc: 'Spacecraft, orbital strikes, planetary defense grid' },
    { tier: 12, name: 'Transcendent',   minKnowledge: 1250, atkBonus: 1.50, defBonus: 1.25, econBonus: 1.00, desc: 'Antimatter weapons, warp tech, post-scarcity economy' },
];

// Get tech tier for a given knowledge level
export function getTechTier(knowledge) {
    let current = TECH_TIERS[0];
    for (const tier of TECH_TIERS) {
        if (knowledge >= tier.minKnowledge) {
            current = tier;
        } else {
            break;
        }
    }
    return current;
}

// Get the next tech tier (or null if at max)
export function getNextTechTier(knowledge) {
    for (const tier of TECH_TIERS) {
        if (knowledge < tier.minKnowledge) {
            return tier;
        }
    }
    return null;
}
