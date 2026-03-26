// Mouse and keyboard input handling

import { pixelToAxial, hexKey, hexNeighbors } from './hex.js';
import { TERRAIN_MOVE_COST } from './config.js';

export class InputHandler {
    constructor(canvas, camera, gameState) {
        this.canvas = canvas;
        this.camera = camera;
        this.gameState = gameState;
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseInCanvas = false;

        this.bindEvents();
    }

    bindEvents() {
        const canvas = this.canvas;

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
            this.mouseInCanvas = true;

            // Update edge scroll
            this.camera.updateEdgeScroll(this.mouseX, this.mouseY);

            // Update drag
            if (this.camera.dragging) {
                this.camera.updateDrag(e.clientX, e.clientY);
            }

            // Update hover hex
            const world = this.camera.screenToWorld(this.mouseX, this.mouseY);
            const hex = pixelToAxial(world.x, world.y);
            const key = hexKey(hex.q, hex.r);
            if (this.gameState.map && this.gameState.map.tiles.has(key)) {
                this.gameState.hoverHex = hex;
            } else {
                this.gameState.hoverHex = null;
            }
        });

        canvas.addEventListener('mouseleave', () => {
            this.mouseInCanvas = false;
            this.camera.stopEdgeScroll();
            this.camera.endDrag();
            this.gameState.hoverHex = null;
        });

        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 1 || e.button === 2) {
                e.preventDefault();
                this.camera.startDrag(e.clientX, e.clientY);
            }
        });

        canvas.addEventListener('mouseup', (e) => {
            if (e.button === 1 || e.button === 2) {
                this.camera.endDrag();
            }
        });

        canvas.addEventListener('click', (e) => {
            if (this.camera.dragging) return;

            const rect = canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const world = this.camera.screenToWorld(sx, sy);
            const hex = pixelToAxial(world.x, world.y);
            const key = hexKey(hex.q, hex.r);

            if (this.gameState.map && this.gameState.map.tiles.has(key)) {
                this.handleHexClick(hex, key);
            }
        });

        canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        document.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'ArrowLeft':
                case 'a':
                    this.camera.scrollLeft = true;
                    e.preventDefault();
                    break;
                case 'ArrowRight':
                case 'd':
                    this.camera.scrollRight = true;
                    e.preventDefault();
                    break;
                case 'ArrowUp':
                case 'w':
                    this.camera.scrollUp = true;
                    e.preventDefault();
                    break;
                case 'ArrowDown':
                case 's':
                    this.camera.scrollDown = true;
                    e.preventDefault();
                    break;
                case 'Escape':
                    this.gameState.selectedHex = null;
                    this.gameState.selectedUnit = null;
                    this.gameState.movementRange = null;
                    this.gameState.selectedCity = null;
                    break;
            }
        });

        document.addEventListener('keyup', (e) => {
            switch (e.key) {
                case 'ArrowLeft':
                case 'a':
                    this.camera.scrollLeft = false;
                    break;
                case 'ArrowRight':
                case 'd':
                    this.camera.scrollRight = false;
                    break;
                case 'ArrowUp':
                case 'w':
                    this.camera.scrollUp = false;
                    break;
                case 'ArrowDown':
                case 's':
                    this.camera.scrollDown = false;
                    break;
            }
        });
    }

    handleHexClick(hex, key) {
        const tile = this.gameState.map.tiles.get(key);

        // If we have a selected unit and click a valid movement hex, move the unit
        if (this.gameState.selectedUnit && this.gameState.movementRange) {
            const inRange = this.gameState.movementRange.some(h => h.q === hex.q && h.r === hex.r);
            if (inRange) {
                this.moveUnit(this.gameState.selectedUnit, hex);
                return;
            }
        }

        // Check if there's a unit at this hex owned by the current player
        const unit = this.findUnitAt(hex.q, hex.r, this.gameState.currentPlayer);
        if (unit) {
            this.selectUnit(unit);
            return;
        }

        // Otherwise just select the hex
        this.gameState.selectedHex = hex;
        this.gameState.selectedUnit = null;
        this.gameState.movementRange = null;

        if (tile && tile.city) {
            this.gameState.selectedCity = tile.city;
        } else {
            this.gameState.selectedCity = null;
        }
    }

    selectUnit(unit) {
        this.gameState.selectedUnit = unit;
        this.gameState.selectedHex = { q: unit.q, r: unit.r };

        if (unit.movesRemaining > 0 && unit.owner === this.gameState.currentPlayer) {
            this.gameState.movementRange = this.calculateMovementRange(unit);
        } else {
            this.gameState.movementRange = null;
        }
    }

    findUnitAt(q, r, owner) {
        if (!this.gameState.units) return null;
        return this.gameState.units.find(u => u.q === q && u.r === r && u.owner === owner);
    }

    calculateMovementRange(unit) {
        const { tiles } = this.gameState.map;
        const visited = new Map();
        const queue = [{ q: unit.q, r: unit.r, cost: 0 }];
        const startKey = hexKey(unit.q, unit.r);
        visited.set(startKey, 0);
        const reachable = [];

        while (queue.length > 0) {
            const current = queue.shift();
            const neighbors = hexNeighbors(current.q, current.r);

            for (const n of neighbors) {
                const nKey = hexKey(n.q, n.r);
                const tile = tiles.get(nKey);
                if (!tile) continue;

                const moveCost = TERRAIN_MOVE_COST[tile.terrain] || 1;
                if (moveCost === Infinity) continue;

                const totalCost = current.cost + moveCost;
                if (totalCost > unit.movesRemaining) continue;

                if (!visited.has(nKey) || visited.get(nKey) > totalCost) {
                    visited.set(nKey, totalCost);
                    queue.push({ q: n.q, r: n.r, cost: totalCost });
                    reachable.push({ q: n.q, r: n.r });
                }
            }
        }

        return reachable;
    }

    moveUnit(unit, target) {
        const key = hexKey(target.q, target.r);
        const tile = this.gameState.map.tiles.get(key);
        if (!tile) return;

        const cost = TERRAIN_MOVE_COST[tile.terrain] || 1;
        unit.movesRemaining = Math.max(0, unit.movesRemaining - cost);
        unit.q = target.q;
        unit.r = target.r;

        // Re-select to update movement range
        this.selectUnit(unit);
    }
}
