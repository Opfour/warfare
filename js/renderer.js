// Canvas rendering: hex grid, terrain, cities, units, overlays

import { HEX_SIZE, TERRAIN_COLORS, TERRAIN_SYMBOLS, NEUTRAL_COLOR, PLAYER_COLORS, UNIT_STATS } from './config.js';
import { axialToPixel, hexCorners, hexKey } from './hex.js';
import { calculateCityTaxIncome } from './investment.js';

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
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
        const ctx = this.ctx;

        ctx.save();
        ctx.translate(-camera.x, -camera.y);

        // Draw all visible tiles
        this.drawTiles(gameState, camera);

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

            // Hex border
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.lineWidth = 0.5;
            ctx.stroke();

            // Terrain symbol
            const symbol = TERRAIN_SYMBOLS[tile.terrain];
            if (symbol) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
                ctx.font = 'bold 11px sans-serif';
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

            const color = city.owner !== null ? PLAYER_COLORS[city.owner] || NEUTRAL_COLOR : NEUTRAL_COLOR;
            const size = 6;

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
            ctx.font = '9px sans-serif';
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
                ctx.arc(ux, uy, 7, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Unit symbol
                ctx.fillStyle = '#fff';
                ctx.font = '9px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(stats.symbol, ux, uy);
            }

            // Show unit count badge if more than 3
            if (count > 3) {
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.font = 'bold 8px sans-serif';
                ctx.textAlign = 'center';
                ctx.strokeText(`x${count}`, x, y + 8);
                ctx.fillText(`x${count}`, x, y + 8);
            }
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
        ctx.font = '13px monospace';
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
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`Gold: ${gold}`, this.canvas.width - 15, this.canvas.height - 28);
        ctx.fillStyle = '#8fcc5a';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(`+${income}/turn`, this.canvas.width - 15, this.canvas.height - 8);

        // Hovered hex info
        if (gameState.hoverHex) {
            const key = hexKey(gameState.hoverHex.q, gameState.hoverHex.r);
            const tile = gameState.map.tiles.get(key);
            if (tile) {
                let info = `Hex (${tile.q}, ${tile.r}) — ${tile.terrain}`;
                if (tile.city) {
                    info += ` — ${tile.city.name} (Pop: ${tile.city.population})`;
                }
                ctx.fillText(info, 10, this.canvas.height - 45);
            }
        }
    }
}
