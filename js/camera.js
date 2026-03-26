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
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragCamStartX = 0;
        this.dragCamStartY = 0;
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

    // Convert screen coordinates to world coordinates
    screenToWorld(sx, sy) {
        return {
            x: sx + this.x,
            y: sy + this.y,
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
        const margin = HEX_SIZE * 2;
        const minX = -margin;
        const minY = -margin;
        const maxX = Math.max(this.mapPixelWidth - this.canvasWidth + margin, minX);
        const maxY = Math.max(this.mapPixelHeight - this.canvasHeight + margin, minY);
        this.x = Math.max(minX, Math.min(maxX, this.x));
        this.y = Math.max(minY, Math.min(maxY, this.y));
    }

    // Check if a world-space rectangle is visible on screen
    isVisible(wx, wy, width, height) {
        return (
            wx + width > this.x &&
            wx < this.x + this.canvasWidth &&
            wy + height > this.y &&
            wy < this.y + this.canvasHeight
        );
    }
}
