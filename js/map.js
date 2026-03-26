// Map generation: continental regions, natural boundaries, terrain, cities
//
// Algorithm:
// 1. Generate overall continent shape via flood-fill
// 2. Subdivide land into Voronoi-like regions (states/provinces)
// 3. Generate natural boundaries between regions (mountains, rivers, deserts)
// 4. Generate islands + bridges/isthmuses
// 5. Assign terrain within regions with biome variation
// 6. Place cities clustered within regions

import { TERRAIN, DEFAULT_LAND_RATIO, getMapScale } from './config.js';
import { hexNeighbors, hexKey, hexDistance } from './hex.js';
import { generateCityNames } from './utils.js';

export function generateMap(rng, options = {}) {
    const opponents = options.opponents || 1;
    const scale = getMapScale(opponents);

    const width = options.width || scale.width;
    const height = options.height || scale.height;
    const cityCount = options.cityCount || scale.cities;
    const regionCount = options.regions || scale.regions;
    const landRatio = options.landRatio || DEFAULT_LAND_RATIO;

    const padding = 4;
    const totalWidth = width + padding * 2;
    const totalHeight = height + padding * 2;

    const tiles = new Map();

    // Initialize all tiles as ocean
    for (let q = -padding; q < width + padding; q++) {
        for (let r = -padding; r < height + padding; r++) {
            const key = hexKey(q, r);
            tiles.set(key, { q, r, terrain: TERRAIN.OCEAN, city: null, regionId: -1 });
        }
    }

    // Phase 1: Generate continent shape
    const landTiles = generateContinentShape(rng, tiles, width, height, landRatio);

    // Phase 2: Generate islands
    const islandTiles = generateIslands(rng, tiles, landTiles, width, height);
    for (const key of islandTiles) landTiles.add(key);

    // Phase 3: Subdivide into regions (Voronoi growth)
    const regions = generateRegions(rng, tiles, landTiles, width, height, regionCount);

    // Phase 4: Assign base terrain within regions (with biome variation)
    assignRegionTerrain(rng, tiles, landTiles, regions, width, height);

    // Phase 5: Generate natural boundaries between regions
    generateBoundaries(rng, tiles, landTiles, regions, width, height);

    // Phase 6: Add swamps near coastlines
    addSwamps(rng, tiles, landTiles, width, height);

    // Phase 7: Build bridges/isthmuses connecting disconnected land
    buildBridges(rng, tiles, landTiles, width, height);

    // Phase 8: Place cities clustered within regions
    const cities = placeCities(rng, tiles, landTiles, regions, cityCount, width, height);

    return { tiles, cities, regions, width: totalWidth, height: totalHeight };
}

// ─── Phase 1: Continent Shape ────────────────────────────────────

function generateContinentShape(rng, tiles, width, height, landRatio) {
    const landTiles = new Set();
    const targetLandCount = Math.floor(width * height * landRatio);
    const centerQ = Math.floor(width / 2);
    const centerR = Math.floor(height / 2);
    const frontier = [];

    const centerKey = hexKey(centerQ, centerR);
    landTiles.add(centerKey);
    addFrontier(centerQ, centerR, frontier, landTiles, width, height);

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

    // Smoothing
    for (let pass = 0; pass < 2; pass++) {
        for (let q = 0; q < width; q++) {
            for (let r = 0; r < height; r++) {
                const key = hexKey(q, r);
                const neighbors = hexNeighbors(q, r).filter(n =>
                    n.q >= 0 && n.q < width && n.r >= 0 && n.r < height
                );
                const landCount = neighbors.filter(n => landTiles.has(hexKey(n.q, n.r))).length;
                if (!landTiles.has(key) && landCount >= 4) landTiles.add(key);
                else if (landTiles.has(key) && landCount <= 1) landTiles.delete(key);
            }
        }
    }

    return landTiles;
}

function addFrontier(q, r, frontier, landTiles, width, height) {
    for (const n of hexNeighbors(q, r)) {
        if (n.q >= 1 && n.q < width - 1 && n.r >= 1 && n.r < height - 1) {
            if (!landTiles.has(hexKey(n.q, n.r))) frontier.push(n);
        }
    }
}

// ─── Phase 2: Islands ────────────────────────────────────────────

function generateIslands(rng, tiles, mainlandTiles, width, height) {
    const islandTiles = new Set();
    const islandCount = rng.nextInt(3, 8);

    for (let i = 0; i < islandCount; i++) {
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

        const targetSize = rng.nextInt(5, 25);
        const island = new Set();
        const front = [];

        island.add(hexKey(seedQ, seedR));
        islandTiles.add(hexKey(seedQ, seedR));

        for (const n of hexNeighbors(seedQ, seedR)) {
            if (n.q >= 1 && n.q < width - 1 && n.r >= 1 && n.r < height - 1) front.push(n);
        }

        while (island.size < targetSize && front.length > 0) {
            const idx = rng.nextInt(0, front.length - 1);
            const t = front.splice(idx, 1)[0];
            const key = hexKey(t.q, t.r);
            if (island.has(key) || mainlandTiles.has(key)) continue;

            island.add(key);
            islandTiles.add(key);

            for (const n of hexNeighbors(t.q, t.r)) {
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

// ─── Phase 3: Voronoi Regions ────────────────────────────────────

function generateRegions(rng, tiles, landTiles, width, height, regionCount) {
    const landArray = Array.from(landTiles);
    if (landArray.length === 0) return [];

    // Place region seeds using Poisson-disk-like spacing
    const minSeedDist = Math.sqrt(width * height / regionCount) * 0.7;
    const seeds = [];
    const shuffled = [...landArray];
    rng.shuffle(shuffled);

    for (const key of shuffled) {
        if (seeds.length >= regionCount) break;
        const [q, r] = key.split(',').map(Number);

        // Must be away from edges and other seeds
        if (q < 3 || q > width - 4 || r < 3 || r > height - 4) continue;
        const tooClose = seeds.some(s => hexDistance({ q, r }, s) < minSeedDist);
        if (tooClose) continue;

        seeds.push({ q, r, id: seeds.length });
    }

    // If we couldn't place enough seeds, relax the constraint
    if (seeds.length < regionCount) {
        for (const key of shuffled) {
            if (seeds.length >= regionCount) break;
            const [q, r] = key.split(',').map(Number);
            const tooClose = seeds.some(s => hexDistance({ q, r }, s) < minSeedDist * 0.5);
            if (tooClose) continue;
            seeds.push({ q, r, id: seeds.length });
        }
    }

    // Assign biomes to regions
    const BIOMES = ['temperate', 'forested', 'hilly', 'fertile', 'arid'];
    const regions = seeds.map((seed, i) => ({
        id: i,
        seedQ: seed.q,
        seedR: seed.r,
        biome: BIOMES[rng.nextInt(0, BIOMES.length - 1)],
        tiles: new Set(),
    }));

    // Voronoi growth: assign each land tile to the nearest seed
    for (const key of landTiles) {
        const tile = tiles.get(key);
        if (!tile) continue;

        let bestRegion = 0;
        let bestDist = Infinity;
        for (let i = 0; i < seeds.length; i++) {
            const d = hexDistance(tile, seeds[i]);
            // Add jitter so boundaries aren't perfectly straight
            const jitteredDist = d + rng.next() * 1.5;
            if (jitteredDist < bestDist) {
                bestDist = jitteredDist;
                bestRegion = i;
            }
        }

        tile.regionId = bestRegion;
        regions[bestRegion].tiles.add(key);
    }

    return regions;
}

// ─── Phase 4: Region Terrain ─────────────────────────────────────

function assignRegionTerrain(rng, tiles, landTiles, regions, width, height) {
    for (const key of landTiles) {
        const tile = tiles.get(key);
        if (!tile) continue;

        const region = regions[tile.regionId];
        const biome = region ? region.biome : 'temperate';

        tile.terrain = assignTerrainWithBiome(tile.q, tile.r, rng, width, height, biome);
    }
}

function assignTerrainWithBiome(q, r, rng, width, height, biome) {
    const roll = rng.next();
    const distFromCenter = Math.sqrt(Math.pow(q - width / 2, 2) + Math.pow(r - height / 2, 2));
    const maxDist = Math.sqrt(Math.pow(width / 2, 2) + Math.pow(height / 2, 2));
    const centralness = 1 - distFromCenter / maxDist;

    // Biome modifiers
    let mountainChance = 0.05 + centralness * 0.1;
    let hillsChance = 0.15 + centralness * 0.05;
    let forestChance = 0.15;
    let desertChance = 0;

    switch (biome) {
        case 'forested': forestChance = 0.35; hillsChance = 0.10; break;
        case 'hilly': hillsChance = 0.30; mountainChance += 0.05; break;
        case 'fertile': forestChance = 0.10; hillsChance = 0.05; mountainChance = 0.02; break;
        case 'arid': desertChance = 0.25; forestChance = 0.03; break;
    }

    if (roll < mountainChance) return TERRAIN.MOUNTAIN;
    if (roll < mountainChance + hillsChance) return TERRAIN.HILLS;
    if (roll < mountainChance + hillsChance + forestChance) return TERRAIN.FOREST;
    if (roll < mountainChance + hillsChance + forestChance + desertChance) return TERRAIN.DESERT;
    return TERRAIN.PLAINS;
}

// ─── Phase 5: Natural Boundaries ─────────────────────────────────

function generateBoundaries(rng, tiles, landTiles, regions, width, height) {
    // Find pairs of adjacent regions and their shared border hexes
    const borderPairs = findRegionBorders(tiles, landTiles, regions);

    // Decide boundary type for each pair
    const totalPairs = borderPairs.length;
    let desertCount = 0;
    let riverCount = 0;

    for (const pair of borderPairs) {
        // Decide boundary type
        let boundaryType;
        if (desertCount < 1 + Math.floor(totalPairs / 8) && pair.borderHexes.length > 8 && rng.next() < 0.25) {
            boundaryType = 'desert';
            desertCount++;
        } else if (riverCount < 2 + Math.floor(totalPairs / 5) && rng.next() < 0.35) {
            boundaryType = 'river';
            riverCount++;
        } else {
            boundaryType = 'mountain';
        }

        applyBoundary(rng, tiles, pair.borderHexes, boundaryType, width, height);
    }
}

function findRegionBorders(tiles, landTiles, regions) {
    const pairMap = new Map(); // "min,max" -> Set of border hex keys

    for (const key of landTiles) {
        const tile = tiles.get(key);
        if (!tile || tile.regionId < 0) continue;

        for (const n of hexNeighbors(tile.q, tile.r)) {
            const nKey = hexKey(n.q, n.r);
            const nTile = tiles.get(nKey);
            if (!nTile || !landTiles.has(nKey)) continue;
            if (nTile.regionId < 0 || nTile.regionId === tile.regionId) continue;

            const a = Math.min(tile.regionId, nTile.regionId);
            const b = Math.max(tile.regionId, nTile.regionId);
            const pairKey = `${a},${b}`;

            if (!pairMap.has(pairKey)) pairMap.set(pairKey, new Set());
            pairMap.get(pairKey).add(key);
            pairMap.get(pairKey).add(nKey);
        }
    }

    return Array.from(pairMap.entries()).map(([pairKey, hexes]) => ({
        regions: pairKey.split(',').map(Number),
        borderHexes: Array.from(hexes),
    }));
}

function applyBoundary(rng, tiles, borderHexes, boundaryType, width, height) {
    switch (boundaryType) {
        case 'mountain':
            // Convert 40-60% of border hexes to mountains
            for (const key of borderHexes) {
                if (rng.next() < 0.5) {
                    const tile = tiles.get(key);
                    if (tile) tile.terrain = TERRAIN.MOUNTAIN;
                }
            }
            break;

        case 'river':
            // Convert border hexes to river (thinner line)
            for (const key of borderHexes) {
                if (rng.next() < 0.6) {
                    const tile = tiles.get(key);
                    if (tile) tile.terrain = TERRAIN.RIVER;
                }
            }
            break;

        case 'desert':
            // Convert border hexes + nearby tiles to desert (wider barrier)
            const desertSet = new Set(borderHexes);
            for (const key of borderHexes) {
                const tile = tiles.get(key);
                if (!tile) continue;
                // Expand 1-2 hexes outward
                for (const n of hexNeighbors(tile.q, tile.r)) {
                    const nKey = hexKey(n.q, n.r);
                    const nTile = tiles.get(nKey);
                    if (nTile && nTile.terrain !== TERRAIN.OCEAN && rng.next() < 0.5) {
                        desertSet.add(nKey);
                    }
                }
            }
            for (const key of desertSet) {
                const tile = tiles.get(key);
                if (tile && tile.terrain !== TERRAIN.OCEAN) tile.terrain = TERRAIN.DESERT;
            }
            break;
    }
}

// ─── Phase 6: Swamps ─────────────────────────────────────────────

function addSwamps(rng, tiles, landTiles, width, height) {
    for (const key of landTiles) {
        const tile = tiles.get(key);
        if (!tile || tile.terrain !== TERRAIN.PLAINS) continue;

        const hasOcean = hexNeighbors(tile.q, tile.r).some(n => {
            const nTile = tiles.get(hexKey(n.q, n.r));
            return nTile && nTile.terrain === TERRAIN.OCEAN;
        });

        if (hasOcean && rng.next() < 0.20) {
            tile.terrain = TERRAIN.SWAMP;
        }
    }
}

// ─── Phase 7: Bridges & Isthmuses ────────────────────────────────

function buildBridges(rng, tiles, landTiles, width, height) {
    const components = findLandComponents(tiles, landTiles, width, height);
    if (components.length <= 1) return;

    const bridged = new Set([0]);
    const unbridged = new Set(components.map((_, i) => i).filter(i => i > 0));

    while (unbridged.size > 0) {
        let bestDist = Infinity;
        let bestFrom = null, bestTo = null, bestCompIdx = -1;

        for (const bIdx of bridged) {
            for (const uIdx of unbridged) {
                const fromEdges = getComponentEdges(components[bIdx], tiles);
                const toEdges = getComponentEdges(components[uIdx], tiles);

                for (const from of fromEdges) {
                    for (const to of toEdges) {
                        const d = hexDistance(from, to);
                        if (d < bestDist && d >= 2 && d <= 10) {
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
            // Decide: isthmus or bridge based on gap size
            let useIsthmus = false;
            if (bestDist <= 2) useIsthmus = rng.next() < 0.7;
            else if (bestDist <= 4) useIsthmus = rng.next() < 0.4;

            buildConnectionPath(tiles, bestFrom, bestTo, useIsthmus);
            bridged.add(bestCompIdx);
            unbridged.delete(bestCompIdx);
        } else {
            break;
        }
    }
}

function buildConnectionPath(tiles, from, to, isIsthmus) {
    const dist = hexDistance(from, to);
    const terrain = isIsthmus ? TERRAIN.ISTHMUS : TERRAIN.BRIDGE;

    for (let i = 1; i < dist; i++) {
        const t = i / dist;
        const q = Math.round(from.q + (to.q - from.q) * t);
        const r = Math.round(from.r + (to.r - from.r) * t);
        const key = hexKey(q, r);
        const tile = tiles.get(key);
        if (tile && tile.terrain === TERRAIN.OCEAN) {
            tile.terrain = terrain;
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

            for (const n of hexNeighbors(tile.q, tile.r)) {
                const nKey = hexKey(n.q, n.r);
                if (landTiles.has(nKey) && !visited.has(nKey)) {
                    visited.add(nKey);
                    queue.push(nKey);
                }
            }
        }

        components.push(component);
    }

    components.sort((a, b) => b.length - a.length);
    return components;
}

function getComponentEdges(component, tiles) {
    const edges = [];
    const compSet = new Set(component.map(t => hexKey(t.q, t.r)));

    for (const tile of component) {
        const hasOcean = hexNeighbors(tile.q, tile.r).some(n => !compSet.has(hexKey(n.q, n.r)));
        if (hasOcean) edges.push(tile);
    }

    if (edges.length > 40) {
        const step = Math.floor(edges.length / 40);
        return edges.filter((_, i) => i % step === 0);
    }
    return edges;
}

// ─── Phase 8: City Placement ─────────────────────────────────────

function placeCities(rng, tiles, landTiles, regions, cityCount, width, height) {
    const cityNames = generateCityNames(Math.max(cityCount + 20, 120), rng);
    const cities = [];

    // Distribute city target count across regions
    const citiesPerRegion = regions.map((region) => {
        let share = Math.floor(cityCount / regions.length);
        // Desert/arid regions get fewer cities
        if (region.biome === 'arid') share = Math.max(1, Math.floor(share * 0.5));
        return share;
    });

    // Distribute remainder
    let remainder = cityCount - citiesPerRegion.reduce((a, b) => a + b, 0);
    while (remainder > 0) {
        const idx = rng.nextInt(0, regions.length - 1);
        citiesPerRegion[idx]++;
        remainder--;
    }

    const minCityDist = Math.max(3, Math.floor(Math.sqrt(width * height / cityCount) * 0.5));

    for (let ri = 0; ri < regions.length; ri++) {
        const region = regions[ri];
        const target = citiesPerRegion[ri];
        const regionLand = Array.from(region.tiles);
        rng.shuffle(regionLand);

        let placed = 0;
        for (const key of regionLand) {
            if (placed >= target) break;

            const tile = tiles.get(key);
            if (!tile) continue;
            // No cities on mountains, swamps, bridges, rivers, isthmuses
            if ([TERRAIN.MOUNTAIN, TERRAIN.SWAMP, TERRAIN.BRIDGE, TERRAIN.RIVER, TERRAIN.ISTHMUS].includes(tile.terrain)) continue;

            // Check min distance from all existing cities
            const tooClose = cities.some(c => hexDistance(tile, c) < minCityDist);
            if (tooClose) continue;

            const isDesert = tile.terrain === TERRAIN.DESERT;
            const city = {
                id: cities.length,
                name: cityNames[cities.length],
                q: tile.q,
                r: tile.r,
                owner: null,
                regionId: ri,
                population: isDesert ? rng.nextInt(200, 2000) : rng.nextInt(500, 5000),
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
            placed++;
        }
    }

    return cities;
}
