// Town Events system — random events that affect ruled cities each turn.
//
// Implements the rubber-banding mechanism from the original Warfare (1995):
// leaders who are winning (above-average towns + sectors) get more negative
// events; leaders who are losing get more positive events.
//
// Events modify city attributes: population, defense, knowledge/tech,
// economics, satisfaction, and garrison. Each event has a type (positive
// or negative), a name, a description, and magnitude values.

import { EVENT_CHANCE, TOWN_EVENTS } from './config.js';

// ─── Standings / Rubber-banding ──────────────────────────────────

/**
 * Calculate each player's "standing" — how many cities + controlled
 * sectors they have relative to the average.
 * Returns a Map: playerId -> standing score (>1 winning, <1 losing).
 */
export function calculateStandings(players, cities, regions) {
    const alivePlayers = players.filter(p => p.alive);
    if (alivePlayers.length === 0) return new Map();

    // Count cities per player
    const cityCounts = new Map();
    for (const player of alivePlayers) {
        cityCounts.set(player.id, 0);
    }
    for (const city of cities) {
        if (city.owner !== null && cityCounts.has(city.owner)) {
            cityCounts.set(city.owner, cityCounts.get(city.owner) + 1);
        }
    }

    // Count controlled sectors (a sector is controlled when ALL its cities
    // are owned by one player)
    const sectorCounts = new Map();
    for (const player of alivePlayers) {
        sectorCounts.set(player.id, 0);
    }

    if (regions && regions.length > 0) {
        for (const region of regions) {
            const regionCities = cities.filter(c => c.regionId === region.id);
            if (regionCities.length === 0) continue;

            const owners = new Set(regionCities.map(c => c.owner));
            // Exactly one non-null owner? That player controls the sector.
            const nonNullOwners = [...owners].filter(o => o !== null);
            if (nonNullOwners.length === 1) {
                const owner = nonNullOwners[0];
                if (sectorCounts.has(owner)) {
                    sectorCounts.set(owner, sectorCounts.get(owner) + 1);
                }
            }
        }
    }

    // Total holdings = cities + controlled sectors
    const totals = new Map();
    for (const player of alivePlayers) {
        totals.set(player.id, cityCounts.get(player.id) + sectorCounts.get(player.id));
    }

    // Average holdings
    const avg = alivePlayers.reduce((sum, p) => sum + totals.get(p.id), 0) / alivePlayers.length;

    // Standing ratio: >1 = winning, <1 = losing, ==1 = even
    const standings = new Map();
    for (const player of alivePlayers) {
        const total = totals.get(player.id);
        standings.set(player.id, avg > 0 ? total / avg : 1);
    }

    return standings;
}

/**
 * Determine whether a given player should get a positive or negative event,
 * based on their standing relative to other players.
 *
 * Winners (standing > 1): 60% chance negative, 40% positive.
 * Losers (standing < 1): 60% chance positive, 40% negative.
 * Even players: 50/50.
 */
export function rollEventPolarity(playerId, standings) {
    const standing = standings.get(playerId) ?? 1;

    if (standing > 1.01) {
        // Winning — bias negative
        return Math.random() < 0.6 ? 'negative' : 'positive';
    } else if (standing < 0.99) {
        // Losing — bias positive
        return Math.random() < 0.6 ? 'positive' : 'negative';
    }
    // Even — fair coin
    return Math.random() < 0.5 ? 'negative' : 'positive';
}

// ─── Event Processing ───────────────────────────────────────────

/**
 * Process town events for all owned cities across all alive players.
 * Should be called at the start of each turn, after AI movement but before
 * tax collection.
 *
 * Returns an array of event log objects:
 *   { type, polarity, cityName, cityId, owner, eventName, message, effects }
 */
export function processTownEvents(gameState) {
    // Check if events are disabled
    if (gameState.eventsEnabled === false) return [];

    const { players, map } = gameState;
    const cities = map.cities;
    const regions = map.regions || [];

    const standings = calculateStandings(players, cities, regions);
    const eventLog = [];

    for (const city of cities) {
        if (city.owner === null) continue; // neutral cities don't get events

        // Roll for event occurrence
        if (Math.random() > EVENT_CHANCE) continue;

        // Determine polarity via rubber-banding
        const polarity = rollEventPolarity(city.owner, standings);

        // Pick a random event of that polarity
        const candidates = TOWN_EVENTS.filter(e => e.polarity === polarity);
        if (candidates.length === 0) continue;
        const event = candidates[Math.floor(Math.random() * candidates.length)];

        // Apply effects and build description
        const effects = applyEventEffects(city, event);
        const message = formatEventMessage(city, event, effects);

        // Record event in city's history
        if (!city.eventHistory) city.eventHistory = [];
        city.eventHistory.unshift({
            turn: gameState.turn,
            name: event.name,
            polarity,
            message,
            effects,
        });
        // Keep only last 10 events
        if (city.eventHistory.length > 10) city.eventHistory.length = 10;

        eventLog.push({
            type: 'town_event',
            polarity,
            cityName: city.name,
            cityId: city.id,
            owner: city.owner,
            eventName: event.name,
            message,
            effects,
        });
    }

    return eventLog;
}

/**
 * Apply an event's effects to a city.
 * Returns an object describing the actual changes applied.
 */
function applyEventEffects(city, event) {
    const changes = {};

    for (const [stat, magnitude] of Object.entries(event.effects)) {
        const delta = typeof magnitude === 'function' ? magnitude(city) : magnitude;
        if (delta === 0) continue;

        switch (stat) {
            case 'population': {
                const loss = delta < 0;
                const change = loss
                    ? Math.max(0, Math.floor(city.population * Math.abs(delta)))
                    : Math.floor(delta);
                city.population = Math.max(0, city.population - change);
                if (loss) {
                    // "change" is the number of people lost
                    changes.population = -change;
                } else {
                    changes.population = change;
                }
                break;
            }
            case 'populationFlat': {
                city.population = Math.max(0, city.population + delta);
                changes.population = delta;
                break;
            }
            case 'defense': {
                city.defense = Math.max(0, city.defense + delta);
                changes.defense = delta;
                break;
            }
            case 'knowledge': {
                city.knowledge = Math.max(0, city.knowledge + delta);
                changes.knowledge = delta;
                break;
            }
            case 'economics': {
                city.economics = Math.max(0, city.economics + delta);
                changes.economics = delta;
                break;
            }
            case 'satisfaction': {
                city.satisfaction = Math.max(0, Math.min(100, city.satisfaction + delta));
                changes.satisfaction = delta;
                break;
            }
            case 'garrison': {
                const loss = delta < 0;
                const change = loss
                    ? Math.min(city.garrison, Math.floor(city.garrison * Math.abs(delta)))
                    : Math.floor(delta);
                city.garrison = Math.max(0, city.garrison + (loss ? -change : change));
                changes.garrison = loss ? -change : change;
                break;
            }
        }
    }

    return changes;
}

/**
 * Build a human-readable message for an event occurrence.
 */
function formatEventMessage(city, event, effects) {
    let msg = `${city.name}: ${event.name}.`;

    const parts = [];
    if (effects.population) {
        parts.push(`Pop ${effects.population > 0 ? '+' : ''}${effects.population.toLocaleString()}`);
    }
    if (effects.defense) {
        parts.push(`Def ${effects.defense > 0 ? '+' : ''}${effects.defense}`);
    }
    if (effects.knowledge) {
        parts.push(`Tech ${effects.knowledge > 0 ? '+' : ''}${effects.knowledge}`);
    }
    if (effects.economics) {
        parts.push(`Econ ${effects.economics > 0 ? '+' : ''}${effects.economics}`);
    }
    if (effects.satisfaction) {
        parts.push(`Sat ${effects.satisfaction > 0 ? '+' : ''}${effects.satisfaction}`);
    }
    if (effects.garrison) {
        parts.push(`Garrison ${effects.garrison > 0 ? '+' : ''}${effects.garrison}`);
    }

    if (parts.length > 0) {
        msg += ` (${parts.join(', ')})`;
    }

    if (event.description) {
        msg += ` ${event.description}`;
    }

    return msg;
}