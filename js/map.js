// Map generation: continent shape, terrain, city placement, islands, bridges

import { TERRAIN, DEFAULT_MAP_WIDTH, DEFAULT_MAP_HEIGHT, DEFAULT_CITY_COUNT, DEFAULT_LAND_RATIO } from './config.js';
import { hexNeighbors, hexKey, hexDistance } from './hex.js';
import { generateCityNames } from './utils.js';

// Generate the game map
export function generateMap(rng, options = {}) {
    const width = options.width || DEFAULT_MAP_WIDTH;
    const height = options.height || DEFAULT_MAP_HEIGHT;
    const cityCount = options.cityCount || DEFAULT_CITY_COUNT;
    const landRatio = options.landRatio || DEFAULT_LAND_RATIO;

    // Add ocean padding around the map edges so water shows on all sides
    const padding = 4;
    const totalWidth = width + padding * 2;
    const totalHeight = height + padding * 2;

    const tiles = new Map(); // hexKey -> { q, r, terrain, city }

    // Initialize all tiles as ocean (including padding border)
    for (let q = -padding; q < width + padding; q++) {
        for (let r = -padding; r < height + padding; r++) {
            const key = hexKey(q, r);
            tiles.set(key, { q, r, terrain: TERRAIN.OCEAN, city: null });
        }
    }

    // Generate main continent via flood-fill from center
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
        const idx = rng.nextInt(0, Math.min(frontier.length - 1, Math.floor(frontier.length * 0.7)));
        const tile = frontier.splice(idx, 1)[0];
        const key = hexKey(tile.q, tile.r);

        if (landTiles.has(key)) continue;

        const neighbors = hexNeighbors(tile.q, tile.r);
        const landNeighborCount = neighbors.filter(n => landTiles.has(hexKey(n.q, n.r))).length;
        const acceptChance = 0.3 + landNeighborCount * 0.15;

        if (rng.next() < acceptChance) {
            landTiles.add(key);
            addFrontier(tile.q, tile.r, frontier, landTiles, width, height);
        } else {
            frontier.splice(rng.nextInt(0, frontier.length), 0, tile);
        }
    }

    // Smoothing pass
    for (let pass = 0; pass < 2; pass++) {
        for (let q = 0; q < width; q++) {
            for (let r = 0; r < height; r++) {
                const key = hexKey(q, r);
                const neighbors = hexNeighbors(q, r).filter(n =>
                    n.q >= 0 && n.q < width && n.r >= 0 && n.r < height
                );
                const landCount = neighbors.filter(n => landTiles.has(hexKey(n.q, n.r))).length;

                if (!landTiles.has(key) && landCount >= 4) {
                    landTiles.add(key);
                } else if (landTiles.has(key) && landCount <= 1) {
                    landTiles.delete(key);
                }
            }
        }
    }

    // Generate islands in the ocean
    const islandTiles = generateIslands(rng, tiles, landTiles, width, height);
    for (const key of islandTiles) {
        landTiles.add(key);
    }

    // Assign terrain types to land tiles
    for (const key of landTiles) {
        const tile = tiles.get(key);
        if (!tile) continue;
        tile.terrain = assignTerrain(tile.q, tile.r, rng, width, height, landTiles);
    }

    // Add swamps near coastlines
    addSwamps(rng, tiles, landTiles, width, height);

    // Build bridges connecting islands to mainland/other islands
    buildBridges(rng, tiles, landTiles, width, height);

    // Place cities using Poisson-disk-like sampling with wider spacing
    const minCityDist = Math.max(4, Math.floor(Math.sqrt(width * height / cityCount) * 0.6));
    const cities = placeCities(rng, tiles, landTiles, cityCount, width, height, minCityDist);

    return { tiles, cities, width: totalWidth, height: totalHeight };
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

// Generate 3-6 islands scattered in ocean areas
function generateIslands(rng, tiles, mainlandTiles, width, height) {
    const islandTiles = new Set();
    const islandCount = rng.nextInt(3, 6);

    for (let i = 0; i < islandCount; i++) {
        // Find a seed point in ocean, at least 4 hexes from mainland
        let seedQ, seedR, attempts = 0;
        do {
            seedQ = rng.nextInt(3, width - 4);
            seedR = rng.nextInt(3, height - 4);
            attempts++;
        } while (attempts < 200 && (
            mainlandTiles.has(hexKey(seedQ, seedR)) ||
            islandTiles.has(hexKey(seedQ, seedR)) ||
            isNearLand(seedQ, seedR, mainlandTiles, 3)
        ));

        if (attempts >= 200) continue;

        // Grow a small island (5-20 tiles)
        const targetSize = rng.nextInt(5, 20);
        const island = new Set();
        const front = [];

        island.add(hexKey(seedQ, seedR));
        islandTiles.add(hexKey(seedQ, seedR));

        const seedNeighbors = hexNeighbors(seedQ, seedR);
        for (const n of seedNeighbors) {
            if (n.q >= 1 && n.q < width - 1 && n.r >= 1 && n.r < height - 1) {
                front.push(n);
            }
        }

        while (island.size < targetSize && front.length > 0) {
            const idx = rng.nextInt(0, front.length - 1);
            const t = front.splice(idx, 1)[0];
            const key = hexKey(t.q, t.r);

            if (island.has(key) || mainlandTiles.has(key)) continue;

            island.add(key);
            islandTiles.add(key);

            const ns = hexNeighbors(t.q, t.r);
            for (const n of ns) {
                if (n.q >= 1 && n.q < width - 1 && n.r >= 1 && n.r < height - 1 &&
                    !island.has(hexKey(n.q, n.r)) && !mainlandTiles.has(hexKey(n.q, n.r))) {
                    front.push(n);
                }
            }
        }
    }

    return islandTiles;
}

function isNearLand(q, r, landTiles, dist) {
    for (let dq = -dist; dq <= dist; dq++) {
        for (let dr = -dist; dr <= dist; dr++) {
            if (landTiles.has(hexKey(q + dq, r + dr))) return true;
        }
    }
    return false;
}

function assignTerrain(q, r, rng, width, height, landTiles) {
    const roll = rng.next();
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

// Add swamp tiles along coastlines (land tiles adjacent to ocean)
function addSwamps(rng, tiles, landTiles, width, height) {
    const coastTiles = [];

    for (const key of landTiles) {
        const tile = tiles.get(key);
        if (!tile || tile.terrain === TERRAIN.MOUNTAIN) continue;

        const neighbors = hexNeighbors(tile.q, tile.r);
        const hasOceanNeighbor = neighbors.some(n => {
            const nKey = hexKey(n.q, n.r);
            const nTile = tiles.get(nKey);
            return nTile && nTile.terrain === TERRAIN.OCEAN;
        });

        if (hasOceanNeighbor) coastTiles.push(tile);
    }

    // Convert ~20% of coastal tiles to swamp
    for (const tile of coastTiles) {
        if (rng.next() < 0.20 && tile.terrain === TERRAIN.PLAINS) {
            tile.terrain = TERRAIN.SWAMP;
        }
    }
}

// Build bridges: find closest points between disconnected land masses and connect them
function buildBridges(rng, tiles, landTiles, width, height) {
    // Find connected components of land
    const components = findLandComponents(tiles, landTiles, width, height);
    if (components.length <= 1) return;

    // For each pair of components, find the shortest ocean gap and bridge it
    const bridged = new Set([0]); // start with the largest component
    const unbridged = new Set(components.map((_, i) => i).filter(i => i > 0));

    while (unbridged.size > 0) {
        let bestDist = Infinity;
        let bestFrom = null;
        let bestTo = null;
        let bestCompIdx = -1;

        for (const bIdx of bridged) {
            for (const uIdx of unbridged) {
                // Sample edges of each component to find closest pair
                const fromEdges = getComponentEdges(components[bIdx], tiles);
                const toEdges = getComponentEdges(components[uIdx], tiles);

                for (const from of fromEdges) {
                    for (const to of toEdges) {
                        const d = hexDistance(from, to);
                        if (d < bestDist && d >= 2 && d <= 8) {
                            bestDist = d;
                            bestFrom = from;
                            bestTo = to;
                            bestCompIdx = uIdx;
                        }
                    }
                }
            }
        }

        if (bestFrom && bestTo && bestCompIdx >= 0) {
            // Build bridge tiles between the two points
            buildBridgePath(tiles, bestFrom, bestTo);
            bridged.add(bestCompIdx);
            unbridged.delete(bestCompIdx);
        } else {
            // Can't bridge remaining components (too far apart), skip
            break;
        }
    }
}

function findLandComponents(tiles, landTiles, width, height) {
    const visited = new Set();
    const components = [];

    for (const key of landTiles) {
        if (visited.has(key)) continue;

        const component = [];
        const queue = [key];
        visited.add(key);

        while (queue.length > 0) {
            const current = queue.shift();
            const tile = tiles.get(current);
            if (!tile) continue;
            component.push({ q: tile.q, r: tile.r });

            const neighbors = hexNeighbors(tile.q, tile.r);
            for (const n of neighbors) {
                const nKey = hexKey(n.q, n.r);
                if (landTiles.has(nKey) && !visited.has(nKey)) {
                    visited.add(nKey);
                    queue.push(nKey);
                }
            }
        }

        components.push(component);
    }

    // Sort by size descending (largest = mainland)
    components.sort((a, b) => b.length - a.length);
    return components;
}

function getComponentEdges(component, tiles) {
    // Return tiles on the edge of a component (adjacent to ocean)
    const edges = [];
    const compSet = new Set(component.map(t => hexKey(t.q, t.r)));

    for (const tile of component) {
        const neighbors = hexNeighbors(tile.q, tile.r);
        const hasOcean = neighbors.some(n => !compSet.has(hexKey(n.q, n.r)));
        if (hasOcean) edges.push(tile);
    }

    // Sample up to 30 edges to keep bridge search fast
    if (edges.length > 30) {
        const step = Math.floor(edges.length / 30);
        return edges.filter((_, i) => i % step === 0);
    }
    return edges;
}

function buildBridgePath(tiles, from, to) {
    // Simple line interpolation between from and to
    const dist = hexDistance(from, to);
    for (let i = 1; i < dist; i++) {
        const t = i / dist;
        const q = Math.round(from.q + (to.q - from.q) * t);
        const r = Math.round(from.r + (to.r - from.r) * t);
        const key = hexKey(q, r);
        const tile = tiles.get(key);
        if (tile && tile.terrain === TERRAIN.OCEAN) {
            tile.terrain = TERRAIN.BRIDGE;
        }
    }
}

function placeCities(rng, tiles, landTiles, count, width, height, minDistance) {
    const landArray = Array.from(landTiles);
    rng.shuffle(landArray);

    const cities = [];
    const cityNames = generateCityNames(Math.max(count + 10, 80), rng);

    for (const key of landArray) {
        if (cities.length >= count) break;

        const tile = tiles.get(key);
        if (!tile) continue;
        // No cities on mountains, swamps, or bridges
        if (tile.terrain === TERRAIN.MOUNTAIN || tile.terrain === TERRAIN.SWAMP || tile.terrain === TERRAIN.BRIDGE) continue;

        // Check minimum distance from existing cities
        const tooClose = cities.some(c => hexDistance(tile, c) < minDistance);
        if (tooClose) continue;

        const city = {
            id: cities.length,
            name: cityNames[cities.length],
            q: tile.q,
            r: tile.r,
            owner: null,
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
