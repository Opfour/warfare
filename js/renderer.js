// Canvas rendering: hex grid, terrain, cities, units, overlays

import { HEX_SIZE, TERRAIN_COLORS, NEUTRAL_COLOR, PLAYER_COLORS, UNIT_STATS } from './config.js';
import { axialToPixel, hexCorners, hexKey } from './hex.js';

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

        // Draw scroll arrows (screen-space)
        this.drawScrollArrows(camera);

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

            // City name (only when zoomed in enough or hovered)
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

        for (const unit of units) {
            const { x, y } = axialToPixel(unit.q, unit.r);
            if (!camera.isVisible(x - HEX_SIZE, y - HEX_SIZE, HEX_SIZE * 2, HEX_SIZE * 2)) continue;

            const color = PLAYER_COLORS[unit.owner] || '#fff';
            const stats = UNIT_STATS[unit.type];

            // Unit circle background
            ctx.beginPath();
            ctx.arc(x, y - 8, 8, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Unit symbol
            ctx.fillStyle = '#fff';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(stats.symbol, x, y - 8);
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

    drawScrollArrows(camera) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const arrowSize = 15;
        const alpha = 0.4;

        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;

        // Left arrow
        if (camera.scrollLeft) {
            ctx.beginPath();
            ctx.moveTo(20, h / 2);
            ctx.lineTo(20 + arrowSize, h / 2 - arrowSize);
            ctx.lineTo(20 + arrowSize, h / 2 + arrowSize);
            ctx.fill();
        }

        // Right arrow
        if (camera.scrollRight) {
            ctx.beginPath();
            ctx.moveTo(w - 20, h / 2);
            ctx.lineTo(w - 20 - arrowSize, h / 2 - arrowSize);
            ctx.lineTo(w - 20 - arrowSize, h / 2 + arrowSize);
            ctx.fill();
        }

        // Up arrow
        if (camera.scrollUp) {
            ctx.beginPath();
            ctx.moveTo(w / 2, 20);
            ctx.lineTo(w / 2 - arrowSize, 20 + arrowSize);
            ctx.lineTo(w / 2 + arrowSize, 20 + arrowSize);
            ctx.fill();
        }

        // Down arrow
        if (camera.scrollDown) {
            ctx.beginPath();
            ctx.moveTo(w / 2, h - 20);
            ctx.lineTo(w / 2 - arrowSize, h - 20 - arrowSize);
            ctx.lineTo(w / 2 + arrowSize, h - 20 - arrowSize);
            ctx.fill();
        }
    }

    drawHUD(gameState) {
        const ctx = this.ctx;

        // Turn info
        ctx.fillStyle = '#ddd';
        ctx.font = '13px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const turnText = `Turn: ${gameState.turn || 1}`;
        ctx.fillText(turnText, 10, this.canvas.height - 25);

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
