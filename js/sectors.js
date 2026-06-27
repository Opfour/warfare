// Sector system: ownership calculation and tax-bonus helpers
//
// A leader controls a sector when they control ALL towns in it.
// Controlled sectors give tax bonuses to cities within them, and
// adjacent controlled sectors (same leader) give additional bonuses.

import { SECTOR_TAX_BONUS, SECTOR_OWN_BONUS } from './config.js';

// Recalculate ownership for all sectors based on current city ownership.
// A sector is "owned" by a leader if every city in it belongs to that leader.
// If cities have mixed owners (or all are neutral), the sector is contested (null).
export function recalculateSectorOwnership(sectors, cities) {
    // Group city owners by sector
    const sectorOwners = new Map(); // sectorId -> Map<owner, count>

    for (const city of cities) {
        if (city.sectorId === undefined) continue;
        if (!sectorOwners.has(city.sectorId)) {
            sectorOwners.set(city.sectorId, new Map());
        }
        const ownerCounts = sectorOwners.get(city.sectorId);
        const owner = city.owner; // null = neutral
        ownerCounts.set(owner, (ownerCounts.get(owner) || 0) + 1);
    }

    for (const sector of sectors) {
        const ownerCounts = sectorOwners.get(sector.id);

        if (!ownerCounts || sector.cityIds.length === 0) {
            // No cities in this sector — no one controls it
            sector.owner = null;
            continue;
        }

        // Check if a single owner controls ALL cities in the sector
        // Count only non-null owners; neutral cities break control
        let controllingOwner = null;
        let allSame = true;

        for (const [owner, count] of ownerCounts) {
            if (owner === null) {
                // Neutral city present — no one controls this sector
                allSame = false;
                break;
            }
            if (controllingOwner === null) {
                controllingOwner = owner;
            } else if (owner !== controllingOwner) {
                allSame = false;
                break;
            }
        }

        sector.owner = allSame ? controllingOwner : null;
    }
}

// Compute the sector tax multiplier for a given city.
// Returns the base tax multiplied by sector bonuses.
//
// Formula:
//   multiplier = 1.0
//   if city's own sector is controlled by the same leader:  +SECTOR_OWN_BONUS
//   for each adjacent sector controlled by the same leader: +SECTOR_TAX_BONUS
export function getSectorTaxMultiplier(city, sectors, player) {
    if (!sectors || !city || city.owner !== player.id) return 1.0;

    const sector = sectors.find(s => s.id === city.sectorId);
    if (!sector) return 1.0;

    let multiplier = 1.0;

    // Own sector controlled bonus
    if (sector.owner === player.id) {
        multiplier += SECTOR_OWN_BONUS;
    }

    // Adjacent controlled sector bonuses
    let adjacentControlled = 0;
    for (const adjId of sector.adjacentIds) {
        const adjSector = sectors.find(s => s.id === adjId);
        if (adjSector && adjSector.owner === player.id) {
            adjacentControlled++;
        }
    }
    multiplier += SECTOR_TAX_BONUS * adjacentControlled;

    return multiplier;
}