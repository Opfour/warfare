// AI decision engine with personality-driven behavior

import { UNIT_TYPE, UNIT_STATS, AI_PERSONALITY, getMoveCost, getDifficulty,
         TEMPERAMENT, TEMPERAMENT_KEYS, REACTION_STAGES,
         REACTION_DEGRADE_POINTS, REACTION_WINNER_BONUS,
         REACTION_RECOVER_PER_TURN, REACTION_ATTACK_OTHERS_BONUS } from './config.js';
import { hexDistance, hexNeighbors, hexKey } from './hex.js';
import { createUnit, getRecruitableUnits } from './unit.js';
import { runCombatRound, tryCaptureCity, getCombatPreview } from './combat.js';
import { setInvestment } from './investment.js';

// ─── Leader Relationship System ────────────────────────────────────
// Global relationship tracker — maps "ownerId:otherId" to { points, stage }
// Shared across all AI instances so every AI sees the same relationship state.
// Relationships are one-directional: A's opinion of B is independent of B's opinion of A.

const _relationshipMatrix = new Map();

function _relKey(a, b) {
    return `${a}:${b}`;
}

// Get or initialize a one-directional relationship: how `owner` feels toward `other`.
function getRelationship(ownerId, otherId) {
    const key = _relKey(ownerId, otherId);
    if (!_relationshipMatrix.has(key)) {
        _relationshipMatrix.set(key, { points: 0, stage: 0 });
    }
    return _relationshipMatrix.get(key);
}

// Degrade: `owner`'s opinion of `other` worsens by `pts`.
export function degradeRelationship(ownerId, otherId, pts) {
    const rel = getRelationship(ownerId, otherId);
    if (rel.stage >= REACTION_STAGES.length - 1) return; // already at MUST KILL
    rel.points += pts;
    // Advance stages: each stage needs (stage+1) * threshold points
    while (rel.stage < REACTION_STAGES.length - 1) {
        const needed = (rel.stage + 1) * REACTION_DEGRADE_POINTS;
        if (rel.points >= needed) {
            rel.stage++;
        } else {
            break;
        }
    }
    if (rel.stage < 0) rel.stage = 0;
    if (rel.stage >= REACTION_STAGES.length) rel.stage = REACTION_STAGES.length - 1;
}

// Recover: `owner`'s opinion of `other` improves by `pts`.
export function recoverRelationship(ownerId, otherId, pts) {
    const rel = getRelationship(ownerId, otherId);
    if (rel.stage === 0 && rel.points <= 0) return;
    rel.points -= pts;
    // Drop stages: each stage requires (stage) * threshold points to stay
    while (rel.stage > 0) {
        const needed = rel.stage * REACTION_DEGRADE_POINTS;
        if (rel.points < needed) {
            rel.stage--;
        } else {
            break;
        }
    }
    if (rel.stage === 0 && rel.points < 0) rel.points = 0;
    if (rel.stage < 0) rel.stage = 0;
}

// Get the stage info for display.
export function getRelationshipStage(ownerId, otherId) {
    const rel = getRelationship(ownerId, otherId);
    return REACTION_STAGES[rel.stage];
}

// Reset the entire relationship matrix (called on new game).
export function resetRelationships() {
    _relationshipMatrix.clear();
}

// Notify all AIs that `attackerId` attacked `targetId` — degrades attacker's
// relationships with the target, and improves the target's allies' opinions.
export function notifyAttack(attackerId, targetId, allPlayerIds) {
    // Every AI (and the relationship matrix) tracks that attackerId attacked targetId.
    // 1. targetId's opinion of attackerId degrades (they were attacked).
    // 2. All other leaders' opinions of attackerId degrade slightly (aggression is noted).
    // 3. All other leaders' opinions of targetId recover slightly (sympathy).
    for (const pid of allPlayerIds) {
        if (pid === attackerId) continue;
        // The attacked party degrades its opinion of the attacker faster
        if (pid === targetId) {
            degradeRelationship(pid, attackerId, REACTION_DEGRADE_POINTS);
        } else {
            // Third parties are mildly displeased with the aggressor
            degradeRelationship(pid, attackerId, REACTION_DEGRADE_POINTS * 0.3);
            // And slightly sympathetic toward the target
            recoverRelationship(pid, targetId, REACTION_ATTACK_OTHERS_BONUS * 0.5);
        }
    }
}

// Notify that `winnerId` is winning (has the most cities / strong economy).
// Other leaders degrade their opinion of the winner out of envy/fear.
export function notifyWinner(winnerId, allPlayerIds) {
    for (const pid of allPlayerIds) {
        if (pid === winnerId) continue;
        degradeRelationship(pid, winnerId, REACTION_WINNER_BONUS);
    }
}

// ─── AI Class ──────────────────────────────────────────────────────

export class AI {
    constructor(player, personality, difficultyKey = 'NORMAL') {
        this.player = player;
        this.p = personality; // personality weights
        this.difficulty = getDifficulty(difficultyKey);
        this.difficultyKey = difficultyKey;

        // Assign a temperament — deterministic based on player id for variety
        const tempIdx = player.id % TEMPERAMENT_KEYS.length;
        const tempKey = TEMPERAMENT_KEYS[tempIdx];
        this.temperament = TEMPERAMENT[tempKey];
        this.temperamentKey = tempKey;
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

        // 4. Update relationships — recover toward leaders who didn't attack us,
        //    and degrade toward leaders who are winning.
        this.updateRelationships(gameState);
    }

    // Per-turn relationship maintenance: slow recovery for neutral/mild relationships,
    // and degradation toward leaders who are winning (have the most cities).
    updateRelationships(gameState) {
        const allPlayerIds = gameState.players.filter(p => p.alive).map(p => p.id);
        const cities = gameState.map.cities;

        // Find the leader with the most cities (the "winner")
        let maxCities = 0;
        let winnerId = -1;
        for (const pid of allPlayerIds) {
            const count = cities.filter(c => c.owner === pid).length;
            if (count > maxCities) {
                maxCities = count;
                winnerId = pid;
            }
        }
        if (winnerId !== -1 && winnerId !== this.player.id) {
            // Degrade opinion of the winner (fear/envy), scaled by temperament
            degradeRelationship(this.player.id, winnerId,
                REACTION_WINNER_BONUS * this.temperament.degradeMult);
        }

        // Slow recovery toward all other leaders (forgiveness over time),
        // scaled by temperament recovery multiplier.
        for (const pid of allPlayerIds) {
            if (pid === this.player.id) continue;
            const stage = getRelationship(this.player.id, pid);
            if (stage && stage.stage > 0) {
                recoverRelationship(this.player.id, pid,
                    REACTION_RECOVER_PER_TURN * this.temperament.recoverMult);
            }
        }
    }

    // Get a relationship-weighted score multiplier for targeting a specific leader.
    // Higher stage = worse relationship = higher priority to attack.
    getRelationshipTargetMultiplier(targetOwnerId) {
        if (targetOwnerId === null || targetOwnerId === this.player.id) return 1.0;
        const stage = getRelationshipStage(this.player.id, targetOwnerId);
        if (!stage) return 1.0;
        // Scale: stage 0 = 1.0x, stage 7 (MUST KILL) = 5.0x
        return 1.0 + stage.level * 0.57;
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

        // On KILL THE HUMAN difficulty, AI is always hostile toward the human player
        // and prioritizes human targets above all others.
        const bloodlust = this.difficulty.hostileStart;
        const humanId = 0;

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
            // Bloodlust: deprioritize neutral expansion, prioritize combat
            if (bloodlust) score *= 0.5;
            if (score > bestScore) {
                bestScore = score;
                bestTarget = { q: city.q, r: city.r };
            }
        }

        // Score enemy cities (aggression) — modified by relationship with the city owner
        for (const city of enemyCities) {
            const dist = hexDistance(unit, city);
            if (dist === 0) continue;
            let score = (80 - dist * 3) * this.p.aggression;

            // ── Relationship modifier: prioritize leaders we despise ──
            score *= this.getRelationshipTargetMultiplier(city.owner);

            // Bonus for targeting enemy commander's home city
            const enemyCommander = units.find(u =>
                u.type === UNIT_TYPE.COMMANDER && u.owner === city.owner
            );
            if (enemyCommander && enemyCommander.q === city.q && enemyCommander.r === city.r) {
                // If we're at MUST KILL, further boost commander's city
                const relStage = getRelationshipStage(this.player.id, city.owner);
                const cmdBonus = relStage.level >= 7 ? 4 : 2;
                score *= cmdBonus;
            }

            // Reckless AIs don't care about odds
            if (this.p.recklessness < 0.5 && unit.type === UNIT_TYPE.SCOUT) {
                score *= 0.1; // Scouts shouldn't attack cities
            }

            // Bloodlust: heavily prioritize human player's cities
            if (bloodlust && city.owner === humanId) {
                score *= 3;
            }

            if (score > bestScore) {
                bestScore = score;
                bestTarget = { q: city.q, r: city.r };
            }
        }

        // Score nearby enemy units (combat) — modified by relationship with the unit owner
        for (const enemy of enemyUnits) {
            const dist = hexDistance(unit, enemy);
            if (dist === 0 || dist > 8) continue;

            let score = (60 - dist * 5) * this.p.aggression;

            // ── Relationship modifier: prioritize attacking leaders we hate ──
            score *= this.getRelationshipTargetMultiplier(enemy.owner);

            // Check combat odds before committing
            if (this.p.recklessness < 0.5) {
                const preview = getCombatPreview(unit, enemy, gameState.map);
                if (preview.attackerOdds < 40) score *= 0.2;
            }

            // Bloodlust: prioritize human player's units
            if (bloodlust && enemy.owner === humanId) {
                score *= 3;
                // Also target commander specifically
                if (enemy.type === UNIT_TYPE.COMMANDER) score *= 5;
            }

            // If relationship is at MUST KILL, discard combat odds check
            const relStage = getRelationshipStage(this.player.id, enemy.owner);
            if (relStage.level >= 7 && enemy.type === UNIT_TYPE.COMMANDER) {
                score *= 3; // Vendetta: always go for the commander
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
        const allPlayerIds = gameState.players.filter(p => p.alive).map(p => p.id);

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

                // ── Notify relationship system that we attacked this leader ──
                notifyAttack(this.player.id, enemy.owner, allPlayerIds);

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

// Create AI instance from personality preset name and difficulty
export function createAI(player, personalityName, difficultyKey = 'NORMAL') {
    const personality = AI_PERSONALITY[personalityName] || AI_PERSONALITY.AGGRESSIVE;
    return new AI(player, personality, difficultyKey);
}