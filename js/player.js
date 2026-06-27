// Player model

import { PLAYER_COLORS, SCORE } from './config.js';

export class Player {
    constructor(id, name, isHuman = false, personality = null) {
        this.id = id;
        this.name = name;
        this.isHuman = isHuman;
        this.personality = personality; // AI personality preset or null for human
        this.treasury = 500;
        this.homeCityId = null;
        this.alive = true;
        this.color = PLAYER_COLORS[id] || '#888';
        this._score = 0;
        this._scoreLog = []; // score events for HUD notification
    }

    // Award points for a scored event. reason is a human-readable string.
    awardScore(points, reason) {
        this._score += points;
        this._scoreLog.push({ points, reason });
        return this._score;
    }

    get score() {
        return this._score;
    }

    // Consume and return accumulated score events
    consumeScoreLog() {
        const log = this._scoreLog;
        this._scoreLog = [];
        return log;
    }

    // Get all cities owned by this player
    getCities(cities) {
        return cities.filter(c => c.owner === this.id);
    }

    // Get all units owned by this player
    getUnits(units) {
        return units.filter(u => u.owner === this.id);
    }

    // Get total income from all owned cities
    getTotalIncome(cities) {
        let income = 0;
        for (const city of this.getCities(cities)) {
            income += calculateCityIncome(city);
        }
        return Math.floor(income);
    }
}

// ─── Hall of Fame (localStorage top-5 scores) ──────────────────────
const HOF_KEY = 'warfare_hof';
const HOF_MAX = 5;

export function getHallOfFame() {
    try {
        const raw = localStorage.getItem(HOF_KEY);
        if (!raw) return [];
        const data = JSON.parse(raw);
        return Array.isArray(data) ? data.slice(0, HOF_MAX) : [];
    } catch {
        return [];
    }
}

// Try to add a score to the Hall of Fame.
// Returns { hall: [...], qualified: boolean }
export function addToHallOfFame(name, score, difficulty, turns) {
    const entries = getHallOfFame();
    const entry = { name, score, difficulty, turns, date: Date.now() };

    entries.push(entry);
    entries.sort((a, b) => b.score - a.score);

    const qualified = entries.indexOf(entry) < HOF_MAX;
    const trimmed = entries.slice(0, HOF_MAX);
    try {
        localStorage.setItem(HOF_KEY, JSON.stringify(trimmed));
    } catch {
        // localStorage unavailable — return in-memory list
    }
    return { hall: trimmed, qualified };
}

// Calculate income from a single city
export function calculateCityIncome(city) {
    // Base income from population and economics, modified by tax rate
    const taxEfficiency = city.taxRate / 100;
    return city.population * (city.economics / 100) * taxEfficiency * 0.05;
}
