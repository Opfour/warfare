// Combat resolution system

import { UNIT_TYPE, UNIT_STATS, TERRAIN_DEFENSE_BONUS, COMBAT_MATCHUP } from './config.js';
import { getOrderDefenseBonus, getOrderAttackBonus } from './orders.js';
import { hexKey } from './hex.js';

// Calculate effective attack strength of a unit against a specific defender type
export function calculateAttackStrength(attacker, terrain, defenderType) {
    const stats = UNIT_STATS[attacker.type];
    const equipAtk = attacker.equipBonusAtk || 0;
    let strength = attacker.troops * (stats.attack + equipAtk);

    // Order bonus
    strength *= getOrderAttackBonus(attacker);

    // Unit-type matchup bonus
    const matchup = COMBAT_MATCHUP[attacker.type];
    if (matchup && defenderType && matchup[defenderType] !== undefined) {
        strength *= matchup[defenderType];
    }

    return strength;
}

// Calculate effective defense strength of a unit
export function calculateDefenseStrength(defender, terrain, inCity, attackerType) {
    const stats = UNIT_STATS[defender.type];
    const equipDef = defender.equipBonusDef || 0;
    let strength = defender.troops * (stats.defense + equipDef);

    // Order bonus
    strength *= getOrderDefenseBonus(defender);

    // Terrain bonus
    const terrainBonus = TERRAIN_DEFENSE_BONUS[terrain] || 1.0;
    strength *= terrainBonus;

    // City fortification bonus
    if (inCity) {
        let cityBonus = 1.5;

        // Mechanized attackers negate city fortification bonus
        if (attackerType === UNIT_TYPE.MECHANIZED) {
            cityBonus = 1.0;
        }

        // Artillery gets extra city defense bonus
        if (defender.type === UNIT_TYPE.ARTILLERY) {
            cityBonus *= 1.3;
        }

        // Defender units get extra city bonus (dug in)
        if (defender.type === UNIT_TYPE.DEFENDER) {
            cityBonus *= 1.4;
        }

        strength *= cityBonus;
    }

    return strength;
}

// Resolve a single combat round
export function resolveCombatRound(attacker, defender, terrain, inCity) {
    const atkStrength = calculateAttackStrength(attacker, terrain, defender.type);
    const defStrength = calculateDefenseStrength(defender, terrain, inCity, attacker.type);

    const total = atkStrength + defStrength;
    if (total === 0) return { attackerLoss: 0, defenderLoss: 0, attackerStrength: 0, defenderStrength: 0 };

    const atkRatio = atkStrength / total;
    const defRatio = defStrength / total;

    const baseCasualtyRate = 0.08;

    const attackerLoss = Math.max(1, Math.floor(attacker.troops * defRatio * baseCasualtyRate));
    const defenderLoss = Math.max(1, Math.floor(defender.troops * atkRatio * baseCasualtyRate));

    return { attackerLoss, defenderLoss, attackerStrength: atkStrength, defenderStrength: defStrength };
}

// Run one combat round and apply losses
export function runCombatRound(attacker, defender, gameMap) {
    const defKey = hexKey(defender.q, defender.r);
    const tile = gameMap.tiles.get(defKey);
    const terrain = tile ? tile.terrain : 'plains';
    const inCity = tile && tile.city !== null;

    const result = resolveCombatRound(attacker, defender, terrain, inCity);

    // Apply losses
    attacker.troops = Math.max(0, attacker.troops - result.attackerLoss);
    defender.troops = Math.max(0, defender.troops - result.defenderLoss);

    // Damage city garrison if defending in a city
    if (inCity && tile.city && tile.city.owner === defender.owner) {
        const garrisonDamage = Math.floor(result.defenderLoss * 0.3);
        tile.city.garrison = Math.max(0, tile.city.garrison - garrisonDamage);
    }

    return {
        ...result,
        attackerDead: attacker.troops <= 0,
        defenderDead: defender.troops <= 0,
        terrain,
        inCity,
    };
}

// Calculate how many troops can be captured from a defeated unit
// Returns { troops, equipment } — equipment is a gold value
export function calculateCapture(winner, loser) {
    const loserStats = UNIT_STATS[loser.type];
    const winnerStats = UNIT_STATS[winner.type];

    // Captured troops: 10-30% of the loser's original troops survive and can be absorbed
    const capturedTroops = Math.floor(loser.maxTroops * (0.1 + Math.random() * 0.2));

    // Captured equipment: value based on loser's unit cost
    const equipment = Math.floor(loserStats.cost * (0.2 + Math.random() * 0.3));

    // Equipment use bonus — depends on what type of unit was defeated
    // Heavier units yield better equipment bonuses
    let equipAtkBonus = 0, equipDefBonus = 0;
    if (loserStats.attack >= 7) equipAtkBonus = Math.ceil(loserStats.attack * 0.15);
    else if (loserStats.attack >= 4) equipAtkBonus = Math.ceil(loserStats.attack * 0.1);
    if (loserStats.defense >= 7) equipDefBonus = Math.ceil(loserStats.defense * 0.15);
    else if (loserStats.defense >= 4) equipDefBonus = Math.ceil(loserStats.defense * 0.1);
    // Always at least +1 to something
    if (equipAtkBonus === 0 && equipDefBonus === 0) equipAtkBonus = 1;

    // Can only absorb troops if same type or compatible
    const canAbsorb = winner.type === loser.type ||
        (winner.type === UNIT_TYPE.ARMY_CORPS); // army corps can absorb anyone

    return {
        troops: capturedTroops,
        canAbsorb,
        equipment,
        equipAtkBonus,
        equipDefBonus,
        loserType: loser.type,
        loserName: loserStats.name,
    };
}

// Apply captured equipment to a unit — permanent stat boost
export function equipCaptured(unit, atkBonus, defBonus) {
    if (!unit.equipBonusAtk) unit.equipBonusAtk = 0;
    if (!unit.equipBonusDef) unit.equipBonusDef = 0;
    unit.equipBonusAtk += atkBonus;
    unit.equipBonusDef += defBonus;
}

// Apply capture: absorb troops into winner
export function absorbCaptured(winner, capturedTroops) {
    const stats = UNIT_STATS[winner.type];
    const canTake = Math.min(capturedTroops, stats.maxTroops - winner.troops);
    winner.troops += canTake;
    winner.maxTroops = Math.max(winner.maxTroops, winner.troops);
    return canTake;
}

// Apply surrender: defender gives up, attacker captures everything
// Returns capture info
export function processSurrender(attacker, defender) {
    const capture = calculateCapture(attacker, defender);
    // Surrender yields more troops than defeat (50-70% survive)
    capture.troops = Math.floor(defender.troops * (0.5 + Math.random() * 0.2));
    defender.troops = 0;
    return capture;
}

// Apply truce: both sides stop fighting, no captures, both keep current troops
// Returns true if truce accepted (AI decides based on strength ratio)
export function offerTruce(attacker, defender, gameMap) {
    const defKey = hexKey(defender.q, defender.r);
    const tile = gameMap.tiles.get(defKey);
    const terrain = tile ? tile.terrain : 'plains';
    const inCity = tile && tile.city !== null;

    const atkStr = calculateAttackStrength(attacker, terrain, defender.type);
    const defStr = calculateDefenseStrength(defender, terrain, inCity, attacker.type);
    const total = atkStr + defStr;
    if (total === 0) return true;

    const defRatio = defStr / total;

    // AI accepts truce if they're losing or it's roughly even
    // Lower strength = more likely to accept
    if (defRatio < 0.55) {
        return true; // defender is losing, happy to stop
    }
    // Even fight — 50% chance
    if (defRatio < 0.65) {
        return Math.random() < 0.5;
    }
    // Defender is winning — unlikely to accept
    return Math.random() < 0.15;
}

// Check if capturing a city (attacker moves in, no defenders left)
export function tryCaptureCity(attacker, gameMap, units) {
    const key = hexKey(attacker.q, attacker.r);
    const tile = gameMap.tiles.get(key);
    if (!tile || !tile.city) return null;

    const city = tile.city;
    if (city.owner === attacker.owner) return null;

    const enemiesInCity = units.filter(u =>
        u.q === city.q && u.r === city.r && u.owner !== attacker.owner && u.troops > 0
    );

    if (enemiesInCity.length === 0) {
        const previousOwner = city.owner;
        city.owner = attacker.owner;
        city.garrison = Math.floor(city.garrison * 0.3);
        city.satisfaction = Math.max(10, city.satisfaction - 20);

        return { city, previousOwner };
    }

    return null;
}

// Check if a commander was killed (victory condition)
export function checkCommanderDeath(units) {
    const deadCommanders = [];
    const commanderUnits = units.filter(u => u.type === UNIT_TYPE.COMMANDER);

    for (const cmd of commanderUnits) {
        if (cmd.troops <= 0) {
            deadCommanders.push(cmd.owner);
        }
    }

    return deadCommanders;
}

// Get combat preview (estimated odds without actually fighting)
export function getCombatPreview(attacker, defender, gameMap) {
    const defKey = hexKey(defender.q, defender.r);
    const tile = gameMap.tiles.get(defKey);
    const terrain = tile ? tile.terrain : 'plains';
    const inCity = tile && tile.city !== null;

    const atkStrength = calculateAttackStrength(attacker, terrain, defender.type);
    const defStrength = calculateDefenseStrength(defender, terrain, inCity, attacker.type);
    const total = atkStrength + defStrength;

    const attackerOdds = total > 0 ? Math.round((atkStrength / total) * 100) : 50;

    // Matchup info
    const matchup = COMBAT_MATCHUP[attacker.type];
    const matchupMult = matchup ? (matchup[defender.type] || 1.0) : 1.0;
    let matchupText;
    if (matchupMult >= 1.5) matchupText = 'Strong advantage vs this unit type';
    else if (matchupMult >= 1.2) matchupText = 'Slight advantage vs this unit type';
    else if (matchupMult >= 0.8) matchupText = 'Neutral matchup';
    else if (matchupMult >= 0.5) matchupText = 'Disadvantaged vs this unit type';
    else matchupText = 'Severe disadvantage vs this unit type';

    let outlook;
    if (attackerOdds >= 70) outlook = 'Overwhelming advantage';
    else if (attackerOdds >= 55) outlook = 'Favorable odds';
    else if (attackerOdds >= 45) outlook = 'Even fight';
    else if (attackerOdds >= 30) outlook = 'Unfavorable odds';
    else outlook = 'Desperate attack';

    return {
        attackerStrength: Math.round(atkStrength),
        defenderStrength: Math.round(defStrength),
        attackerOdds,
        defenderOdds: 100 - attackerOdds,
        outlook,
        matchupText,
        matchupMult,
    };
}
