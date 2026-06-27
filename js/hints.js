// Strategy Hints module — provides context-aware tips for new players
//
// getHint(gameState) inspects the player's current situation (turn number,
// cities owned, treasury, investment levels, enemy proximity, etc.) and
// returns a single hint object { category, title, text } that is most
// relevant at this moment. Hints are organised by category so the UI can
// optionally style or filter them.

import { UNIT_STATS, UNIT_TYPE, getTechTier, INVEST_SECTOR } from './config.js';
import { hexDistance } from './hex.js';

// ─── Hint database ─────────────────────────────────────────────
// Each hint defines:
//   category: one of early_game | economy | combat | sectors | danger | general
//   title:    short heading
//   text:     1-3 sentence body
//   priority: function(gameState, context) -> non-negative score.
//             The hint with the highest score wins; ties are broken randomly.
//   cooldown: minimum turns between this hint and the next one of the same category
//             (stored via an index kept by the caller; we just tag it here)
const HINTS = [

    // ── Early game (turns 1-12) ───────────────────────────────
    {
        id: 'early_game_explore',
        category: 'early_game',
        title: 'Scout Your Surroundings',
        text: 'It is still early. Send your Scout (◈) to explore nearby neutral cities — capturing undefended towns early accelerates your economy and denies territory to rivals.',
        cooldown: 4,
        priority(gs, ctx) {
            if (gs.turn > 10) return 0;
            if (!ctx.hasScout) return 0;
            return 20 - gs.turn;
        },
    },
    {
        id: 'early_game_claim',
        category: 'early_game',
        title: 'Grab Neutral Cities',
        text: 'Walk any unit onto a neutral (grey) city to claim it instantly if it is undefended. Each new city brings tax income, population, and a potential recruitment site.',
        cooldown: 5,
        priority(gs, ctx) {
            if (gs.turn > 14) return 0;
            return Math.max(0, 18 - gs.turn * 1.5) + (ctx.neutralNear > 0 ? 6 : 0);
        },
    },
    {
        id: 'early_game_build_army',
        category: 'early_game',
        title: 'Recruit Your First Army Corps',
        text: 'Army Corps (⛊) is the backbone unit — solid attack and defense at a low 100-gold cost. Build one or two early so you are not caught defenceless when rivals find you.',
        cooldown: 6,
        priority(gs, ctx) {
            if (gs.turn > 16) return 0;
            if (ctx.myCityCount < 2) return 0;
            if (ctx.counts.army_corps >= 2) return 0;
            return 15 - gs.turn + (ctx.counts.army_corps === 0 ? 5 : 0);
        },
    },

    // ── Economy ─────────────────────────────────────────────
    {
        id: 'econ_low_treasury',
        category: 'economy',
        title: 'Mind Your Treasury',
        text: 'Your treasury is low. Lower the tax rate on unhappy cities to avoid revolts, and consider investing more in Economics — it multiplies future tax income.',
        cooldown: 5,
        priority(gs, ctx) {
            if (ctx.human.treasury < 80 && ctx.myCityCount >= 1) return 30;
            return 0;
        },
    },
    {
        id: 'econ_balance_investment',
        category: 'economy',
        title: 'Balance Your Investments',
        text: 'Spreading investment evenly (25/25/25/25) is safe but slow. Focus on Knowledge early to climb tech tiers faster, then shift to Economics once you are ahead scientifically.',
        cooldown: 8,
        priority(gs, ctx) {
            if (ctx.myCityCount < 2) return 0;
            const avg = ctx.avgInvestment;
            const spread = Math.max(avg.defense, avg.knowledge, avg.public, avg.economics) -
                           Math.min(avg.defense, avg.knowledge, avg.public, avg.economics);
            // Reward this hint when the player's spread is *small* (balanced) — nudge them to specialise
            if (spread <= 15) return 12;
            return 0;
        },
    },
    {
        id: 'econ_tax_satisfaction',
        category: 'economy',
        title: 'Watch Satisfaction & Taxes',
        text: 'Cities with satisfaction below 20 can revolt, destroying garrisons. Keep tax rates around 30-40% in peacetime — crank taxes higher only when you urgently need gold and can absorb the unrest.',
        cooldown: 7,
        priority(gs, ctx) {
            const risky = ctx.myCities.some(c => c.satisfaction < 30);
            return risky ? 25 : 10;
        },
    },
    {
        id: 'econ_knowledge_pays_off',
        category: 'economy',
        title: 'Invest in Knowledge',
        text: 'Knowledge drives your tech tier, which boosts attack, defense and economy simultaneously. A city with focused Knowledge investment climbs tiers in 20-30 turns — the earlier you start, the bigger the snowball.',
        cooldown: 10,
        priority(gs, ctx) {
            const highestKnowledge = ctx.myCities.reduce((m, c) => Math.max(m, c.knowledge), 0);
            if (highestKnowledge > 80) return 0; // already well underway
            return Math.max(0, 14 - gs.turn);
        },
    },

    // ── Combat ───────────────────────────────────────────────
    {
        id: 'combat_protect_commander',
        category: 'combat',
        title: 'Protect Your Commander',
        text: 'If your Commander (★) dies, you are eliminated — instantly. Never charge the Commander into a risky fight. Keep a Defender (⛨) or Army Corps (⛊) stacked with it for safety.',
        cooldown: 6,
        priority(gs, ctx) {
            if (!ctx.commander) return 50; // commander already dead = warn hard
            const nearestEnemy = ctx.nearestEnemyDist;
            if (nearestEnemy <= 4) return 35;
            if (nearestEnemy <= 8) return 18;
            return 6;
        },
    },
    {
        id: 'combat_matchup_raider_vs_artillery',
        category: 'combat',
        title: 'Hard Counter: Raiders vs Artillery',
        text: 'Raiders (⚔) have a 1.4× advantage against Artillery (⊕). If the enemy favours Artillery, build Raiders to flank them quickly — their 12-move range lets them close the gap before Artillery can fire effectively.',
        cooldown: 12,
        priority(gs, ctx) {
            const enemyArtillery = ctx.enemyCounts.artillery;
            if (enemyArtillery >= 2) return 22;
            return 0;
        },
    },
    {
        id: 'combat_matchup_mechanized',
        category: 'combat',
        title: 'Mechanized Devastates Armour',
        text: 'Mechanized (⊛) has 1.8× attack against Artillery and 1.5× against Raiders. It is expensive (350 gold), but a single Mechanized unit can shatter an enemy defensive line. Pair it with a Defender for durability.',
        cooldown: 12,
        priority(gs, ctx) {
            if (ctx.human.treasury < 350) return 0;
            const enemyFortified = ctx.enemyCounts.artillery + ctx.enemyCounts.defender;
            return enemyFortified >= 3 ? 20 : 0;
        },
    },
    {
        id: 'combat_terrain_defense',
        category: 'combat',
        title: 'Use Terrain to Your Advantage',
        text: 'Defending from mountains (1.5× defense), isthmuses (1.6×), or rivers (1.4×) dramatically improves survivability. Lure the enemy into attacking you across rivers or onto hills rather than fighting on open plains.',
        cooldown: 10,
        priority(gs, ctx) {
            return ctx.nearestEnemyDist <= 6 ? 18 : 4;
        },
    },
    {
        id: 'combat_build_defenders',
        category: 'combat',
        title: 'Garrison Your Frontline Cities',
        text: 'Defenders (⛨) do not move but are cheap (50 gold) and strong against raiders and scouts. Keep at least one Defender in every city near enemy territory to prevent easy captures.',
        cooldown: 8,
        priority(gs, ctx) {
            const frontline = ctx.myCities.filter(c => c.distToEnemy <= 6);
            const undefended = frontline.filter(c => !ctx.defendersByCity.get(c.id));
            return undefended.length > 0 ? undefended.length * 8 + 5 : 0;
        },
    },

    // ── Sectors ──────────────────────────────────────────────
    {
        id: 'sector_one_away',
        category: 'sectors',
        title: 'You Are One City From a Sector',
        text: 'You control all but one city in a sector. Capturing the remaining town will flip the entire sector to you, granting +15% income to all cities within it and +20% for each adjacent sector you also control.',
        cooldown: 8,
        priority(gs, ctx) {
            return ctx.sectorOneAway > 0 ? 30 : 0;
        },
    },
    {
        id: 'sector_bonus_explained',
        category: 'sectors',
        title: 'How Sector Bonuses Work',
        text: 'When you own every city in a sector, all your cities in that sector earn +15% tax income. Controlling an adjacent sector adds another +20% to each. Chaining sectors together creates a powerful economic engine.',
        cooldown: 14,
        priority(gs, ctx) {
            const mySectors = (gs.map.sectors || []).filter(s => s.owner === 0).length;
            return mySectors >= 1 ? 10 : 0;
        },
    },
    {
        id: 'sector_consolidate',
        category: 'sectors',
        title: 'Consolidate Before Expanding',
        text: 'You have spread thin across multiple sectors without fully controlling any. Focus your next few city captures on finishing one sector before hopping to the next — sector control is worth more than scattered holdings.',
        cooldown: 10,
        priority(gs, ctx) {
            const partial = ctx.partialSectors;
            return partial >= 2 ? 18 : 0;
        },
    },

    // ── Danger ───────────────────────────────────────────────
    {
        id: 'danger_commander_near_enemy',
        category: 'danger',
        title: 'Commander in Danger!',
        text: 'An enemy unit is within 4 hexes of your Commander. Retreat the Commander immediately or stack a Defender on it. Losing your Commander ends your game — do not gamble.',
        cooldown: 3,
        priority(gs, ctx) {
            if (!ctx.commander) return 0;
            if (ctx.nearestEnemyDist <= 4) return 50;
            return 0;
        },
    },
    {
        id: 'danger_city_revolt_risk',
        category: 'danger',
        title: 'Imminent Revolt Risk',
        text: 'One or more of your cities has satisfaction below 20 and may revolt this turn, destroying 30-70% of its garrison. Lower taxes or raise Public investment in that city now.',
        cooldown: 4,
        priority(gs, ctx) {
            const critical = ctx.myCities.filter(c => c.satisfaction < 20);
            return critical.length > 0 ? critical.length * 12 + 10 : 0;
        },
    },
    {
        id: 'danger_enemy_at_border',
        category: 'danger',
        title: 'Enemy Approaching Your Territory',
        text: 'Enemy units have been spotted within 6 hexes of your cities. Reinforce your frontier, recruit Defenders for exposed towns, and consider a pre-emptive strike with Raiders before they entrench.',
        cooldown: 5,
        priority(gs, ctx) {
            if (ctx.nearestEnemyDist > 6) return 0;
            if (ctx.nearestEnemyDist > 4) return 22;
            return 0;
        },
    },
    {
        id: 'danger_falling_behind',
        category: 'danger',
        title: 'Falling Behind on Tech',
        text: 'Your highest knowledge city lags significantly behind the enemy average. If you do not invest in Knowledge soon, the enemy will out-tech you and their units will hit harder and defend better.',
        cooldown: 8,
        priority(gs, ctx) {
            if (ctx.myCityCount === 0) return 0;
            const myBest = ctx.myCities.reduce((m, c) => Math.max(m, c.knowledge), 0);
            return ctx.enemyAvgKnowledge > myBest + 30 ? 24 : 0;
        },
    },

    // ── General ──────────────────────────────────────────────
    {
        id: 'general_split_units',
        category: 'general',
        title: 'Split Large Units When Needed',
        text: 'Units with 2+ troops can be split (right-click → no menu yet, but the engine supports it). Splitting an Army Corps into two creates a second garrison point — handy for covering two cities with one recruit.',
        cooldown: 14,
        priority(gs, ctx) {
            const canSplit = ctx.myUnits.filter(u => u.troops >= 2 && u.type !== UNIT_TYPE.COMMANDER).length;
            return canSplit > 0 ? 6 : 0;
        },
    },
    {
        id: 'general_move_to_orders',
        category: 'general',
        title: 'Automate Movement with MOVE_TO',
        text: 'Set a unit\'s order to MOVE_TO and right-click a destination — the unit will pathfind toward that hex every turn automatically. Great for long Scout expeditions across rough terrain.',
        cooldown: 14,
        priority(gs, ctx) {
            // Show after the player has at least one unit that is not on hold
            const hasOrders = ctx.myUnits.some(u => u.orders && u.orders !== 'hold');
            return hasOrders ? 0 : 5;
        },
    },
    {
        id: 'general_check_combat_preview',
        category: 'general',
        title: 'Check Combat Odds Before Attacking',
        text: 'When you move a unit onto an enemy, a combat dialog appears showing attacker/defender strength and win odds. Red odds (<50%) mean you will probably lose troops — consider retreating or bringing reinforcements instead.',
        cooldown: 12,
        priority(gs, ctx) {
            return ctx.nearestEnemyDist <= 5 ? 14 : 0;
        },
    },
    {
        id: 'general_recruit_near_front',
        category: 'general',
        title: 'Recruit Near the Front, Not the Rear',
        text: 'Units spawn at the recruiting city. Building a Defender in a frontline town reinforces the border instantly; building it in your capital wastes turns of travel. Use forward cities as forward bases.',
        cooldown: 10,
        priority(gs, ctx) {
            if (ctx.myCityCount < 3) return 0;
            return ctx.frontlineCities > 0 ? 10 : 0;
        },
    },
    {
        id: 'general_replenish_defenders',
        category: 'general',
        title: 'Replenish Your Defenders',
        text: 'Defenders do not move but lose troops in combat. A defender with troops near 1 is useless — either disband it and recruit a fresh one, or move a friendly unit onto its tile to absorb the next attack.',
        cooldown: 8,
        priority(gs, ctx) {
            const weak = ctx.myUnits.some(u =>
                u.type === UNIT_TYPE.DEFENDER && u.troops <= 2);
            return weak ? 16 : 0;
        },
    },
];

// ─── Context extraction ────────────────────────────────────────
// Compute derived metrics from the raw gameState so hint priority
// functions can be simple expressions instead of re-walking the
// full state every time.

function computeContext(gs) {
    const human = gs.players.find(p => p.isHuman && p.alive);
    const his = gs.players.find(p => p.isHuman);

    const myCities = gs.map.cities.filter(c => c.owner === 0);
    const myCityCount = myCities.length;

    const myUnits = gs.units.filter(u => u.owner === 0);
    const enemyUnits = gs.units.filter(u => u.owner !== 0 && u.owner != null);

    const counts = {};
    for (const u of myUnits) {
        counts[u.type] = (counts[u.type] || 0) + 1;
    }

    const enemyCounts = {};
    for (const u of enemyUnits) {
        enemyCounts[u.type] = (enemyCounts[u.type] || 0) + 1;
    }

    const commander = myUnits.find(u => u.type === UNIT_TYPE.COMMANDER);

    // Distance from commander to nearest enemy unit
    let nearestEnemyDist = Infinity;
    if (commander) {
        for (const eu of enemyUnits) {
            const d = hexDistance(commander, eu);
            if (d < nearestEnemyDist) nearestEnemyDist = d;
        }
    }

    // Distance from each of my cities to nearest enemy unit
    const defendersByCity = new Map();
    for (const u of myUnits) {
        if (u.type === UNIT_TYPE.DEFENDER) {
            const key = `${u.q},${u.r}`;
            defendersByCity.set(key, true);
        }
    }
    for (const c of myCities) {
        const key = `${c.q},${c.r}`;
        // `defendersByCity` keyed by hex; map by city id only if same hex
        if (!defendersByCity.has(key)) continue;
        c._hasDefender = true;
        // Also store by city id for easy lookup in priority functions
        defendersByCity.set(c.id, true);
    }

    let frontlineCities = 0;
    for (const c of myCities) {
        for (const eu of enemyUnits) {
            const d = hexDistance(c, eu);
            if (d <= 6) { frontlineCities++; break; }
        }
    }

    // Count how many neutral cities are within 8 hexes of any of my cities
    const neutralCities = gs.map.cities.filter(c => c.owner === null);
    let neutralNear = 0;
    for (const nc of neutralCities) {
        for (const mc of myCities) {
            if (hexDistance(nc, mc) <= 8) { neutralNear++; break; }
        }
    }

    // Sector analysis
    const sectors = gs.map.sectors || [];
    let sectorOneAway = 0;   // sectors where I own all-but-one city
    let partialSectors = 0;  // sectors where I own some but not all cities
    for (const s of sectors) {
        const cityIds = s.cityIds || [];
        const sectorCities = gs.map.cities.filter(c => cityIds.includes(c.id));
        const mine = sectorCities.filter(c => c.owner === 0).length;
        if (mine > 0 && mine < sectorCities.length) {
            partialSectors++;
            if (mine === sectorCities.length - 1) sectorOneAway++;
        }
    }

    // Average investment allocation across my cities
    let avgDef = 0, avgKnow = 0, avgPub = 0, avgEcon = 0;
    if (myCityCount > 0) {
        for (const c of myCities) {
            avgDef  += c.investment.defense  || 0;
            avgKnow += c.investment.knowledge || 0;
            avgPub  += c.investment.public   || 0;
            avgEcon += c.investment.economics || 0;
        }
        avgDef  /= myCityCount;
        avgKnow /= myCityCount;
        avgPub  /= myCityCount;
        avgEcon /= myCityCount;
    }
    const avgInvestment = { defense: avgDef, knowledge: avgKnow, public: avgPub, economics: avgEcon };

    // Enemy average knowledge (only those who have cities)
    let enemyAvgKnowledge = 0;
    let enemyCityCount = 0;
    for (const c of gs.map.cities) {
        if (c.owner !== null && c.owner !== 0) {
            enemyAvgKnowledge += c.knowledge;
            enemyCityCount++;
        }
    }
    if (enemyCityCount > 0) enemyAvgKnowledge /= enemyCityCount;

    return {
        human: human || his || { treasury: 0, name: 'You' },
        myCities,
        myCityCount,
        myUnits,
        counts,
        enemyCounts,
        commander,
        neutralNear,
        hasScout: (counts[UNIT_TYPE.SCOUT] || 0) > 0,
        nearestEnemyDist,
        defendersByCity,
        frontlineCities,
        sectorOneAway,
        partialSectors,
        avgInvestment,
        enemyAvgKnowledge,
    };
}

// ─── Public API ─────────────────────────────────────────────────

// Track which turns each hint ID was last shown on so we can honour
// cooldowns. Kept module-level and keyed by hint id.
const _lastShown = new Map();

// Pick the best hint for the given game state.
// Returns { id, category, title, text } or null if nothing applies.
export function getHint(gs) {
    if (!gs || !gs.map || gs.phase !== 'playing') return null;

    const ctx = computeContext(gs);
    const turn = gs.turn;

    let best = null;
    let bestScore = -1;

    for (const hint of HINTS) {
        // Cooldown check
        const last = _lastShown.get(hint.id);
        if (last !== undefined && hint.cooldown > 0) {
            const turnsSince = turn - last;
            if (turnsSince < hint.cooldown) continue;
        }

        let score = 0;
        try {
            score = hint.priority(gs, ctx);
        } catch {
            // Defensive — never let a hint priority crash the UI
            score = 0;
        }
        if (score <= 0) continue;

        if (score > bestScore) {
            bestScore = score;
            best = hint;
        }
    }

    if (!best) return null;

    _lastShown.set(best.id, turn);

    return {
        id: best.id,
        category: best.category,
        title: best.title,
        text: best.text,
    };
}

// Reset cooldown tracking (useful when a new game starts).
export function resetHints() {
    _lastShown.clear();
}

// Get all available hint categories — handy for UI filtering.
export function getHintCategories() {
    return ['early_game', 'economy', 'combat', 'sectors', 'danger', 'general'];
}