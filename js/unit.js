// Unit creation and management

import { UNIT_TYPE, UNIT_STATS, getTechTier } from './config.js';

let nextUnitId = 0;

export function resetUnitIds() {
    nextUnitId = 0;
}

export function createUnit(type, owner, city) {
    const stats = UNIT_STATS[type];
    const id = nextUnitId++;

    // Raider effectiveness scales with origin city's knowledge and economics
    let troopMultiplier = 1;
    if (type === UNIT_TYPE.RAIDER && city) {
        troopMultiplier = 0.5 + (city.knowledge + city.economics) / 200;
    }

    const troops = Math.floor(stats.maxTroops * troopMultiplier);

    // Tech bonus from recruiting city's knowledge level
    const tier = getTechTier(city.knowledge || 0);
    const techAtkBonus = Math.round(stats.attack * tier.atkBonus * 10) / 10;
    const techDefBonus = Math.round(stats.defense * tier.defBonus * 10) / 10;

    return {
        id,
        type,
        owner,
        q: city.q,
        r: city.r,
        troops,
        maxTroops: troops,
        movesRemaining: stats.move,
        orders: 'hold',
        originCityId: city.id,
        // Tech bonuses baked in at recruitment (stacks with captured equipment)
        equipBonusAtk: techAtkBonus,
        equipBonusDef: techDefBonus,
        techTier: tier.tier,
        techName: tier.name,
    };
}

// Reset movement for all units belonging to a player
export function resetMovement(units, playerId) {
    for (const unit of units) {
        if (unit.owner === playerId) {
            const stats = UNIT_STATS[unit.type];
            unit.movesRemaining = stats.move;
        }
    }
}

// Get available unit types for recruitment at a city
export function getRecruitableUnits(city, treasury) {
    const available = [];
    const types = [
        UNIT_TYPE.SCOUT,
        UNIT_TYPE.RAIDER,
        UNIT_TYPE.ARMY_CORPS,
        UNIT_TYPE.ARTILLERY,
        UNIT_TYPE.MECHANIZED,
        UNIT_TYPE.DEFENDER,
    ];

    for (const type of types) {
        const stats = UNIT_STATS[type];
        // Need enough money and population for recruitment
        const minPop = type === UNIT_TYPE.SCOUT ? 50 : stats.maxTroops * 0.5;
        if (treasury >= stats.cost && city.population >= minPop) {
            available.push({
                type,
                name: stats.name,
                cost: stats.cost,
                symbol: stats.symbol,
                move: stats.move,
                attack: stats.attack,
                defense: stats.defense,
            });
        }
    }

    return available;
}

// Recruit a unit at a city — deducts cost and conscripts from population
export function recruitUnit(type, owner, city, playerObj) {
    const stats = UNIT_STATS[type];

    playerObj.treasury -= stats.cost;

    // Conscript troops from population
    const conscripted = Math.min(city.population * 0.1, stats.maxTroops * 0.3);
    city.population = Math.max(100, Math.floor(city.population - conscripted));

    return createUnit(type, owner, city);
}

// Remove a destroyed unit from the units array
export function removeUnit(units, unitId) {
    const idx = units.findIndex(u => u.id === unitId);
    if (idx !== -1) {
        units.splice(idx, 1);
    }
}

// Find all units at a given hex
export function unitsAtHex(units, q, r) {
    return units.filter(u => u.q === q && u.r === r);
}

// Find units at hex for a specific owner
export function playerUnitsAtHex(units, q, r, owner) {
    return units.filter(u => u.q === q && u.r === r && u.owner === owner);
}

// Find enemy units at a hex
export function enemyUnitsAtHex(units, q, r, owner) {
    return units.filter(u => u.q === q && u.r === r && u.owner !== owner);
}
