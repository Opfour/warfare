// Fog of War module — spotted vs detailed visibility, difficulty-based ranges,
// tech modifiers, explored hex tracking, and rendering support.
//
// The original Warfare (1995) had two visibility tiers:
//   SPOTTED  — you can see that a unit is there and identify its leader/faction
//   DETAILED — you can see full stats (troop count, type, attack, defense)
//
// Difficulty controls how far units can see:
//   EASY   — all visible (no fog)
//   NORMAL — standard ranges
//   HARD   — reduced ranges (must be very near to see detail)
//
// Tech of the hiding unit vs the spotting unit matters: higher tech hiders
// are harder to spot; higher tech spotters see farther.
//
// AI always has full visibility (no fog for AI players).

import { UNIT_TYPE, UNIT_STATS, TECH_TIERS, getTechTier } from './config.js';
import { hexesInRange, hexKey, hexDistance } from './hex.js';

// ─── Visibility States ───────────────────────────────────────────

export const FOG_STATE = {
    HIDDEN: 0,      // Never explored — darkest overlay
    EXPLORED: 1,    // Explored but not currently visible — dimmer overlay
    VISIBLE: 2,     // Currently visible — full clarity
};

export const VIS_DETAIL = {
    NONE: 0,        // Enemy unit not visible at all
    SPOTTED: 1,     // Unit seen but only faction/leader identified (no stats)
    DETAILED: 2,    // Full stats visible (troops, type, attack, defense)
};

// ─── Difficulty Levels ───────────────────────────────────────────

export const FOG_DIFFICULTY = {
    EASY:   'easy',
    NORMAL: 'normal',
    HARD:   'hard',
};

// Base spotting ranges (in hexes) per unit type — how far a friendly unit
// can see around it. Scouts see farthest; defenders are garrison-bound.
const BASE_SPOT_RANGE = {
    [UNIT_TYPE.SCOUT]:      5,
    [UNIT_TYPE.COMMANDER]:  3,
    [UNIT_TYPE.RAIDER]:     3,
    [UNIT_TYPE.ARMY_CORPS]: 3,
    [UNIT_TYPE.ARTILLERY]:  3,
    [UNIT_TYPE.MECHANIZED]: 3,
    [UNIT_TYPE.DEFENDER]:   2,
};

// Range multiplier by difficulty
const DIFFICULTY_MULT = {
    [FOG_DIFFICULTY.EASY]:   Infinity,  // Everything visible
    [FOG_DIFFICULTY.NORMAL]: 1.0,
    [FOG_DIFFICULTY.HARD]:   0.5,      // Must be very near
};

// Radius at which detailed (full stats) visibility kicks in, as a fraction
// of the full spotting range. E.g. 0.4 means the inner 40% of the range
// yields detailed visibility, the outer 60% yields spotted only.
const DETAILED_FRACTION = 0.4;

// Tech modifier: each tech tier difference shifts the effective range.
// If spotter tech > hider tech, spotter sees farther.  If hider tech is
// higher, the range shrinks.  0.5 hexes per tier difference.
const TECH_MOD_PER_TIER = 0.5;

// ─── FogOfWar Class ──────────────────────────────────────────────

export class FogOfWar {
    constructor(difficulty = FOG_DIFFICULTY.NORMAL) {
        this.difficulty = difficulty;
        this.enabled = true;

        // Set of hex keys ("q,r") that the human player has ever seen
        this.explored = new Set();

        // Set of hex keys currently visible this turn
        this.visibleHexes = new Set();

        // Map: unitId -> VIS_DETAIL level for currently visible enemies
        this.unitDetails = new Map();

        // Cached per-frame: key -> { state, detail } for quick renderer access
        this._cache = null;
    }

    /**
     * Reset fog state for a new game or new map.
     * @param {string} difficulty — one of FOG_DIFFICULTY
     */
    reset(difficulty = this.difficulty) {
        this.difficulty = difficulty;
        this.explored.clear();
        this.visibleHexes.clear();
        this.unitDetails.clear();
        this._cache = null;
    }

    /**
     * Toggle fog on/off. When off, everything is fully visible.
     */
    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    /**
     * Main recalculation: scan all human player's units and cities,
     * determine which hexes are visible, explored, and which enemy
     * units are spotted vs detailed.
     *
     * Should be called once per turn (or after each human unit moves
     * if real-time fog is desired — but per-turn is the classic behavior).
     *
     * @param {object} gameState — the global game state
     */
    updateVisibility(gameState) {
        // If fog is disabled or difficulty is EASY, everything is visible
        if (!this.enabled || this.difficulty === FOG_DIFFICULTY.EASY) {
            this._setAllVisible(gameState);
            return;
        }

        this.visibleHexes.clear();
        this.unitDetails.clear();

        const { units, map, players } = gameState;
        if (!map || !units) return;

        const humanPlayerId = 0; // Player 0 is always the human

        // ── Gather spotters ──
        // Every human unit and every human-owned city acts as a spotter.
        const spotters = []; // { q, r, type, techTier, range }

        for (const unit of units) {
            if (unit.owner !== humanPlayerId) continue;
            if (unit.troops <= 0) continue;

            const baseRange = BASE_SPOT_RANGE[unit.type] || 2;
            const techTier = unit.techTier || 1;
            spotters.push({
                q: unit.q,
                r: unit.r,
                unitType: unit.type,
                techTier,
                baseRange,
            });
        }

        // Cities also provide spotting (like a garrisoned defender)
        for (const city of map.cities) {
            if (city.owner !== humanPlayerId) continue;
            const techTier = getTechTier(city.knowledge || 0).tier;
            spotters.push({
                q: city.q,
                r: city.r,
                unitType: UNIT_TYPE.DEFENDER, // City spotting = defender-level
                techTier,
                baseRange: 2,
            });
        }

        // ── Gather potential hides (enemy units) ──
        const hiders = [];
        for (const unit of units) {
            if (unit.owner === humanPlayerId) continue;
            if (unit.troops <= 0) continue;

            hiders.push({
                unit,
                q: unit.q,
                r: unit.r,
                techTier: unit.techTier || 1,
            });
        }

        // ── Calculate visible hexes ──
        const diffMult = DIFFICULTY_MULT[this.difficulty] || 1.0;

        for (const spotter of spotters) {
            const range = Math.max(1, Math.ceil(spotter.baseRange * diffMult));
            const hexes = hexesInRange(spotter.q, spotter.r, range);
            for (const h of hexes) {
                const key = hexKey(h.q, h.r);
                this.visibleHexes.add(key);
                this.explored.add(key);
            }
        }

        // ── Determine enemy unit visibility detail ──
        // For each enemy unit, check if any spotter can see it.
        for (const hider of hiders) {
            let bestDetail = VIS_DETAIL.NONE;

            for (const spotter of spotters) {
                const dist = hexDistance(
                    { q: spotter.q, r: spotter.r },
                    { q: hider.q, r: hider.r }
                );

                // Effective range with tech modifier
                const techDiff = spotter.techTier - hider.techTier;
                const techMod = techDiff * TECH_MOD_PER_TIER;
                const effectiveRange = Math.max(
                    1,
                    Math.ceil((spotter.baseRange + techMod) * diffMult)
                );

                if (dist <= effectiveRange) {
                    // Within spotting range — at least SPOTTED
                    const detailedThreshold = Math.max(
                        1,
                        Math.floor(effectiveRange * DETAILED_FRACTION)
                    );

                    if (dist <= detailedThreshold) {
                        bestDetail = VIS_DETAIL.DETAILED;
                        break; // Can't do better than detailed
                    } else if (bestDetail < VIS_DETAIL.SPOTTED) {
                        bestDetail = VIS_DETAIL.SPOTTED;
                    }
                }
            }

            if (bestDetail > VIS_DETAIL.NONE) {
                this.unitDetails.set(hider.unit.id, bestDetail);
            }
        }

        // Invalidate cache
        this._cache = null;
    }

    /**
     * Fallback: mark everything as visible and explored (fog off / easy).
     */
    _setAllVisible(gameState) {
        this.visibleHexes.clear();
        this.unitDetails.clear();

        if (gameState.map && gameState.map.tiles) {
            for (const [key] of gameState.map.tiles) {
                this.visibleHexes.add(key);
                this.explored.add(key);
            }
        }

        // All enemy units get detailed visibility
        if (gameState.units) {
            for (const unit of gameState.units) {
                if (unit.owner !== 0 && unit.troops > 0) {
                    this.unitDetails.set(unit.id, VIS_DETAIL.DETAILED);
                }
            }
        }

        this._cache = null;
    }

    // ─── Query helpers ────────────────────────────────────────────

    /**
     * Get the fog state for a hex.
     * @param {number} q
     * @param {number} r
     * @returns {number} FOG_STATE value
     */
    getHexState(q, r) {
        if (!this.enabled || this.difficulty === FOG_DIFFICULTY.EASY) {
            return FOG_STATE.VISIBLE;
        }

        const key = hexKey(q, r);
        if (this.visibleHexes.has(key)) return FOG_STATE.VISIBLE;
        if (this.explored.has(key)) return FOG_STATE.EXPLORED;
        return FOG_STATE.HIDDEN;
    }

    /**
     * Get the detail level for an enemy unit.
     * @param {object} unit
     * @returns {number} VIS_DETAIL value
     */
    getUnitDetail(unit) {
        if (!this.enabled || this.difficulty === FOG_DIFFICULTY.EASY) {
            return VIS_DETAIL.DETAILED;
        }

        // Own units are always fully visible
        if (unit.owner === 0) return VIS_DETAIL.DETAILED;

        return this.unitDetails.get(unit.id) || VIS_DETAIL.NONE;
    }

    /**
     * Check if a hex is currently visible (not just explored).
     */
    isVisible(q, r) {
        if (!this.enabled || this.difficulty === FOG_DIFFICULTY.EASY) return true;
        return this.visibleHexes.has(hexKey(q, r));
    }

    /**
     * Check if a hex has been explored (seen at some point).
     */
    isExplored(q, r) {
        if (!this.enabled || this.difficulty === FOG_DIFFICULTY.EASY) return true;
        return this.explored.has(hexKey(q, r));
    }

    /**
     * Check if an enemy unit should be rendered at all.
     */
    isUnitVisible(unit) {
        if (unit.owner === 0) return true; // Own units always visible
        return this.getUnitDetail(unit) > VIS_DETAIL.NONE;
    }

    // ─── AI helper ────────────────────────────────────────────────

    /**
     * AI always has full visibility. This returns true so ai.js can
     * skip fog checks entirely, but it's here for interface completeness.
     */
    aiCanSee(unit) {
        return true;
    }
}