// Map generation: continent shape, terrain, city placement

import { TERRAIN, DEFAULT_MAP_WIDTH, DEFAULT_MAP_HEIGHT, DEFAULT_CITY_COUNT, DEFAULT_LAND_RATIO } from './config.js';
import { hexNeighbors, hexKey, hexDistance } from './hex.js';
import { generateCityNames } from './utils.js';

// Generate the game map
export function generateMap(rng, options = {}) {
    const width = options.width || DEFAULT_MAP_WIDTH;
    const height = options.height || DEFAULT_MAP_HEIGHT;
    const cityCount = options.cityCount || DEFAULT_CITY_COUNT;
    const landRatio = options.landRatio || DEFAULT_LAND_RATIO;

    const tiles = new Map(); // hexKey -> { q, r, terrain, city }

    // Initialize all tiles as ocean
    for (let q = 0; q < width; q++) {
        for (let r = 0; r < height; r++) {
            const key = hexKey(q, r);
            tiles.set(key, { q, r, terrain: TERRAIN.OCEAN, city: null });
        }
    }

    // Generate continent via flood-fill from center
    const centerQ = Math.floor(width / 2);
    const centerR = Math.floor(height / 2);
    const targetLandCount = Math.floor(width * height * landRatio);

    const landTiles = new Set();
    const frontier = [];

    // Seed the center
    const centerKey = hexKey(centerQ, centerR);
    landTiles.add(centerKey);
    addFrontier(centerQ, centerR, frontier, landTiles, width, height);

    // Grow the continent
    while (landTiles.size < targetLandCount && frontier.length > 0) {
        // Pick a random frontier tile (weighted toward tiles with more land neighbors)
        const idx = rng.nextInt(0, Math.min(frontier.length - 1, Math.floor(frontier.length * 0.7)));
        const tile = frontier.splice(idx, 1)[0];
        const key = hexKey(tile.q, tile.r);

        if (landTiles.has(key)) continue;

        // Accept based on number of land neighbors (more neighbors = more likely)
        const neighbors = hexNeighbors(tile.q, tile.r);
        const landNeighborCount = neighbors.filter(n => landTiles.has(hexKey(n.q, n.r))).length;
        const acceptChance = 0.3 + landNeighborCount * 0.15;

        if (rng.next() < acceptChance) {
            landTiles.add(key);
            addFrontier(tile.q, tile.r, frontier, landTiles, width, height);
        } else {
            // Put it back at a random position
            frontier.splice(rng.nextInt(0, frontier.length), 0, tile);
        }
    }

    // Smoothing pass: remove isolated ocean tiles inside continent, fill peninsulas
    for (let pass = 0; pass < 2; pass++) {
        for (let q = 0; q < width; q++) {
            for (let r = 0; r < height; r++) {
                const key = hexKey(q, r);
                const neighbors = hexNeighbors(q, r).filter(n =>
                    n.q >= 0 && n.q < width && n.r >= 0 && n.r < height
                );
                const landCount = neighbors.filter(n => landTiles.has(hexKey(n.q, n.r))).length;

                if (!landTiles.has(key) && landCount >= 4) {
                    landTiles.add(key); // Fill isolated ocean holes
                } else if (landTiles.has(key) && landCount <= 1) {
                    landTiles.delete(key); // Remove tiny peninsulas
                }
            }
        }
    }

    // Assign terrain types to land tiles
    for (const key of landTiles) {
        const tile = tiles.get(key);
        if (!tile) continue;
        tile.terrain = assignTerrain(tile.q, tile.r, rng, width, height);
    }

    // Place cities using Poisson-disk-like sampling
    const cities = placeCities(rng, tiles, landTiles, cityCount, width, height);

    return { tiles, cities, width, height };
}

function addFrontier(q, r, frontier, landTiles, width, height) {
    const neighbors = hexNeighbors(q, r);
    for (const n of neighbors) {
        if (n.q >= 1 && n.q < width - 1 && n.r >= 1 && n.r < height - 1) {
            const key = hexKey(n.q, n.r);
            if (!landTiles.has(key)) {
                frontier.push(n);
            }
        }
    }
}

function assignTerrain(q, r, rng, width, height) {
    // Simple noise-like terrain assignment
    const roll = rng.next();
    // Mountains more likely near center, forests on edges
    const distFromCenter = Math.sqrt(
        Math.pow(q - width / 2, 2) + Math.pow(r - height / 2, 2)
    );
    const maxDist = Math.sqrt(Math.pow(width / 2, 2) + Math.pow(height / 2, 2));
    const centralness = 1 - distFromCenter / maxDist;

    if (roll < 0.05 + centralness * 0.1) return TERRAIN.MOUNTAIN;
    if (roll < 0.2 + centralness * 0.05) return TERRAIN.HILLS;
    if (roll < 0.35) return TERRAIN.FOREST;
    return TERRAIN.PLAINS;
}

function placeCities(rng, tiles, landTiles, count, width, height) {
    const landArray = Array.from(landTiles);
    rng.shuffle(landArray);

    const cities = [];
    const cityNames = generateCityNames(count, rng);
    const minDistance = 3; // minimum hex distance between cities

    for (const key of landArray) {
        if (cities.length >= count) break;

        const tile = tiles.get(key);
        if (!tile || tile.terrain === TERRAIN.MOUNTAIN) continue; // no cities on mountains

        // Check minimum distance from existing cities
        const tooClose = cities.some(c => hexDistance(tile, c) < minDistance);
        if (tooClose) continue;

        const city = {
            id: cities.length,
            name: cityNames[cities.length],
            q: tile.q,
            r: tile.r,
            owner: null, // null = neutral
            population: rng.nextInt(500, 5000),
            knowledge: rng.nextInt(10, 60),
            defense: rng.nextInt(10, 60),
            economics: rng.nextInt(10, 60),
            satisfaction: rng.nextInt(40, 80),
            garrison: rng.nextInt(50, 300),
            investment: { defense: 25, knowledge: 25, public: 25, economics: 25 },
            taxRate: 30,
        };

        tile.city = city;
        cities.push(city);
    }

    return cities;
}
