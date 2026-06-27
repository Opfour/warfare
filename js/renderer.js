// Canvas rendering: hex grid, terrain, cities, units, overlays

import { HEX_SIZE, TERRAIN_COLORS, TERRAIN_SYMBOLS, NEUTRAL_COLOR, PLAYER_COLORS, UNIT_STATS, getMoveCost } from './config.js';
import { axialToPixel, hexCorners, hexKey, hexNeighbors } from './hex.js';
import { calculateCityTaxIncome } from './investment.js';
import { getSectorTaxMultiplier } from './sectors.js';
import { FOG_STATE, VIS_DETAIL } from './fog.js';

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.showSectors = false;
    }

    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
    }

    clear() {
        this.ctx.fillStyle = '#1a2a3a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Main draw call
    draw(gameState, camera) {
        this.clear();
        if (!gameState.map) return;
        const ctx = this.ctx;

        ctx.save();
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);

        // Draw all visible tiles
        this.drawTiles(gameState, camera);

        // Draw sector overlay (if enabled)
        if (this.showSectors && gameState.map && gameState.map.sectors) {
            this.drawSectorOverlay(gameState, camera);
        }

        // Draw cities
        this.drawCities(gameState, camera);

        // Draw units
        this.drawUnits(gameState, camera);

        // Draw selection highlight
        if (gameState.selectedHex) {
            this.drawHexHighlight(gameState.selectedHex.q, gameState.selectedHex.r, '#ffffff', 2);
        }

        // Draw selected unit's movement range
        if (gameState.movementRange) {
            for (const hex of gameState.movementRange) {
                this.drawHexHighlight(hex.q, hex.r, 'rgba(255, 255, 100, 0.3)', 1, true);
            }
        }

        // Draw floating movement widget around selected unit
        if (gameState.selectedUnit && gameState.movementRange) {
            this.drawMovementWidget(gameState, camera);
        }

        // Draw hover highlight
        if (gameState.hoverHex) {
            this.drawHexHighlight(gameState.hoverHex.q, gameState.hoverHex.r, 'rgba(255, 255, 255, 0.2)', 1, true);
        }

        ctx.restore();

        // Draw HUD info
        this.drawHUD(gameState);
    }

    drawTiles(gameState, camera) {
        const ctx = this.ctx;
        const { tiles } = gameState.map;

        for (const [key, tile] of tiles) {
            const { x, y } = axialToPixel(tile.q, tile.r);

            // Frustum cull
            if (!camera.isVisible(x - HEX_SIZE, y - HEX_SIZE, HEX_SIZE * 2, HEX_SIZE * 2)) continue;

            const corners = hexCorners(x, y);

            // Fill hex
            ctx.beginPath();
            ctx.moveTo(corners[0].x, corners[0].y);
            for (let i = 1; i < 6; i++) {
                ctx.lineTo(corners[i].x, corners[i].y);
            }
            ctx.closePath();

            ctx.fillStyle = TERRAIN_COLORS[tile.terrain] || '#333';
            ctx.fill();

            // Fog of War overlay — darken hidden/explored hexes
            if (gameState.fogOfWar) {
                const fogState = gameState.fogOfWar.getHexState(tile.q, tile.r);
                if (fogState === FOG_STATE.HIDDEN) {
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                    ctx.fill();
                } else if (fogState === FOG_STATE.EXPLORED) {
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                    ctx.fill();
                }
            }

            // Hex border
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.lineWidth = 0.5;
            ctx.stroke();

            // Terrain symbol
            const symbol = TERRAIN_SYMBOLS[tile.terrain];
            if (symbol) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
                ctx.font = 'bold 15px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(symbol, x, y);
            }
        }
    }

    drawCities(gameState, camera) {
        const ctx = this.ctx;
        const { cities } = gameState.map;

        for (const city of cities) {
            const { x, y } = axialToPixel(city.q, city.r);
            if (!camera.isVisible(x - HEX_SIZE, y - HEX_SIZE, HEX_SIZE * 2, HEX_SIZE * 2)) continue;

            // Skip cities in unexplored hexes (fog of war)
            if (gameState.fogOfWar && !gameState.fogOfWar.isExplored(city.q, city.r)) continue;

            const color = city.owner !== null ? PLAYER_COLORS[city.owner] || NEUTRAL_COLOR : NEUTRAL_COLOR;
            const size = 9;

            // City square
            ctx.fillStyle = color;
            ctx.fillRect(x - size, y - size, size * 2, size * 2);

            // City border
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.strokeRect(x - size, y - size, size * 2, size * 2);

            // City name
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.strokeText(city.name, x, y + size + 11);
            ctx.fillText(city.name, x, y + size + 11);
        }
    }

    drawUnits(gameState, camera) {
        const ctx = this.ctx;
        const { units } = gameState;
        if (!units) return;

        // Group units by hex to offset stacked units
        const hexGroups = new Map();
        for (const unit of units) {
            // Skip enemy units hidden by fog of war
            if (gameState.fogOfWar && !gameState.fogOfWar.isUnitVisible(unit)) continue;
            const key = `${unit.q},${unit.r}`;
            if (!hexGroups.has(key)) hexGroups.set(key, []);
            hexGroups.get(key).push(unit);
        }

        for (const [key, group] of hexGroups) {
            const { x, y } = axialToPixel(group[0].q, group[0].r);
            if (!camera.isVisible(x - HEX_SIZE, y - HEX_SIZE, HEX_SIZE * 2, HEX_SIZE * 2)) continue;

            // Offset each unit in the stack
            const count = group.length;
            for (let i = 0; i < count; i++) {
                const unit = group[i];
                const color = PLAYER_COLORS[unit.owner] || '#fff';
                const stats = UNIT_STATS[unit.type];

                // Stack offset: spread horizontally if multiple units
                let ox = 0, oy = -8;
                if (count === 2) {
                    ox = (i === 0 ? -6 : 6);
                } else if (count === 3) {
                    ox = (i - 1) * 8;
                } else if (count > 3) {
                    // 2x2 grid
                    ox = (i % 2 === 0 ? -6 : 6);
                    oy = (i < 2 ? -12 : -2);
                }

                const ux = x + ox;
                const uy = y + oy;

                // Unit circle
                ctx.beginPath();
                ctx.arc(ux, uy, 10, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Unit symbol
                ctx.fillStyle = '#fff';
                ctx.font = '13px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(stats.symbol, ux, uy);
            }

            // Show unit count badge if more than 3
            if (count > 3) {
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.strokeText(`x${count}`, x, y + 8);
                ctx.fillText(`x${count}`, x, y + 8);
            }
        }
    }

    // Draw a floating movement widget: directional arrows around the selected unit
    // showing which adjacent hexes are reachable and their terrain movement cost
    drawMovementWidget(gameState, camera) {
        const ctx = this.ctx;
        const unit = gameState.selectedUnit;
        if (!unit) return;

        const { x, y } = axialToPixel(unit.q, unit.r);
        const stat = UNIT_STATS[unit.type];
        const movesLeft = unit.movesRemaining;

        // Widget radius — slightly larger than the hex
        const radius = HEX_SIZE * 0.85;

        // 6 hex neighbor directions with their angles (flat-top hex, degrees)
        // Direction angles: 0=right(0°), 1=upper-right(300°), 2=upper-left(240°), 
        // 3=left(180°), 4=lower-left(120°), 5=lower-right(60°)
        const dirAngles = [0, 300, 240, 180, 120, 60];
        const dirLabels = ['E', 'NE', 'NW', 'W', 'SW', 'SE'];
        const neighbors = hexNeighbors(unit.q, unit.r);

        // Draw semi-transparent backing circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius + 18, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 25, 45, 0.85)';
    ctx.fill();
        ctx.strokeStyle = 'rgba(100, 150, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw "GO TO" label at center
        ctx.fillStyle = '#8cf';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GO TO', x, y - 6);
        ctx.fillStyle = '#aaa';
        ctx.font = '10px sans-serif';
        ctx.fillText(`${movesLeft}/${stat.move} moves`, x, y + 8);

        // Draw directional arrows for each of the 6 neighbors
        const { tiles } = gameState.map;

        for (let i = 0; i < 6; i++) {
            const angle = (dirAngles[i] * Math.PI) / 180;
            const ax = x + Math.cos(angle) * radius;
            const ay = y + Math.sin(angle) * radius;

            const n = neighbors[i];
            const nKey = hexKey(n.q, n.r);
            const tile = tiles.get(nKey);

            if (!tile) {
                // Off-map — draw greyed-out arrow
                this._drawArrow(ctx, x, y, ax, ay, 'rgba(80,80,80,0.4)', '—');
                continue;
            }

            // Check if this hex is in the movement range
            const inRange = gameState.movementRange.some(h => h.q === n.q && h.r === n.r);

            // Get terrain cost for this unit type
            let cost = Infinity;
            try { cost = getMoveCost(tile.terrain, unit.type); } catch(e) {}

            if (cost === Infinity) {
                // Impassable terrain — red X
                this._drawArrow(ctx, x, y, ax, ay, 'rgba(200,60,60,0.7)', '✕');
            } else if (inRange) {
                // Reachable — green arrow with cost
                const costLabel = cost === 1 ? '' : `${cost}`;
                this._drawArrow(ctx, x, y, ax, ay, 'rgba(100,220,100,0.8)', costLabel);
            } else {
                // Out of range — dim arrow with cost
                const costLabel = cost === 1 ? '' : `${cost}`;
                this._drawArrow(ctx, x, y, ax, ay, 'rgba(150,150,80,0.4)', costLabel);
            }
        }
        ctx.restore();
    }

    // Draw a single arrow from center to a position with a label
    _drawArrow(ctx, cx, cy, x, y, color, label) {
        const angle = Math.atan2(y - cy, x - cx);
        const arrowSize = 6;

        // Arrow line
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
        ctx.stroke();

        if (color.includes('0.4') || color.includes('0.7')) {
            // Solid arrowhead for visible arrows
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - arrowSize * Math.cos(angle - 0.4), y - arrowSize * Math.sin(angle - 0.4));
            ctx.lineTo(x - arrowSize * Math.cos(angle + 0.4), y - arrowSize * Math.sin(angle + 0.4));
            ctx.closePath();
            ctx.fill();
        }

        // Cost/label text at the arrow tip
        if (label) {
            const lx = x + Math.cos(angle) * 14;
            const ly = y + Math.sin(angle) * 14;
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = color;
            ctx.fillText(label, lx, ly);
        }
    }

    drawHexHighlight(q, r, color, lineWidth = 2, fill = false) {
        const ctx = this.ctx;
        const { x, y } = axialToPixel(q, r);
        const corners = hexCorners(x, y);

        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 6; i++) {
            ctx.lineTo(corners[i].x, corners[i].y);
        }
        ctx.closePath();

        if (fill) {
            ctx.fillStyle = color;
            ctx.fill();
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }

    drawHUD(gameState) {
        const ctx = this.ctx;

        // Turn info
        ctx.fillStyle = '#ddd';
            ctx.font = '16px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const player = gameState.players && gameState.players[gameState.currentPlayer];
        const gold = player ? player.treasury : 0;
        const turnText = `Turn: ${gameState.turn || 1}`;
        ctx.fillText(turnText, 10, this.canvas.height - 25);

        // Calculate income per turn
        let income = 0;
        if (player && gameState.map) {
            for (const city of gameState.map.cities) {
                if (city.owner === player.id) {
                    income += calculateCityTaxIncome(city);
                }
            }
            income = Math.floor(income);
        }

        // Gold + income display — larger and prominent
        ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`Gold: ${gold}`, this.canvas.width - 15, this.canvas.height - 28);
        ctx.fillStyle = '#8fcc5a';
            ctx.font = 'bold 17px monospace';
        ctx.fillText(`+${income}/turn`, this.canvas.width - 15, this.canvas.height - 8);

        // Score display
        if (player && player.score !== undefined) {
            ctx.fillStyle = '#c8a8ff';
                ctx.font = 'bold 17px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`Score: ${player.score.toLocaleString()}`, 120, this.canvas.height - 8);
        }

        // Hovered hex info
        if (gameState.hoverHex) {
            const key = hexKey(gameState.hoverHex.q, gameState.hoverHex.r);
            const tile = gameState.map.tiles.get(key);
            if (tile) {
                let info = `Hex (${tile.q}, ${tile.r}) — ${tile.terrain}`;
                if (tile.city) {
                    info += ` — ${tile.city.name} (Pop: ${tile.city.population})`;
                }
                ctx.font = '14px monospace';
            ctx.fillText(info, 10, this.canvas.height - 50);
            }
        }
    }

    // Draw sector grid borders and owned sector fills
    drawSectorOverlay(gameState, camera) {
        const ctx = this.ctx;
        const { tiles, sectors } = gameState.map;
        if (!sectors) return;

        // First: fill owned sectors with leader color at 20% opacity
        for (const sector of sectors) {
            if (sector.owner === null || sector.owner === undefined) continue;
            if (sector.cityIds.length === 0) continue; // skip empty sectors

            const color = PLAYER_COLORS[sector.owner];
            if (!color) continue;

            // Fill all hexes in this sector
            for (const key of sector.tiles) {
                const tile = tiles.get(key);
                if (!tile) continue;
                const { x, y } = axialToPixel(tile.q, tile.r);
                if (!camera.isVisible(x - HEX_SIZE, y - HEX_SIZE, HEX_SIZE * 2, HEX_SIZE * 2)) continue;

                const corners = hexCorners(x, y);
                ctx.beginPath();
                ctx.moveTo(corners[0].x, corners[0].y);
                for (let i = 1; i < 6; i++) {
                    ctx.lineTo(corners[i].x, corners[i].y);
                }
                ctx.closePath();

                // Parse color to rgba with 20% opacity
                ctx.fillStyle = this.hexToRgba(color, 0.20);
                ctx.fill();
            }
        }

        // Second: draw sector borders (thicker lines on sector boundaries)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;

        for (const [key, tile] of tiles) {
            const { x, y } = axialToPixel(tile.q, tile.r);
            if (!camera.isVisible(x - HEX_SIZE, y - HEX_SIZE, HEX_SIZE * 2, HEX_SIZE * 2)) continue;
            if (tile.sectorId === undefined) continue;

            const neighbors = [
                { q: tile.q + 1, r: tile.r },
                { q: tile.q + 1, r: tile.r - 1 },
                { q: tile.q, r: tile.r - 1 },
            ];

            for (const n of neighbors) {
                const nKey = hexKey(n.q, n.r);
                const nTile = tiles.get(nKey);
                if (!nTile || nTile.sectorId === undefined) continue;
                if (nTile.sectorId !== tile.sectorId) {
                    // Draw border edge between tile and neighbor
                    this.drawHexEdge(x, y, tile.q, tile.r, n.q, n.r);
                }
            }
        }

        // Third: draw white dots at each city to make them visible within sectors
        for (const city of gameState.map.cities) {
            const { x, y } = axialToPixel(city.q, city.r);
            if (!camera.isVisible(x - HEX_SIZE, y - HEX_SIZE, HEX_SIZE * 2, HEX_SIZE * 2)) continue;

            // White dot with ring
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // City name label
            ctx.font = '11px sans-serif';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 3;
            ctx.strokeText(city.name, x, y + 16);
            ctx.fillText(city.name, x, y + 16);
        }

        // Fourth: draw sector numbers at sector centers
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 16px monospace';

        for (const sector of sectors) {
            if (sector.cityIds.length === 0) continue;

            // Find center of sector (average of first few tiles)
            let cx = 0, cy = 0, count = 0;
            for (const key of sector.tiles) {
                const tile = tiles.get(key);
                if (!tile) continue;
                const { x, y } = axialToPixel(tile.q, tile.r);
                cx += x;
                cy += y;
                count++;
            }
            if (count === 0) continue;
            cx /= count;
            cy /= count;

            if (!camera.isVisible(cx, cy, 40, 40)) continue;

            const ownerColor = sector.owner !== null ? PLAYER_COLORS[sector.owner] : '#888';
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.lineWidth = 3;
            const label = `S${sector.id}`;
            ctx.strokeText(label, cx, cy);
            ctx.fillStyle = ownerColor;
            ctx.fillText(label, cx, cy);
        }
    }

    // Draw a single edge of a hex (the edge shared with a specific neighbor)
    drawHexEdge(cx, cy, q, r, nq, nr) {
        const ctx = this.ctx;
        const corners = hexCorners(cx, cy);

        // Determine which edge connects to the neighbor
        // Direction vectors for flat-top hexes:
        // 0: (+1, 0)  right
        // 1: (+1, -1) upper-right
        // 2: (0, -1)  upper-left
        // 3: (-1, 0)  left
        // 4: (-1, +1) lower-left
        // 5: (0, +1)  lower-right
        const dq = nq - q;
        const dr = nr - r;

        // Map neighbor direction to the two corners that form that edge
        // corner[i] is at angle 60*i degrees (flat-top)
        // Edge between corner[i] and corner[(i+1)%6] faces direction i
        let edgeIdx;
        if (dq === 1 && dr === 0) edgeIdx = 0;      // right
        else if (dq === 1 && dr === -1) edgeIdx = 1; // upper-right
        else if (dq === 0 && dr === -1) edgeIdx = 2; // upper-left
        else if (dq === -1 && dr === 0) edgeIdx = 3; // left
        else if (dq === -1 && dr === 1) edgeIdx = 4; // lower-left
        else if (dq === 0 && dr === 1) edgeIdx = 5;  // lower-right
        else return;

        const p1 = corners[edgeIdx];
        const p2 = corners[(edgeIdx + 1) % 6];

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    }

    // Helper: convert hex color (#rrggbb) to rgba string with given alpha
    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}
