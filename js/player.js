// Player model

import { PLAYER_COLORS } from './config.js';

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

// Calculate income from a single city
export function calculateCityIncome(city) {
    // Base income from population and economics, modified by tax rate
    const taxEfficiency = city.taxRate / 100;
    return city.population * (city.economics / 100) * taxEfficiency * 0.05;
}
