// AI decision engine with personality-driven behavior

import { UNIT_TYPE, UNIT_STATS, AI_PERSONALITY, getMoveCost } from './config.js';
import { hexDistance, hexNeighbors, hexKey } from './hex.js';
import { createUnit, getRecruitableUnits } from './unit.js';
import { runCombatRound, tryCaptureCity, getCombatPreview } from './combat.js';
import { setInvestment } from './investment.js';

export class AI {
    constructor(player, personality) {
        this.player = player;
        this.p = personality; // personality weights
    }

    // Execute a full AI turn
    executeTurn(gameState) {
        const { map, units } = gameState;
        const cities = map.cities;
        const myCities = cities.filter(c => c.owner === this.player.id);
        const myUnits = units.filter(u => u.owner === this.player.id);

        // 1. Set investment allocations
        this.setInvestments(myCities);

        // 2. Recruit units
        this.recruitUnits(gameState, myCities);

        // 3. Move and attack with each unit
        this.moveUnits(gameState, myUnits);
    }

    setInvestments(myCities) {
        for (const city of myCities) {
            // Personality-driven investment allocation
            const defWeight = this.p.militarism * 30;
            const knoWeight = this.p.development * 25;
            const pubWeight = (1 - this.p.aggression) * 25;
            const ecoWeight = this.p.development * 30;

            setInvestment(city, defWeight, knoWeight, pubWeight, ecoWeight);

            // Aggressive AIs tax more; benevolent tax less
            city.taxRate = Math.round(30 + this.p.aggression * 30 - this.p.development * 10);
            city.taxRate = Math.max(10, Math.min(80, city.taxRate));
        }
    }

    recruitUnits(gameState, myCities) {
        const { units } = gameState;
        const myUnits = units.filter(u => u.owner === this.player.id);

        // Don't over-recruit — limit based on city count
        const maxUnits = myCities.length * 3 + 2;
        if (myUnits.length >= maxUnits) return;

        for (const city of myCities) {
            if (this.player.treasury < 100) break;

            const available = getRecruitableUnits(city, this.player.treasury);
            if (available.length === 0) continue;

            // Choose unit type based on personality
            let preferredType;
            if (this.p.expansion > 0.6 && myUnits.filter(u => u.type === UNIT_TYPE.SCOUT).length < 2) {
                preferredType = UNIT_TYPE.SCOUT;
            } else if (this.p.aggression > 0.7) {
                preferredType = Math.random() < 0.5 ? UNIT_TYPE.RAIDER : UNIT_TYPE.MECHANIZED;
            } else if (this.p.militarism > 0.5) {
                preferredType = Math.random() < 0.5 ? UNIT_TYPE.ARMY_CORPS : UNIT_TYPE.ARTILLERY;
            } else {
                preferredType = UNIT_TYPE.DEFENDER;
            }

            // Find the preferred type in available, or fall back to first available
            const chosen = available.find(a => a.type === preferredType) || available[0];
            if (!chosen) continue;

            const stats = UNIT_STATS[chosen.type];
            if (this.player.treasury < stats.cost) continue;

            this.player.treasury -= stats.cost;
            const conscripted = Math.min(city.population * 0.1, stats.maxTroops * 0.3);
            city.population = Math.max(100, Math.floor(city.population - conscripted));

            const unit = createUnit(chosen.type, this.player.id, city);
            units.push(unit);
        }
    }

    moveUnits(gameState, myUnits) {
        const { map, units } = gameState;
        const cities = map.cities;

        for (const unit of myUnits) {
            if (unit.movesRemaining <= 0) continue;
            if (unit.type === UNIT_TYPE.DEFENDER) continue;
            // Commander only moves if threatened (enemy unit within 3 hexes)
            if (unit.type === UNIT_TYPE.COMMANDER) {
                const nearbyEnemy = gameState.units.some(u =>
                    u.owner !== this.player.id && u.troops > 0 && hexDistance(unit, u) <= 3
                );
                if (!nearbyEnemy) continue;
            }

            const target = this.pickTarget(unit, gameState);
            if (!target) continue;

            // Move toward target step by step
            this.moveToward(unit, target, gameState);
        }
    }

    pickTarget(unit, gameState) {
        const { map, units } = gameState;
        const cities = map.cities;

        // Find neutral cities
        const neutralCities = cities.filter(c => c.owner === null);
        // Find enemy cities
        const enemyCities = cities.filter(c => c.owner !== null && c.owner !== this.player.id);
        // Find enemy units
        const enemyUnits = units.filter(u => u.owner !== this.player.id);

        let bestTarget = null;
        let bestScore = -Infinity;

        // Score neutral cities (expansion)
        for (const city of neutralCities) {
            const dist = hexDistance(unit, city);
            if (dist === 0) continue;
            let score = (100 - dist * 5) * this.p.expansion;
            // Scouts prefer scouting; combat units prefer nearby targets
            if (unit.type === UNIT_TYPE.SCOUT) score *= 1.5;
            if (score > bestScore) {
                bestScore = score;
                bestTarget = { q: city.q, r: city.r };
            }
        }

        // Score enemy cities (aggression)
        for (const city of enemyCities) {
            const dist = hexDistance(unit, city);
            if (dist === 0) continue;
            let score = (80 - dist * 3) * this.p.aggression;

            // Bonus for targeting enemy commander's home city
            const enemyCommander = units.find(u =>
                u.type === UNIT_TYPE.COMMANDER && u.owner === city.owner
            );
            if (enemyCommander && enemyCommander.q === city.q && enemyCommander.r === city.r) {
                score *= 2; // High priority target
            }

            // Reckless AIs don't care about odds
            if (this.p.recklessness < 0.5 && unit.type === UNIT_TYPE.SCOUT) {
                score *= 0.1; // Scouts shouldn't attack cities
            }

            if (score > bestScore) {
                bestScore = score;
                bestTarget = { q: city.q, r: city.r };
            }
        }

        // Score nearby enemy units (combat)
        for (const enemy of enemyUnits) {
            const dist = hexDistance(unit, enemy);
            if (dist === 0 || dist > 8) continue;

            let score = (60 - dist * 5) * this.p.aggression;

            // Check combat odds before committing
            if (this.p.recklessness < 0.5) {
                const preview = getCombatPreview(unit, enemy, gameState.map);
                if (preview.attackerOdds < 40) score *= 0.2;
            }

            if (score > bestScore) {
                bestScore = score;
                bestTarget = { q: enemy.q, r: enemy.r };
            }
        }

        return bestTarget;
    }

    moveToward(unit, target, gameState) {
        const { map, units } = gameState;

        while (unit.movesRemaining > 0) {
            if (unit.q === target.q && unit.r === target.r) break;

            // Find the neighbor closest to the target
            const neighbors = hexNeighbors(unit.q, unit.r);
            let bestNeighbor = null;
            let bestDist = Infinity;

            for (const n of neighbors) {
                const key = hexKey(n.q, n.r);
                const tile = map.tiles.get(key);
                if (!tile) continue;

                const moveCost = getMoveCost(tile.terrain, unit.type);
                if (moveCost === Infinity) continue;
                if (moveCost > unit.movesRemaining) continue;

                const dist = hexDistance(n, target);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestNeighbor = { ...n, cost: moveCost };
                }
            }

            if (!bestNeighbor) break;

            // Check for enemies at the destination
            const enemiesAtDest = units.filter(u =>
                u.q === bestNeighbor.q && u.r === bestNeighbor.r && u.owner !== this.player.id && u.troops > 0
            );

            if (enemiesAtDest.length > 0) {
                // Fight!
                const enemy = enemiesAtDest[0];
                const preview = getCombatPreview(unit, enemy, map);

                // Personality-based fight/flee decision
                if (preview.attackerOdds < (1 - this.p.recklessness) * 50) {
                    break; // Not good enough odds, stop moving
                }

                // Move to the hex and fight
                unit.q = bestNeighbor.q;
                unit.r = bestNeighbor.r;
                unit.movesRemaining -= bestNeighbor.cost;

                // Run combat rounds until one side breaks
                let rounds = 0;
                while (unit.troops > 0 && enemy.troops > 0 && rounds < 10) {
                    const result = runCombatRound(unit, enemy, map);
                    rounds++;

                    // AI retreat decision based on personality
                    const casualtyRatio = 1 - (unit.troops / unit.maxTroops);
                    if (casualtyRatio > this.p.retreatThreshold) {
                        break; // Had enough, retreat
                    }
                }

                // Remove dead units
                if (enemy.troops <= 0) {
                    const idx = units.indexOf(enemy);
                    if (idx !== -1) units.splice(idx, 1);

                    // Try to capture city
                    tryCaptureCity(unit, map, units);
                }
                if (unit.troops <= 0) {
                    const idx = units.indexOf(unit);
                    if (idx !== -1) units.splice(idx, 1);
                }
                break; // Combat ends movement
            }

            // Move to neighbor
            unit.q = bestNeighbor.q;
            unit.r = bestNeighbor.r;
            unit.movesRemaining -= bestNeighbor.cost;

            // Capture undefended neutral/enemy cities
            const captureResult = tryCaptureCity(unit, map, units);
        }
    }
}

// Create AI instance from personality preset name
export function createAI(player, personalityName) {
    const personality = AI_PERSONALITY[personalityName] || AI_PERSONALITY.AGGRESSIVE;
    return new AI(player, personality);
}
