// Viewport camera with scrolling and bounds clamping

import { SCROLL_SPEED, SCROLL_ZONE, HEX_SIZE } from './config.js';

export class Camera {
    constructor(canvasWidth, canvasHeight) {
        this.x = 0; // viewport offset in world pixels
        this.y = 0;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.mapPixelWidth = 0;
        this.mapPixelHeight = 0;

        // Scroll state
        this.scrollLeft = false;
        this.scrollRight = false;
        this.scrollUp = false;
        this.scrollDown = false;

        // Drag state
        this.dragging = false;

        // Zoom state
        this.zoom = 0.7;
        this.minZoom = 0.4;
        this.maxZoom = 2.5;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragCamStartX = 0;
        this.dragCamStartY = 0;
    }

    // Zoom in or out, keeping the focal point centered on the mouse position
    zoomAt(screenX, screenY, delta) {
        const oldZoom = this.zoom;
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom + delta));
        if (this.zoom === oldZoom) return;
        // Adjust camera position so the world point under the cursor stays fixed
        const worldX = this.x + screenX / oldZoom;
        const worldY = this.y + screenY / oldZoom;
        this.x = worldX - screenX / this.zoom;
        this.y = worldY - screenY / this.zoom;
        this.clamp();
    }

    // Set the world bounds based on map dimensions
    setMapBounds(cols, rows) {
        this.mapPixelWidth = cols * HEX_SIZE * 1.5 + HEX_SIZE;
        this.mapPixelHeight = rows * HEX_SIZE * Math.sqrt(3) + HEX_SIZE;
    }

    // Resize canvas dimensions
    resize(width, height) {
        this.canvasWidth = width;
        this.canvasHeight = height;
        this.clamp();
    }

    // Center camera on a world position
    centerOn(worldX, worldY) {
        this.x = worldX - this.canvasWidth / 2;
        this.y = worldY - this.canvasHeight / 2;
        this.clamp();
    }

    // Convert world coordinates to screen coordinates
    worldToScreen(wx, wy) {
        return {
            x: wx - this.x,
            y: wy - this.y,
        };
    }

    // Convert screen coordinates to world coordinates (accounting for zoom)
    screenToWorld(sx, sy) {
        return {
            x: (sx / this.zoom) + this.x,
            y: (sy / this.zoom) + this.y,
        };
    }

    // Check if mouse is near screen edges and set scroll flags
    updateEdgeScroll(mouseX, mouseY) {
        this.scrollLeft = mouseX >= 0 && mouseX < SCROLL_ZONE;
        this.scrollRight = mouseX > this.canvasWidth - SCROLL_ZONE && mouseX <= this.canvasWidth;
        this.scrollUp = mouseY >= 0 && mouseY < SCROLL_ZONE;
        this.scrollDown = mouseY > this.canvasHeight - SCROLL_ZONE && mouseY <= this.canvasHeight;
    }

    // Stop all edge scrolling
    stopEdgeScroll() {
        this.scrollLeft = false;
        this.scrollRight = false;
        this.scrollUp = false;
        this.scrollDown = false;
    }

    // Start dragging
    startDrag(screenX, screenY) {
        this.dragging = true;
        this.dragStartX = screenX;
        this.dragStartY = screenY;
        this.dragCamStartX = this.x;
        this.dragCamStartY = this.y;
    }

    // Update drag
    updateDrag(screenX, screenY) {
        if (!this.dragging) return;
        this.x = this.dragCamStartX - (screenX - this.dragStartX);
        this.y = this.dragCamStartY - (screenY - this.dragStartY);
        this.clamp();
    }

    // End dragging
    endDrag() {
        this.dragging = false;
    }

    // Apply scroll per frame
    update() {
        let moved = false;
        if (this.scrollLeft) { this.x -= SCROLL_SPEED; moved = true; }
        if (this.scrollRight) { this.x += SCROLL_SPEED; moved = true; }
        if (this.scrollUp) { this.y -= SCROLL_SPEED; moved = true; }
        if (this.scrollDown) { this.y += SCROLL_SPEED; moved = true; }
        if (moved) this.clamp();
        return moved;
    }

    // Clamp camera to map bounds
    clamp() {
        const margin = HEX_SIZE * 2 * this.zoom;
        const minX = -margin;
        const minY = -margin;
        const maxX = Math.max(this.mapPixelWidth - this.canvasWidth + margin, minX);
        const maxY = Math.max(this.mapPixelHeight - this.canvasHeight + margin, minY);
        this.x = Math.max(minX, Math.min(maxX, this.x));
        this.y = Math.max(minY, Math.min(maxY, this.y));
    }

    // Check if a world-space rectangle is visible on screen
    isVisible(wx, wy, width, height) {
        const sx = (wx - this.x) * this.zoom;
        const sy = (wy - this.y) * this.zoom;
        const sw = width * this.zoom;
        const sh = height * this.zoom;
        return sx + sw > 0 && sx < this.canvasWidth && sy + sh > 0 && sy < this.canvasHeight;
    }
}
