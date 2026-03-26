// Seeded random number generator (mulberry32)
export class SeededRNG {
    constructor(seed) {
        this.state = seed | 0;
    }

    // Returns float in [0, 1)
    next() {
        this.state |= 0;
        this.state = (this.state + 0x6D2B79F5) | 0;
        let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    // Returns integer in [min, max] inclusive
    nextInt(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    // Returns a random element from an array
    pick(arr) {
        return arr[Math.floor(this.next() * arr.length)];
    }

    // Shuffle array in place (Fisher-Yates)
    shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
}

// Format number with commas
export function formatNumber(n) {
    return Math.floor(n).toLocaleString();
}

// Clamp value between min and max
export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

// Lerp between two values
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

// City name generator
const PREFIXES = [
    'North', 'South', 'East', 'West', 'New', 'Old', 'Fort', 'Port', 'Mount', 'Lake',
    'Iron', 'Silver', 'Gold', 'Stone', 'Dark', 'Bright', 'High', 'Low', 'Red', 'Black',
];
const ROOTS = [
    'haven', 'burg', 'ford', 'ton', 'field', 'vale', 'bridge', 'wood', 'gate', 'hold',
    'wick', 'dale', 'mere', 'cliff', 'moor', 'crest', 'peak', 'glen', 'bay', 'shore',
    'helm', 'keep', 'watch', 'guard', 'wall', 'march', 'stead', 'holm', 'fall', 'brook',
];
const STANDALONE = [
    'Avalon', 'Camelot', 'Ironforge', 'Stormwind', 'Ravenholm', 'Thornwall',
    'Ashford', 'Blackmoor', 'Crystalvale', 'Dragonspire', 'Eaglecrest', 'Frostpeak',
    'Grimhold', 'Hawkridge', 'Ivydale', 'Jadecliff', 'Kingsport', 'Lionheart',
    'Moonwatch', 'Nethergate', 'Oakenshield', 'Pinewood', 'Queensbury', 'Riverdale',
    'Shadowfen', 'Thunderkeep', 'Underhill', 'Vanguard', 'Windmere', 'Yorktown',
    'Aldburg', 'Bramblewood', 'Coppergate', 'Dunholm', 'Elmsworth', 'Fallcrest',
    'Greymarch', 'Highcliff', 'Ironcrest', 'Jasperhold', 'Millhaven', 'Northwatch',
    'Oakhurst', 'Pinewatch', 'Redwall', 'Silverton', 'Thornfield', 'Winterfell',
    'Crossroads', 'Deepwater',
];

export function generateCityNames(count, rng) {
    const names = new Set();
    const allStandalone = [...STANDALONE];
    rng.shuffle(allStandalone);

    // Use standalone names first
    for (const name of allStandalone) {
        if (names.size >= count) break;
        names.add(name);
    }

    // Generate more if needed
    while (names.size < count) {
        const prefix = rng.pick(PREFIXES);
        const root = rng.pick(ROOTS);
        names.add(prefix + root);
    }

    return Array.from(names).slice(0, count);
}
