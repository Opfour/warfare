// Game constants and balance values
export const HEX_SIZE = 28; // pixels from center to corner
export const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
export const HEX_HEIGHT = 2 * HEX_SIZE;

// Default map settings
export const DEFAULT_MAP_WIDTH = 40;
export const DEFAULT_MAP_HEIGHT = 30;
export const DEFAULT_CITY_COUNT = 50;
export const DEFAULT_LAND_RATIO = 0.45;

// Terrain types
export const TERRAIN = {
    OCEAN: 'ocean',
    PLAINS: 'plains',
    HILLS: 'hills',
    FOREST: 'forest',
    MOUNTAIN: 'mountain',
};

// Terrain colors
export const TERRAIN_COLORS = {
    [TERRAIN.OCEAN]: '#2266aa',
    [TERRAIN.PLAINS]: '#4a8c3f',
    [TERRAIN.HILLS]: '#6b8f3a',
    [TERRAIN.FOREST]: '#2d6e2d',
    [TERRAIN.MOUNTAIN]: '#8a8a7a',
};

// Terrain movement cost (1 = normal, higher = slower)
export const TERRAIN_MOVE_COST = {
    [TERRAIN.OCEAN]: Infinity,
    [TERRAIN.PLAINS]: 1,
    [TERRAIN.HILLS]: 2,
    [TERRAIN.FOREST]: 2,
    [TERRAIN.MOUNTAIN]: 3,
};

// Terrain defense bonus multiplier
export const TERRAIN_DEFENSE_BONUS = {
    [TERRAIN.OCEAN]: 0,
    [TERRAIN.PLAINS]: 1.0,
    [TERRAIN.HILLS]: 1.3,
    [TERRAIN.FOREST]: 1.2,
    [TERRAIN.MOUNTAIN]: 1.5,
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

// Unit stats: movement, attack, defense, max troops, recruitment cost
export const UNIT_STATS = {
    [UNIT_TYPE.COMMANDER]:  { move: 0, attack: 2,  defense: 10, maxTroops: 1,    cost: 0,    symbol: '★', name: 'Commander' },
    [UNIT_TYPE.SCOUT]:      { move: 6, attack: 1,  defense: 1,  maxTroops: 2,    cost: 50,   symbol: '◈', name: 'Scout' },
    [UNIT_TYPE.RAIDER]:     { move: 5, attack: 6,  defense: 3,  maxTroops: 1000, cost: 200,  symbol: '⚔', name: 'Raider' },
    [UNIT_TYPE.ARMY_CORPS]: { move: 3, attack: 7,  defense: 7,  maxTroops: 5000, cost: 500,  symbol: '⛊', name: 'Army Corps' },
    [UNIT_TYPE.ARTILLERY]:  { move: 1, attack: 3,  defense: 9,  maxTroops: 500,  cost: 400,  symbol: '⊕', name: 'Artillery' },
    [UNIT_TYPE.MECHANIZED]: { move: 1, attack: 9,  defense: 3,  maxTroops: 500,  cost: 450,  symbol: '⊛', name: 'Mechanized' },
    [UNIT_TYPE.DEFENDER]:   { move: 0, attack: 2,  defense: 8,  maxTroops: 2000, cost: 150,  symbol: '⛨', name: 'Defender' },
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
