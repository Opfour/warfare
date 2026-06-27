// Save/Load module — serialize game state to localStorage with
// Map→Array conversion for tiles, regions, and sectors.
//
// Storage layout:
//   warfare_save_index  → JSON array of { id, turn, timestamp, difficulty, phase }
//   warfare_save_<id>   → JSON blob of the full serialized game state
//
// The tile Map is stored as an array of [key, tileData] entries where
// tileData.cityId replaces the live city object reference.  On load,
// city references are re-linked by id.

import { Player } from './player.js';
import { FogOfWar, FOG_DIFFICULTY } from './fog.js';

const SAVE_PREFIX = 'warfare_save_';
const SAVE_INDEX_KEY = 'warfare_save_index';
const SAVE_VERSION = 1;

// ─── Serialization ──────────────────────────────────────────────

/**
 * Serialize the full game state into a plain-JSON-safe object.
 * Converts Map/Set structures to arrays and replaces live object
 * references (tile.city) with id references.
 */
export function serializeGameState(gameState) {
    const map = gameState.map;
    if (!map) return null;

    // Tiles: Map<string, tile> → Array<[key, tileData]>
    // tile.city (live ref) → tileData.cityId (number|null)
    const tilesArray = [];
    for (const [key, tile] of map.tiles) {
        tilesArray.push([key, {
            q: tile.q,
            r: tile.r,
            terrain: tile.terrain,
            regionId: tile.regionId,
            sectorId: tile.sectorId,
            cityId: tile.city ? tile.city.id : null,
        }]);
    }

    // Regions: each region.tiles is a Set<string> → Array<string>
    const regionsArray = (map.regions || []).map(region => ({
        id: region.id,
        seedQ: region.seedQ,
        seedR: region.seedR,
        biome: region.biome,
        tiles: Array.from(region.tiles),
    }));

    // Sectors: each sector.tiles is a Set<string> → Array<string>
    const sectorsArray = (map.sectors || []).map(sector => ({
        id: sector.id,
        col: sector.col,
        row: sector.row,
        owner: sector.owner,
        cityIds: sector.cityIds,
        tiles: Array.from(sector.tiles),
        adjacentIds: sector.adjacentIds,
    }));

    // Cities are plain objects — shallow clone
    const citiesArray = (map.cities || []).map(city => ({ ...city }));

    // Units are plain objects — shallow clone
    // Excludes the live moveTarget object? No, keep it — it's { q, r }
    const unitsArray = (gameState.units || []).map(unit => ({ ...unit }));

    // Players are Player class instances — extract properties
    const playersArray = (gameState.players || []).map(player => ({
        id: player.id,
        name: player.name,
        isHuman: player.isHuman,
        personality: player.personality,
        treasury: player.treasury,
        homeCityId: player.homeCityId,
        alive: player.alive,
        color: player.color,
        _score: player._score,
        _scoreLog: player._scoreLog || [],
    }));

    return {
        version: SAVE_VERSION,
        timestamp: Date.now(),
        turn: gameState.turn,
        phase: gameState.phase,
        difficulty: gameState.difficulty,
        eventsEnabled: gameState.eventsEnabled,
        currentPlayer: gameState.currentPlayer,
        winnerId: gameState.winner ? gameState.winner.id : null,
        map: {
            tiles: tilesArray,
            cities: citiesArray,
            regions: regionsArray,
            sectors: sectorsArray,
            width: map.width,
            height: map.height,
        },
        units: unitsArray,
        players: playersArray,
    };
}

// ─── Deserialization ────────────────────────────────────────────

/**
 * Deserialize a saved game-state object back into live game state.
 * Reconstructs Map/Set structures and re-links tile.city references.
 * Returns a plain object that can be merged into the global gameState.
 */
export function deserializeGameState(data) {
    // Reconstruct tiles Map
    const tiles = new Map();
    for (const [key, tileData] of data.map.tiles) {
        tiles.set(key, tileData);
    }

    // Reconstruct cities (plain objects) and build id→city lookup
    const cities = data.map.cities.map(cityData => ({ ...cityData }));
    const cityById = new Map();
    for (const city of cities) {
        cityById.set(city.id, city);
    }

    // Re-link tile.city references from cityId
    for (const [, tile] of tiles) {
        if (tile.cityId != null) {
            tile.city = cityById.get(tile.cityId) || null;
        } else {
            tile.city = null;
        }
    }

    // Reconstruct regions (tiles: Array → Set)
    const regions = (data.map.regions || []).map(regionData => ({
        id: regionData.id,
        seedQ: regionData.seedQ,
        seedR: regionData.seedR,
        biome: regionData.biome,
        tiles: new Set(regionData.tiles),
    }));

    // Reconstruct sectors (tiles: Array → Set)
    const sectors = (data.map.sectors || []).map(sectorData => ({
        id: sectorData.id,
        col: sectorData.col,
        row: sectorData.row,
        owner: sectorData.owner,
        cityIds: sectorData.cityIds || [],
        tiles: new Set(sectorData.tiles || []),
        adjacentIds: sectorData.adjacentIds || [],
    }));

    const map = {
        tiles,
        cities,
        regions,
        sectors,
        width: data.map.width,
        height: data.map.height,
    };

    // Reconstruct units (plain objects)
    const units = (data.units || []).map(unitData => ({ ...unitData }));

    // Reconstruct Player instances
    const players = (data.players || []).map(playerData => {
        const player = new Player(
            playerData.id,
            playerData.name,
            playerData.isHuman,
            playerData.personality,
        );
        player.treasury = playerData.treasury;
        player.homeCityId = playerData.homeCityId;
        player.alive = playerData.alive;
        player.color = playerData.color;
        player._score = playerData._score || 0;
        player._scoreLog = playerData._scoreLog || [];
        return player;
    });

    // Resolve winner reference
    let winner = null;
    if (data.winnerId != null) {
        winner = players.find(p => p.id === data.winnerId) || null;
    }

    return {
        map,
        units,
        players,
        turn: data.turn,
        phase: data.phase,
        difficulty: data.difficulty,
        eventsEnabled: data.eventsEnabled,
        currentPlayer: data.currentPlayer || 0,
        winner,
    };
}

// ─── Save / Load API ────────────────────────────────────────────

/**
 * Save current game state to a new localStorage slot.
 * Returns { success, id, timestamp } or { success: false, error }.
 */
export function saveGame(gameState) {
    const data = serializeGameState(gameState);
    if (!data) return { success: false, error: 'No map in game state' };

    const id = String(data.timestamp);
    const key = SAVE_PREFIX + id;

    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        return { success: false, error: `localStorage write failed: ${e.message}` };
    }

    // Update the save index
    const entry = {
        id,
        turn: data.turn,
        timestamp: data.timestamp,
        difficulty: data.difficulty || 'NORMAL',
        phase: data.phase,
    };

    const index = getIndex();
    // Remove any existing entry with the same id (shouldn't happen, but clean)
    const filtered = index.filter(e => e.id !== id);
    filtered.push(entry);
    filtered.sort((a, b) => b.timestamp - a.timestamp);
    saveIndex(filtered);

    return { success: true, id, timestamp: data.timestamp };
}

/**
 * Load a saved game state by slot id.
 * Returns the deserialized game-state object or null on failure.
 */
export function loadGame(slotId) {
    const key = SAVE_PREFIX + slotId;
    let raw;
    try {
        raw = localStorage.getItem(key);
    } catch {
        return null;
    }
    if (!raw) return null;

    let data;
    try {
        data = JSON.parse(raw);
    } catch {
        return null;
    }

    return deserializeGameState(data);
}

/**
 * List all saved games from localStorage, newest first.
 * Returns array of { id, turn, timestamp, difficulty, phase }.
 */
export function listSavedGames() {
    return getIndex();
}

/**
 * Delete a saved game by slot id.
 */
export function deleteSavedGame(slotId) {
    try {
        localStorage.removeItem(SAVE_PREFIX + slotId);
    } catch {
        // ignore
    }
    const index = getIndex().filter(e => e.id !== slotId);
    saveIndex(index);
}

// ─── Index helpers ──────────────────────────────────────────────

function getIndex() {
    try {
        const raw = localStorage.getItem(SAVE_INDEX_KEY);
        if (!raw) return [];
        const data = JSON.parse(raw);
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

function saveIndex(index) {
    try {
        localStorage.setItem(SAVE_INDEX_KEY, JSON.stringify(index));
    } catch {
        // localStorage unavailable — silently ignore
    }
}