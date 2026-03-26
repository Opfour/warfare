// Turn manager: phase sequencing, turn transitions

import { UNIT_STATS, TERRAIN_MOVE_COST } from './config.js';
import { getMoveCost } from './config.js';
import { hexKey, hexNeighbors } from './hex.js';
import { collectTaxes, applyCityGrowth, checkRevolts } from './investment.js';
import { checkCommanderDeath, tryCaptureCity } from './combat.js';
import { ORDER } from './orders.js';

export class TurnManager {
    constructor(gameState, aiPlayers) {
        this.gameState = gameState;
        this.aiPlayers = aiPlayers; // Map of playerId -> AI instance
        this.turnLog = [];
    }

    // End the current player's turn and process everything
    endTurn() {
        const gs = this.gameState;
        this.turnLog = [];

        // 1. Run AI turns
        for (const [playerId, ai] of this.aiPlayers) {
            if (!gs.players[playerId] || !gs.players[playerId].alive) continue;
            ai.executeTurn(gs);
        }

        // 2. Collect taxes for all players
        for (const player of gs.players) {
            if (!player.alive) continue;
            const income = collectTaxes(player, gs.map.cities);
            this.turnLog.push(`${player.name} collected ${income} gold in taxes.`);
        }

        // 3. Apply city growth and collect tech events
        const growthEvents = applyCityGrowth(gs.map.cities);
        for (const evt of growthEvents) {
            this.turnLog.push(evt.message);
        }
        // Store events for notification system
        gs.turnEvents = growthEvents;

        // 4. Check for revolts
        const revolts = checkRevolts(gs.map.cities, gs.units);
        for (const revolt of revolts) {
            this.turnLog.push(`Revolt in ${revolt.cityName}! ${revolt.garrisonLost} garrison troops lost.`);
        }

        // 5. Check victory conditions
        const deadCommanders = checkCommanderDeath(gs.units);
        for (const deadOwner of deadCommanders) {
            const player = gs.players[deadOwner];
            if (player && player.alive) {
                player.alive = false;
                this.turnLog.push(`${player.name}'s commander has been killed! ${player.name} is eliminated.`);

                // Release all their cities to neutral
                for (const city of gs.map.cities) {
                    if (city.owner === deadOwner) {
                        city.owner = null;
                    }
                }

                // Remove their non-commander units
                gs.units = gs.units.filter(u => u.owner !== deadOwner);
            }
        }

        // Check if game is over (only one player alive)
        const alivePlayers = gs.players.filter(p => p.alive);
        if (alivePlayers.length <= 1) {
            gs.phase = 'gameover';
            if (alivePlayers.length === 1) {
                gs.winner = alivePlayers[0];
                this.turnLog.push(`${alivePlayers[0].name} wins the war!`);
            }
        }

        // 6. Advance turn counter
        gs.turn++;

        // 7. Reset movement for human player's units
        for (const unit of gs.units) {
            if (unit.owner === gs.currentPlayer) {
                const stats = UNIT_STATS[unit.type];
                unit.movesRemaining = stats.move;
            }
        }

        // 8. Process MOVE_TO orders for human player's units
        this.processMoveToOrders(gs);

        // Clear selection
        gs.selectedHex = null;
        gs.selectedUnit = null;
        gs.selectedCity = null;
        gs.movementRange = null;

        return this.turnLog;
    }

    // Auto-move units that have MOVE_TO orders toward their target
    processMoveToOrders(gs) {
        for (const unit of gs.units) {
            if (unit.owner !== gs.currentPlayer) continue;
            if (unit.orders !== ORDER.MOVE_TO || !unit.moveTarget) continue;
            if (unit.movesRemaining <= 0) continue;

            // Already at target?
            if (unit.q === unit.moveTarget.q && unit.r === unit.moveTarget.r) {
                unit.orders = ORDER.HOLD;
                unit.moveTarget = null;
                this.turnLog.push(`${UNIT_STATS[unit.type].name} arrived at destination.`);
                continue;
            }

            // Find path and move as far as possible this turn
            const path = this.findPathToward(unit, unit.moveTarget, gs.map.tiles);
            if (!path || path.length === 0) continue;

            for (const step of path) {
                if (unit.movesRemaining < step.cost) break;
                unit.q = step.q;
                unit.r = step.r;
                unit.movesRemaining -= step.cost;

                // Capture any neutral/undefended city along the way
                const captured = tryCaptureCity(unit, gs.map, gs.units);
                if (captured) {
                    const verb = captured.previousOwner === null ? 'claimed' : 'captured';
                    this.turnLog.push(`${UNIT_STATS[unit.type].name} ${verb} ${captured.city.name}!`);
                }
            }

            // Check if arrived
            if (unit.q === unit.moveTarget.q && unit.r === unit.moveTarget.r) {
                unit.orders = ORDER.HOLD;
                unit.moveTarget = null;
                this.turnLog.push(`${UNIT_STATS[unit.type].name} arrived at destination.`);
            }
        }
    }

    // BFS shortest path from unit toward target (uses all available moves)
    findPathToward(unit, target, tiles) {
        const visited = new Map();
        const queue = [{ q: unit.q, r: unit.r, cost: 0 }];
        const startKey = hexKey(unit.q, unit.r);
        visited.set(startKey, { cost: 0, parent: null });

        while (queue.length > 0) {
            queue.sort((a, b) => a.cost - b.cost);
            const current = queue.shift();
            const currentKey = hexKey(current.q, current.r);

            if (current.q === target.q && current.r === target.r) break;

            const neighbors = hexNeighbors(current.q, current.r);
            for (const n of neighbors) {
                const nKey = hexKey(n.q, n.r);
                const tile = tiles.get(nKey);
                if (!tile) continue;

                const moveCost = getMoveCost(tile.terrain, unit.type);
                if (moveCost === Infinity) continue;

                const totalCost = current.cost + moveCost;
                if (totalCost > unit.movesRemaining) continue;

                if (!visited.has(nKey) || visited.get(nKey).cost > totalCost) {
                    visited.set(nKey, { cost: totalCost, parent: currentKey });
                    queue.push({ q: n.q, r: n.r, cost: totalCost });
                }
            }
        }

        // Reconstruct path
        const targetKey = hexKey(target.q, target.r);
        // Find the farthest reachable hex closest to target
        let bestKey = null;
        let bestDist = Infinity;

        for (const [key, info] of visited) {
            if (key === startKey) continue;
            const [kq, kr] = key.split(',').map(Number);
            const dist = Math.abs(kq - target.q) + Math.abs(kr - target.r) + Math.abs(kq + kr - target.q - target.r);
            if (dist < bestDist) {
                bestDist = dist;
                bestKey = key;
            }
        }

        // If target is reachable, use it; otherwise use closest reachable hex
        const endKey = visited.has(targetKey) ? targetKey : bestKey;
        if (!endKey) return null;

        const path = [];
        let key = endKey;
        while (key && key !== startKey) {
            const [q, r] = key.split(',').map(Number);
            const tile = tiles.get(key);
            const moveCost = getMoveCost(tile.terrain, unit.type);
            path.unshift({ q, r, cost: moveCost });
            key = visited.get(key).parent;
        }
        return path;
    }
}
