// Animation system — manages all game world animations
// Handles: unit movement slides, combat flashes, screen shake,
// particle effects, selection pulse, spawn/death animations, fade transitions

import { axialToPixel } from './hex.js';

// ─── Easing functions ─────────────────────────────────────────────
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function easeOutElastic(t) {
    const c4 = (2 * Math.PI) / 3;
    if (t === 0) return 0;
    if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}
function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }
function lerp(a, b, t) { return a + (b - a) * t; }

// ─── Active effect holders ──────────────────────────────────────
// These are read by the renderer each frame. The AnimationManager
// updates them; the renderer draws them.
const effects = {
    // unitId -> { fromX, fromY, toX, toY, start, duration, easing }
    unitMoves: new Map(),
    // unit position overrides: unitId -> { x, y } (pixel coords)
    unitOffsets: new Map(),
    // screen shake: { intensity, start, duration }
    screenShake: null,
    // particle list: [{ x, y, vx, vy, life, maxLife, color, size, type }]
    particles: [],
    // flash overlays: [{ x, y, radius, color, start, duration, type }]
    flashes: [],
    // hex ripples: [{ q, r, start, duration, color }]
    ripples: [],
    // hex highlights (animated): [{ q, r, start, duration, color, fill, lineWidth, pulse }]
    hexPulses: [],
    // fade transitions: { color, start, duration, mode } mode='in'|'out'
    fade: null,
    // combat shake for specific units: unitId -> { intensity, start, duration }
    unitShakes: new Map(),
    // spawn animations: unitId -> { start, duration }
    spawns: new Map(),
    // death animations: unitId -> { start, duration, x, y, color }
    deaths: new Map(),
    // floating text: [{ x, y, text, color, start, duration, vy }]
    floaters: [],
};

// Unique ID counter for anonymous units (fallback)
let _animId = 0;
function getUnitId(unit) {
    if (unit.id !== undefined) return unit.id;
    if (unit._animId !== undefined) return unit._animId;
    unit._animId = --_animId;
    return unit._animId;
}

// ─── AnimationManager ────────────────────────────────────────────
export class AnimationManager {
    constructor() {
        this.enabled = true;
        this.speed = 1.0; // global speed multiplier
    }

    // ── Movement slide ──
    // Animate a unit sliding from one hex to another
    slideUnit(unit, fromQ, fromR, toQ, toR, duration = 350) {
        if (!this.enabled) return;
        const id = getUnitId(unit);
        const from = axialToPixel(fromQ, fromR);
        const to = axialToPixel(toQ, toR);
        effects.unitMoves.set(id, {
            fromX: from.x, fromY: from.y,
            toX: to.x, toY: to.y,
            start: performance.now(),
            duration: duration / this.speed,
            easing: easeInOutCubic,
        });
    }

    // Get the animated pixel offset for a unit (or null if not animating)
    getUnitOffset(unit) {
        const id = getUnitId(unit);
        const move = effects.unitMoves.get(id);
        if (move) {
            const elapsed = performance.now() - move.start;
            if (elapsed >= move.duration) {
                effects.unitMoves.delete(id);
                return null;
            }
            const t = elapsed / move.duration;
            const e = move.easing(t);
            return {
                x: lerp(move.fromX, move.toX, e),
                y: lerp(move.fromY, move.toY, e),
            };
        }

        // Check for spawn animation (scale up from 0)
        const spawn = effects.spawns.get(id);
        if (spawn) {
            const elapsed = performance.now() - spawn.start;
            if (elapsed >= spawn.duration) {
                effects.spawns.delete(id);
            } else {
                return { spawning: true, progress: elapsed / spawn.duration };
            }
        }

        // Check for death animation
        const death = effects.deaths.get(id);
        if (death) {
            const elapsed = performance.now() - death.start;
            if (elapsed >= death.duration) {
                effects.deaths.delete(id);
            } else {
                return { dying: true, progress: elapsed / death.duration };
            }
        }

        // Check for unit shake
        const shake = effects.unitShakes.get(id);
        if (shake) {
            const elapsed = performance.now() - shake.start;
            if (elapsed >= shake.duration) {
                effects.unitShakes.delete(id);
            } else {
                const intensity = shake.intensity * (1 - elapsed / shake.duration);
                return {
                    shakeX: (Math.random() - 0.5) * intensity * 2,
                    shakeY: (Math.random() - 0.5) * intensity * 2,
                };
            }
        }

        return null;
    }

    // ── Screen shake ──
    shakeScreen(intensity = 8, duration = 400) {
        if (!this.enabled) return;
        effects.screenShake = {
            intensity,
            start: performance.now(),
            duration: duration / this.speed,
        };
    }

    getScreenShake() {
        if (!effects.screenShake) return { x: 0, y: 0 };
        const elapsed = performance.now() - effects.screenShake.start;
        if (elapsed >= effects.screenShake.duration) {
            effects.screenShake = null;
            return { x: 0, y: 0 };
        }
        const t = elapsed / effects.screenShake.duration;
        const decay = 1 - t;
        const intensity = effects.screenShake.intensity * decay;
        return {
            x: (Math.random() - 0.5) * intensity * 2,
            y: (Math.random() - 0.5) * intensity * 2,
        };
    }

    // ── Unit shake (combat recoil) ──
    shakeUnit(unit, intensity = 5, duration = 300) {
        if (!this.enabled) return;
        const id = getUnitId(unit);
        effects.unitShakes.set(id, {
            intensity,
            start: performance.now(),
            duration: duration / this.speed,
        });
    }

    // ── Combat flash ──
    // Flashes a bright expanding ring at a hex location
    combatFlash(q, r, color = '#ffff66', big = false) {
        if (!this.enabled) return;
        const { x, y } = axialToPixel(q, r);
        effects.flashes.push({
            x, y,
            radius: 0,
            maxRadius: big ? 120 : 70,
            color,
            start: performance.now(),
            duration: (big ? 600 : 400) / this.speed,
            type: 'combat',
        });

        // Add sparks/particles flying outward
        const sparkCount = big ? 20 : 12;
        for (let i = 0; i < sparkCount; i++) {
            const angle = (Math.PI * 2 * i) / sparkCount + Math.random() * 0.5;
            const speed = 0.08 + Math.random() * 0.15;
            effects.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0,
                maxLife: 400 + Math.random() * 300,
                color: i % 3 === 0 ? '#ff6600' : (i % 3 === 1 ? '#ffaa00' : '#ffff66'),
                size: 2 + Math.random() * 3,
                type: 'spark',
                start: performance.now(),
            });
        }
    }

    // ── City capture flash (golden) ──
    captureFlash(q, r, color = '#ffd700') {
        if (!this.enabled) return;
        const { x, y } = axialToPixel(q, r);
        effects.flashes.push({
            x, y,
            radius: 0,
            maxRadius: 100,
            color,
            start: performance.now(),
            duration: 700 / this.speed,
            type: 'capture',
        });

        // Expanding ripple
        effects.ripples.push({
            q, r,
            start: performance.now(),
            duration: 800 / this.speed,
            color,
        });

        // Golden particles rising
        for (let i = 0; i < 16; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.03 + Math.random() * 0.06;
            effects.particles.push({
                x: x + (Math.random() - 0.5) * 20,
                y: y + (Math.random() - 0.5) * 20,
                vx: Math.cos(angle) * speed * 0.5,
                vy: -0.05 - Math.random() * 0.08, // rise upward
                life: 0,
                maxLife: 600 + Math.random() * 400,
                color: Math.random() < 0.5 ? '#ffd700' : '#fff8aa',
                size: 2 + Math.random() * 3,
                type: 'rise',
                start: performance.now(),
            });
        }
    }

    // ── Explosion / death effect ──
    explosion(q, r, color = '#ff4444') {
        if (!this.enabled) return;
        const { x, y } = axialToPixel(q, r);

        // Central expanding flash
        effects.flashes.push({
            x, y,
            radius: 0,
            maxRadius: 90,
            color,
            start: performance.now(),
            duration: 500 / this.speed,
            type: 'explosion',
        });

        // Red/orange particles flying outward
        for (let i = 0; i < 24; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.1 + Math.random() * 0.2;
            effects.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0,
                maxLife: 500 + Math.random() * 500,
                color: i % 2 === 0 ? '#ff3333' : '#ff8800',
                size: 2 + Math.random() * 4,
                type: 'spark',
                start: performance.now(),
            });
        }

        // Smoke
        for (let i = 0; i < 8; i++) {
            const angle = Math.random() * Math.PI * 2;
            effects.particles.push({
                x: x + (Math.random() - 0.5) * 15,
                y: y + (Math.random() - 0.5) * 15,
                vx: Math.cos(angle) * 0.03,
                vy: -0.04 - Math.random() * 0.04,
                life: 0,
                maxLife: 800 + Math.random() * 400,
                color: '#666666',
                size: 6 + Math.random() * 8,
                type: 'smoke',
                start: performance.now(),
            });
        }
    }

    // ── Unit death animation ──
    unitDeath(unit) {
        if (!this.enabled) return;
        const id = getUnitId(unit);
        const { x, y } = axialToPixel(unit.q, unit.r);
        const color = unit.owner !== undefined ? '#ff4444' : '#888';
        effects.deaths.set(id, {
            start: performance.now(),
            duration: 400 / this.speed,
            x, y,
            color,
        });
    }

    // ── Unit spawn animation (scale up with bounce) ──
    unitSpawn(unit) {
        if (!this.enabled) return;
        const id = getUnitId(unit);
        effects.spawns.set(id, {
            start: performance.now(),
            duration: 400 / this.speed,
        });
    }

    // ── Hex pulse (for selection, hover, movement range highlight) ──
    hexPulse(q, r, color = '#ffffff', duration = 1000, fill = false, lineWidth = 2) {
        if (!this.enabled) return;
        effects.hexPulses.push({
            q, r,
            color,
            start: performance.now(),
            duration: duration / this.speed,
            fill,
            lineWidth,
            pulse: true,
        });
    }

    // ── Fade transition (full screen) ──
    // mode: 'in' = fade from color to transparent, 'out' = fade to color
    fadeIn(color = '#000000', duration = 600) {
        effects.fade = {
            color,
            start: performance.now(),
            duration: duration / this.speed,
            mode: 'in',
        };
    }

    fadeOut(color = '#000000', duration = 600) {
        effects.fade = {
            color,
            start: performance.now(),
            duration: duration / this.speed,
            mode: 'out',
        };
    }

    // ── Floating text (damage numbers, notifications) ──
    floatText(q, r, text, color = '#ffff66', duration = 1200) {
        if (!this.enabled) return;
        const { x, y } = axialToPixel(q, r);
        effects.floaters.push({
            x, y: y - 15,
            text,
            color,
            start: performance.now(),
            duration: duration / this.speed,
            vy: -0.04, // drift upward
        });
    }

    // ── Selection pulse (continuous, called each frame for selected unit) ──
    // Returns a pulse value 0..1 for scale/glow
    getSelectionPulse() {
        const t = (performance.now() / 800) % 1;
        return (Math.sin(t * Math.PI * 2) + 1) / 2; // 0..1 smooth sine
    }

    // ── Update particles and effects (called every frame) ──
    update() {
        const now = performance.now();

        // Update particles
        for (let i = effects.particles.length - 1; i >= 0; i--) {
            const p = effects.particles[i];
            const elapsed = now - p.start;
            if (elapsed >= p.maxLife) {
                effects.particles.splice(i, 1);
                continue;
            }
            // Update position based on velocity and elapsed time
            const dt = elapsed; // ms since start
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            // Apply gravity to sparks
            if (p.type === 'spark' && elapsed > p.maxLife * 0.3) {
                p.vy += 0.0003 * dt; // gravity
            }
        }

        // Clean up old flashes
        for (let i = effects.flashes.length - 1; i >= 0; i--) {
            if (now - effects.flashes[i].start >= effects.flashes[i].duration) {
                effects.flashes.splice(i, 1);
            }
        }

        // Clean up old ripples
        for (let i = effects.ripples.length - 1; i >= 0; i--) {
            if (now - effects.ripples[i].start >= effects.ripples[i].duration) {
                effects.ripples.splice(i, 1);
            }
        }

        // Clean up old hex pulses
        for (let i = effects.hexPulses.length - 1; i >= 0; i--) {
            if (now - effects.hexPulses[i].start >= effects.hexPulses[i].duration) {
                effects.hexPulses.splice(i, 1);
            }
        }

        // Clean up old floaters
        for (let i = effects.floaters.length - 1; i >= 0; i--) {
            if (now - effects.floaters[i].start >= effects.floaters[i].duration) {
                effects.floaters.splice(i, 1);
            }
        }

        // Clean up fade
        if (effects.fade && now - effects.fade.start >= effects.fade.duration) {
            effects.fade = null;
        }
    }

    // ── Draw all effects (called by renderer after main world draw, before HUD) ──
    drawEffects(ctx, camera) {
        const now = performance.now();

        // ── Particles ──
        for (const p of effects.particles) {
            const elapsed = now - p.start;
            const lifeT = elapsed / p.maxLife;
            if (lifeT >= 1) continue;

            const alpha = p.type === 'smoke' ? (1 - lifeT) * 0.4 : (1 - lifeT);
            const size = p.type === 'smoke' ? p.size * (1 + lifeT) : p.size * (1 - lifeT * 0.5);

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(0.5, size), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // ── Flashes (expanding rings) ──
        for (const f of effects.flashes) {
            const elapsed = now - f.start;
            const t = elapsed / f.duration;
            if (t >= 1) continue;

            const radius = lerp(0, f.maxRadius, easeOutQuart(t));
            const alpha = (1 - t) * (f.type === 'explosion' ? 0.8 : 0.6);

            ctx.save();
            ctx.globalAlpha = alpha;

            // Main ring
            ctx.strokeStyle = f.color;
            ctx.lineWidth = 3 * (1 - t * 0.5);
            ctx.beginPath();
            ctx.arc(f.x, f.y, Math.max(0.5, radius), 0, Math.PI * 2);
            ctx.stroke();

            // Inner glow ring for combat/explosion
            if (f.type === 'combat' || f.type === 'explosion') {
                ctx.globalAlpha = alpha * 0.4;
                ctx.lineWidth = 8 * (1 - t);
                ctx.beginPath();
                ctx.arc(f.x, f.y, Math.max(0.5, radius * 0.7), 0, Math.PI * 2);
                ctx.stroke();
            }

            // Capture: golden fill
            if (f.type === 'capture') {
                ctx.globalAlpha = alpha * 0.15;
                ctx.fillStyle = f.color;
                ctx.beginPath();
                ctx.arc(f.x, f.y, Math.max(0.5, radius), 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }

        // ── Ripples ──
        for (const ripple of effects.ripples) {
            const elapsed = now - ripple.start;
            const t = elapsed / ripple.duration;
            if (t >= 1) continue;

            const { x, y } = axialToPixel(ripple.q, ripple.r);
            const radius = lerp(40, 140, easeOutCubic(t));
            const alpha = (1 - t) * 0.5;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = ripple.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, Math.max(0.5, radius), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // ── Hex pulses ──
        for (const pulse of effects.hexPulses) {
            const elapsed = now - pulse.start;
            const t = elapsed / pulse.duration;
            if (t >= 1) continue;

            // TODO: draw pulsing hex outline
        }

        // ── Floaters (floating text) ──
        for (const f of effects.floaters) {
            const elapsed = now - f.start;
            const t = elapsed / f.duration;
            if (t >= 1) continue;

            const yOff = -20 * easeOutCubic(t);
            const alpha = t < 0.8 ? 1 : (1 - t) / 0.2;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = f.color;
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeText(f.text, f.x, f.y + yOff);
            ctx.fillText(f.text, f.x, f.y + yOff);
            ctx.restore();
        }
    }

    // ── Draw death animations (called within drawUnits) ──
    // Returns true if a unit is currently dying
    isDying(unit) {
        const id = getUnitId(unit);
        return effects.deaths.has(id);
    }

    // ── Draw fade overlay (called after everything else) ──
    drawFade(ctx, canvasWidth, canvasHeight) {
        if (!effects.fade) return;
        const elapsed = performance.now() - effects.fade.start;
        const t = elapsed / effects.fade.duration;
        if (t >= 1) return;

        const alpha = effects.fade.mode === 'in' ? (1 - t) : t;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = effects.fade.color;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.restore();
    }

    // ── Clear all effects ──
    clear() {
        effects.unitMoves.clear();
        effects.unitOffsets.clear();
        effects.screenShake = null;
        effects.particles = [];
        effects.flashes = [];
        effects.ripples = [];
        effects.hexPulses = [];
        effects.fade = null;
        effects.unitShakes.clear();
        effects.spawns.clear();
        effects.deaths.clear();
        effects.floaters = [];
    }

    // ── Check if any movement animation is active ──
    isAnimating() {
        return effects.unitMoves.size > 0;
    }

    // ── Wait for all movement animations to finish ──
    async waitForAnimations() {
        while (effects.unitMoves.size > 0) {
            await new Promise(resolve => setTimeout(resolve, 16));
        }
    }
}

// ── Singleton ─────────────────────────────────────────────────────
export const animationManager = new AnimationManager();