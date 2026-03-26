// Hex grid math using axial coordinates (q, r) with flat-top hexes
// Reference: Red Blob Games hex grid guide

import { HEX_SIZE, HEX_WIDTH, HEX_HEIGHT } from './config.js';

// Convert axial (q, r) to pixel center (x, y) for flat-top hexes
export function axialToPixel(q, r) {
    const x = HEX_SIZE * (3 / 2 * q);
    const y = HEX_SIZE * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r);
    return { x, y };
}

// Convert pixel (x, y) to axial (q, r) — returns fractional, needs rounding
export function pixelToAxial(x, y) {
    const q = (2 / 3 * x) / HEX_SIZE;
    const r = (-1 / 3 * x + Math.sqrt(3) / 3 * y) / HEX_SIZE;
    return axialRound(q, r);
}

// Round fractional axial coords to nearest hex
export function axialRound(q, r) {
    // Convert to cube coords for rounding
    const s = -q - r;
    let rq = Math.round(q);
    let rr = Math.round(r);
    let rs = Math.round(s);

    const dq = Math.abs(rq - q);
    const dr = Math.abs(rr - r);
    const ds = Math.abs(rs - s);

    if (dq > dr && dq > ds) {
        rq = -rr - rs;
    } else if (dr > ds) {
        rr = -rq - rs;
    }

    return { q: rq, r: rr };
}

// 6 neighbor directions for flat-top hexes (axial)
const DIRECTIONS = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
];

// Get the 6 neighboring hex coordinates
export function hexNeighbors(q, r) {
    return DIRECTIONS.map(d => ({ q: q + d.q, r: r + d.r }));
}

// Manhattan distance between two hexes (cube distance)
export function hexDistance(a, b) {
    // Convert axial to cube: s = -q - r
    const as = -a.q - a.r;
    const bs = -b.q - b.r;
    return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(as - bs));
}

// Get all hexes at exactly `radius` distance from center
export function hexRing(centerQ, centerR, radius) {
    if (radius === 0) return [{ q: centerQ, r: centerR }];

    const results = [];
    // Start at the hex `radius` steps in direction 4 (q-1, r+1)
    let q = centerQ + DIRECTIONS[4].q * radius;
    let r = centerR + DIRECTIONS[4].r * radius;

    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < radius; j++) {
            results.push({ q, r });
            q += DIRECTIONS[i].q;
            r += DIRECTIONS[i].r;
        }
    }
    return results;
}

// Get all hexes within `radius` distance from center (filled circle)
export function hexesInRange(centerQ, centerR, radius) {
    const results = [];
    for (let q = -radius; q <= radius; q++) {
        const r1 = Math.max(-radius, -q - radius);
        const r2 = Math.min(radius, -q + radius);
        for (let r = r1; r <= r2; r++) {
            results.push({ q: centerQ + q, r: centerR + r });
        }
    }
    return results;
}

// Get the 6 corner points of a flat-top hex for drawing
export function hexCorners(centerX, centerY) {
    const corners = [];
    for (let i = 0; i < 6; i++) {
        const angleDeg = 60 * i;
        const angleRad = Math.PI / 180 * angleDeg;
        corners.push({
            x: centerX + HEX_SIZE * Math.cos(angleRad),
            y: centerY + HEX_SIZE * Math.sin(angleRad),
        });
    }
    return corners;
}

// Create a hex key string for use as map keys
export function hexKey(q, r) {
    return `${q},${r}`;
}

// Parse a hex key string back to coordinates
export function parseHexKey(key) {
    const [q, r] = key.split(',').map(Number);
    return { q, r };
}

// Line draw between two hexes (for pathfinding visualization)
export function hexLineDraw(a, b) {
    const dist = hexDistance(a, b);
    if (dist === 0) return [{ q: a.q, r: a.r }];

    const results = [];
    for (let i = 0; i <= dist; i++) {
        const t = i / dist;
        // Nudge slightly to avoid ambiguous rounding at edges
        const q = a.q + (b.q - a.q) * t + 1e-6;
        const r = a.r + (b.r - a.r) * t + 1e-6;
        const rounded = axialRound(q, r);
        results.push(rounded);
    }
    return results;
}
