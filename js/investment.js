// Tax collection, investment allocation, city growth, revolt logic

import { REVOLT_THRESHOLD, getTechTier, getDifficulty } from './config.js';
import { getSectorTaxMultiplier } from './sectors.js';

// Collect taxes from all cities owned by a player.
// For AI players, apply difficulty-based tax multiplier.
export function collectTaxes(player, cities, sectors) {
    const gs = player._gameState;
    let totalIncome = 0;
    let taxMult = 1.0;

    // Determine difficulty multiplier for AI players
    if (!player.isHuman && gs && gs.difficulty) {
        taxMult = getDifficulty(gs.difficulty).taxMult;
    }

    for (const city of cities) {
        if (city.owner !== player.id) continue;

        let income = calculateCityTaxIncome(city);

        // Apply sector tax bonuses
        if (sectors) {
            const sectorMult = getSectorTaxMultiplier(city, sectors, player);
            income *= sectorMult;
        }

        income *= taxMult;

        totalIncome += income;

        // Tax impact on satisfaction
        if (city.taxRate > 50) {
            city.satisfaction = Math.max(0, city.satisfaction - (city.taxRate - 50) * 0.1);
        } else if (city.taxRate < 30) {
            city.satisfaction = Math.min(100, city.satisfaction + (30 - city.taxRate) * 0.05);
        }
    }

    player.treasury += Math.floor(totalIncome);
    return Math.floor(totalIncome);
}

export function calculateCityTaxIncome(city) {
    const taxEfficiency = city.taxRate / 100;
    return city.population * (city.economics / 100) * taxEfficiency * 0.05;
}

// Apply investment effects and grow cities at end of turn
// Returns array of notification events (tech upgrades, milestones)
// For AI-owned cities, difficulty growth/tech multipliers are applied.
export function applyCityGrowth(cities, gameState) {
    const events = [];

    // Determine difficulty multipliers
    let growthMult = 1.0, techMult = 1.0;
    if (gameState && gameState.difficulty) {
        const diff = getDifficulty(gameState.difficulty);
        growthMult = diff.growthMult;
        techMult = diff.techMult;
    }

    for (const city of cities) {
        if (city.owner === null) continue; // neutral cities don't grow

        // Per-city multipliers: AI cities get difficulty bonus, human cities get 1.0
        const owner = gameState && gameState.players ? gameState.players[city.owner] : null;
        const isAI = owner && !owner.isHuman;
        const cityGrowthMult = isAI ? growthMult : 1.0;
        const cityTechMult = isAI ? techMult : 1.0;

        const inv = city.investment;
        const oldTier = getTechTier(city.knowledge);

        // Base growth rate — knowledge accelerates at higher levels
        const growthRate = 0.02;
        // Knowledge grows without cap; higher knowledge = slightly faster research (compounding)
        const knowledgeAccel = 1 + city.knowledge * 0.001; // +0.1% per knowledge point
        city.knowledge += inv.knowledge * growthRate * 0.5 * knowledgeAccel * cityTechMult;

        // Defense and economics uncapped (but slower growth at high values)
        city.defense += inv.defense * growthRate * 0.5 * cityGrowthMult;
        city.economics += inv.economics * growthRate * 0.5 * cityGrowthMult;

        // Public benefit increases satisfaction (still capped at 100)
        city.satisfaction = Math.min(100, city.satisfaction + inv.public * growthRate * 0.3);

        // Tech tier bonus to economics
        const tier = getTechTier(city.knowledge);
        const econBoost = tier.econBonus * 0.5; // tech makes economy more efficient
        city.economics += econBoost;

        // Population growth — tech level accelerates growth
        const techPopBonus = 1 + tier.econBonus * 0.5;
        const growthFactor = (Math.min(city.economics, 200) * city.satisfaction) / 10000;
        const popGrowth = city.population * growthRate * growthFactor * techPopBonus * cityGrowthMult;
        city.population = Math.floor(city.population + popGrowth);

        // Garrison replenishes — scales with defense and tech
        const garrisonGrowth = (city.population * 0.002) * (Math.min(city.defense, 200) / 100) * (1 + tier.defBonus * 0.3) * cityGrowthMult;
        city.garrison = Math.floor(Math.min(city.population * 0.3, city.garrison + garrisonGrowth));

        // Check for tech tier upgrade
        if (tier.tier > oldTier.tier) {
            events.push({
                type: 'tech_upgrade',
                city,
                oldTier: oldTier,
                newTier: tier,
                message: `${city.name} reached ${tier.name} era! (Knowledge: ${Math.floor(city.knowledge)}) — ${tier.desc}`,
            });
        }
    }

    return events;
}

// Check for revolts in all owned cities
export function checkRevolts(cities, units) {
    const revoltMessages = [];

    for (const city of cities) {
        if (city.owner === null) continue;
        if (city.satisfaction >= REVOLT_THRESHOLD) continue;

        // Revolt probability increases as satisfaction drops below threshold
        const revoltChance = (REVOLT_THRESHOLD - city.satisfaction) * 3; // 0-60% chance
        const roll = Math.random() * 100;

        if (roll < revoltChance) {
            // Revolt! Deplete garrison
            const garrisonLoss = 0.3 + Math.random() * 0.4; // 30-70% loss
            const lost = Math.floor(city.garrison * garrisonLoss);
            city.garrison = Math.max(0, city.garrison - lost);

            // Also damage any defender units in the city
            const defenders = units.filter(u =>
                u.q === city.q && u.r === city.r && u.owner === city.owner
            );
            for (const def of defenders) {
                const troopLoss = Math.floor(def.troops * garrisonLoss * 0.5);
                def.troops = Math.max(1, def.troops - troopLoss);
            }

            // Satisfaction gets a small bump after revolt (people vented)
            city.satisfaction = Math.min(REVOLT_THRESHOLD + 5, city.satisfaction + 10);

            revoltMessages.push({
                cityName: city.name,
                owner: city.owner,
                garrisonLost: lost,
            });
        }
    }

    return revoltMessages;
}

// Set investment allocation for a city (must sum to 100)
export function setInvestment(city, defense, knowledge, publicBenefit, economics) {
    const total = defense + knowledge + publicBenefit + economics;
    if (total === 0) {
        city.investment = { defense: 25, knowledge: 25, public: 25, economics: 25 };
        return;
    }
    // Normalize to 100
    const scale = 100 / total;
    city.investment = {
        defense: Math.round(defense * scale),
        knowledge: Math.round(knowledge * scale),
        public: Math.round(publicBenefit * scale),
        economics: Math.round(economics * scale),
    };
}

// Set tax rate for a city (0-100)
export function setTaxRate(city, rate) {
    city.taxRate = Math.max(0, Math.min(100, rate));
}
