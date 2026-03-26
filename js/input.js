// Mouse and keyboard input handling

import { pixelToAxial, hexKey, hexNeighbors } from './hex.js';
import { getMoveCost } from './config.js';

export class InputHandler {
    constructor(canvas, camera, gameState) {
        this.canvas = canvas;
        this.camera = camera;
        this.gameState = gameState;
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseInCanvas = false;
        this.animating = false; // true during step-by-step movement

        // Right-click context menu callback (set by main.js)
        this.onRightClick = null;

        this.bindEvents();
    }

    bindEvents() {
        const canvas = this.canvas;
        const DRAG_THRESHOLD = 5;
        let leftDown = false;
        let leftStartX = 0;
        let leftStartY = 0;
        let didDrag = false;

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
            this.mouseInCanvas = true;

            // Left-button drag: start after threshold
            if (leftDown && !this.camera.dragging) {
                const dx = e.clientX - leftStartX;
                const dy = e.clientY - leftStartY;
                if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
                    didDrag = true;
                    this.camera.startDrag(leftStartX, leftStartY);
                    this.camera.updateDrag(e.clientX, e.clientY);
                    canvas.style.cursor = 'grabbing';
                }
            }

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
            if (this.camera.dragging) {
                this.camera.endDrag();
                canvas.style.cursor = 'default';
            }
            leftDown = false;
            this.gameState.hoverHex = null;
        });

        canvas.addEventListener('mousedown', (e) => {
            // Close any open context menu on any click
            this.closeContextMenu();

            if (e.button === 0) {
                leftDown = true;
                didDrag = false;
                leftStartX = e.clientX;
                leftStartY = e.clientY;
            } else if (e.button === 1) {
                e.preventDefault();
                this.camera.startDrag(e.clientX, e.clientY);
                canvas.style.cursor = 'grabbing';
            }
        });

        canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                leftDown = false;
                if (this.camera.dragging) {
                    this.camera.endDrag();
                    canvas.style.cursor = 'default';
                }
                if (didDrag || this.animating) return;

                // Left click
                const rect = canvas.getBoundingClientRect();
                const sx = e.clientX - rect.left;
                const sy = e.clientY - rect.top;
                const world = this.camera.screenToWorld(sx, sy);
                const hex = pixelToAxial(world.x, world.y);
                const key = hexKey(hex.q, hex.r);

                if (this.gameState.map && this.gameState.map.tiles.has(key)) {
                    this.handleHexClick(hex, key);
                }
            } else if (e.button === 1) {
                this.camera.endDrag();
                canvas.style.cursor = 'default';
            } else if (e.button === 2) {
                // Right click — context menu
                e.preventDefault();
                const rect = canvas.getBoundingClientRect();
                const sx = e.clientX - rect.left;
                const sy = e.clientY - rect.top;
                const world = this.camera.screenToWorld(sx, sy);
                const hex = pixelToAxial(world.x, world.y);
                const key = hexKey(hex.q, hex.r);

                if (this.gameState.map && this.gameState.map.tiles.has(key)) {
                    if (this.onRightClick) {
                        this.onRightClick(hex, key, e.clientX, e.clientY);
                    }
                }
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
                    this.closeContextMenu();
                    if (this.gameState.moveToPickUnit) {
                        this.gameState.moveToPickUnit = null;
                        document.body.style.cursor = 'default';
                    }
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

    closeContextMenu() {
        const menu = document.getElementById('contextMenu');
        if (menu) menu.style.display = 'none';
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
            // Also show city panel if there's a city here
            if (tile && tile.city) {
                this.gameState.selectedCity = tile.city;
            }
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

                // Use unit-type-specific terrain cost
                const moveCost = getMoveCost(tile.terrain, unit.type);
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

    // Find shortest path from unit to target within movement range
    findPath(unit, target) {
        const { tiles } = this.gameState.map;
        const visited = new Map(); // key -> { cost, parent }
        const queue = [{ q: unit.q, r: unit.r, cost: 0 }];
        const startKey = hexKey(unit.q, unit.r);
        visited.set(startKey, { cost: 0, parent: null });

        while (queue.length > 0) {
            // Sort by cost (simple priority queue)
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
        if (!visited.has(targetKey)) return null;

        const path = [];
        let key = targetKey;
        while (key && key !== startKey) {
            const [q, r] = key.split(',').map(Number);
            const tile = tiles.get(key);
            const moveCost = getMoveCost(tile.terrain, unit.type);
            path.unshift({ q, r, cost: moveCost });
            key = visited.get(key).parent;
        }
        return path;
    }

    // Animate unit movement step by step (~150ms per hex)
    moveUnit(unit, target) {
        const path = this.findPath(unit, target);
        if (!path || path.length === 0) return;

        // Lock input during animation
        this.animating = true;
        this.gameState.movementRange = null;

        let stepIndex = 0;
        const stepDelay = 150; // ms per hex

        const step = () => {
            if (stepIndex >= path.length) {
                this.animating = false;
                this.selectUnit(unit);
                return;
            }

            const next = path[stepIndex];
            unit.q = next.q;
            unit.r = next.r;
            unit.movesRemaining = Math.max(0, unit.movesRemaining - next.cost);
            this.gameState.selectedHex = { q: unit.q, r: unit.r };
            stepIndex++;

            setTimeout(step, stepDelay);
        };

        step();
    }
}
