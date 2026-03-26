// Main entry point: game loop, state management, UI wiring

import { Renderer } from './renderer.js';
import { Camera } from './camera.js';
import { InputHandler } from './input.js';
import { generateMap } from './map.js';
import { SeededRNG } from './utils.js';
import { axialToPixel, hexKey, hexDistance } from './hex.js';
import { DEFAULT_MAP_WIDTH, DEFAULT_MAP_HEIGHT, DEFAULT_CITY_COUNT, UNIT_TYPE, UNIT_STATS, PLAYER_COLORS, AI_PERSONALITY, getTechTier, getNextTechTier } from './config.js';
import { Player } from './player.js';
import { createUnit, resetUnitIds, getRecruitableUnits } from './unit.js';
import { TurnManager } from './turn.js';
import { createAI } from './ai.js';
import { runCombatRound, tryCaptureCity, checkCommanderDeath, getCombatPreview, offerTruce, processSurrender, calculateCapture, absorbCaptured, equipCaptured } from './combat.js';
import { ORDER, setOrder, setMoveTarget } from './orders.js';

// Game state — single source of truth
const gameState = {
    map: null,
    units: [],
    players: [],
    currentPlayer: 0,
    turn: 1,
    phase: 'setup', // setup, playing, gameover
    winner: null,

    // UI state
    selectedHex: null,
    selectedUnit: null,
    selectedCity: null,
    hoverHex: null,
    movementRange: null,
    moveToPickUnit: null, // unit waiting for destination click
};

let renderer, camera, input, turnManager;
const aiPlayers = new Map();

function init() {
    const canvas = document.getElementById('gameCanvas');
    const container = document.getElementById('gameContainer');

    function resizeCanvas() {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        if (camera) camera.resize(canvas.width, canvas.height);
        if (renderer) renderer.resize(canvas.width, canvas.height);
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    renderer = new Renderer(canvas);
    camera = new Camera(canvas.width, canvas.height);
    input = new InputHandler(canvas, camera, gameState);

    // Wire up right-click context menu
    input.onRightClick = handleRightClick;

    // Wire up menu buttons
    document.getElementById('btnNew').addEventListener('click', () => showNewGameDialog());
    document.getElementById('btnEndTurn').addEventListener('click', endTurn);
    document.getElementById('btnInvest').addEventListener('click', showInvestPanel);
    document.getElementById('btnOrders').addEventListener('click', showOrdersPanel);
    document.getElementById('btnList').addEventListener('click', showListPanel);
    document.getElementById('btnReports').addEventListener('click', showReportsPanel);
    document.getElementById('closeInfoPanel').addEventListener('click', () => {
        gameState.selectedCity = null;
        gameState.selectedUnit = null;
        gameState.selectedHex = null;
        gameState.movementRange = null;
    });

    // Enable previously disabled buttons
    for (const id of ['btnInvest', 'btnList', 'btnOrders', 'btnReports']) {
        document.getElementById(id).disabled = false;
    }

    // Close context menu on any click outside it
    document.addEventListener('mousedown', (e) => {
        const menu = document.getElementById('contextMenu');
        if (menu && menu.style.display === 'block' && !menu.contains(e.target)) {
            menu.style.display = 'none';
        }
    });

    // Start default game
    newGame({ opponents: 1, personality: 'AGGRESSIVE', cityCount: DEFAULT_CITY_COUNT });

    requestAnimationFrame(gameLoop);
}

function showNewGameDialog() {
    const opponents = parseInt(prompt('Number of AI opponents (1-4):', '1')) || 1;
    const personalities = Object.keys(AI_PERSONALITY);
    const persStr = personalities.map((p, i) => `${i + 1}. ${p}`).join('\n');
    const persIdx = parseInt(prompt(`AI Personality:\n${persStr}\nChoose (1-${personalities.length}):`, '2')) || 2;
    const personality = personalities[Math.min(persIdx - 1, personalities.length - 1)];
    const cityCount = parseInt(prompt('Number of cities (20-80):', '50')) || 50;

    newGame({
        opponents: Math.min(4, Math.max(1, opponents)),
        personality,
        cityCount: Math.min(80, Math.max(20, cityCount)),
    });
}

function newGame(options = {}) {
    const { opponents = 1, personality = 'AGGRESSIVE', cityCount = DEFAULT_CITY_COUNT } = options;
    const seed = Date.now();
    const rng = new SeededRNG(seed);

    resetUnitIds();
    aiPlayers.clear();

    // Generate map
    gameState.map = generateMap(rng, {
        width: DEFAULT_MAP_WIDTH,
        height: DEFAULT_MAP_HEIGHT,
        cityCount,
    });

    // Create players
    gameState.players = [];
    gameState.players.push(new Player(0, 'You', true));
    for (let i = 1; i <= opponents; i++) {
        const aiPersonality = AI_PERSONALITY[personality] || AI_PERSONALITY.AGGRESSIVE;
        const aiPlayer = new Player(i, `${aiPersonality.name} AI ${i}`, false, aiPersonality);
        gameState.players.push(aiPlayer);
        aiPlayers.set(i, createAI(aiPlayer, personality));
    }

    // Reset state
    gameState.units = [];
    gameState.turn = 1;
    gameState.currentPlayer = 0;
    gameState.phase = 'playing';
    gameState.winner = null;
    gameState.selectedHex = null;
    gameState.selectedUnit = null;
    gameState.selectedCity = null;
    gameState.hoverHex = null;
    gameState.movementRange = null;

    // Set up camera bounds
    camera.setMapBounds(gameState.map.width, gameState.map.height);

    // Assign starting cities — spread players apart
    const cities = gameState.map.cities;
    const usedCities = new Set();

    for (let p = 0; p < gameState.players.length; p++) {
        let bestCity = null;
        let bestScore = -Infinity;

        for (const city of cities) {
            if (usedCities.has(city.id)) continue;

            let minDist = Infinity;
            for (const usedId of usedCities) {
                const usedCity = cities.find(c => c.id === usedId);
                if (usedCity) {
                    minDist = Math.min(minDist, hexDistance(city, usedCity));
                }
            }
            if (usedCities.size === 0) minDist = 10;

            const valueScore = (city.population + city.economics * 50 + city.defense * 30) / 1000;
            const distScore = Math.min(minDist, 15);
            const score = valueScore + distScore * 2;

            if (score > bestScore) {
                bestScore = score;
                bestCity = city;
            }
        }

        if (bestCity) {
            bestCity.owner = p;
            usedCities.add(bestCity.id);
            gameState.players[p].homeCityId = bestCity.id;

            // Create commander
            gameState.units.push(createUnit(UNIT_TYPE.COMMANDER, p, bestCity));
            // Starting scout
            gameState.units.push(createUnit(UNIT_TYPE.SCOUT, p, bestCity));
            // Starting defender
            gameState.units.push(createUnit(UNIT_TYPE.DEFENDER, p, bestCity));
        }
    }

    // Create turn manager
    turnManager = new TurnManager(gameState, aiPlayers);

    // Center camera on player's home city
    const playerCity = cities.find(c => c.owner === 0);
    if (playerCity) {
        const pos = axialToPixel(playerCity.q, playerCity.r);
        camera.centerOn(pos.x, pos.y);
    }

    updateStatusBar(`Turn 1 — ${opponents} ${AI_PERSONALITY[personality].name} AI opponent(s). ${cities.length} cities. Right-click for actions.`);
}

// ─── Right-click Context Menu ─────────────────────────────────────

function handleRightClick(hex, key, screenX, screenY) {
    if (gameState.phase !== 'playing') return;

    const tile = gameState.map.tiles.get(key);
    if (!tile) return;

    const myUnits = gameState.units.filter(u => u.q === hex.q && u.r === hex.r && u.owner === 0);
    const city = tile.city;
    const isMyCity = city && city.owner === 0;

    // Build menu items
    const items = [];

    // City actions
    if (isMyCity) {
        items.push({ label: 'Recruit Unit', icon: '+', action: () => showRecruitDialog(city) });
        items.push({ label: 'Invest', icon: '$', action: () => {
            gameState.selectedCity = city;
            showInvestPanel();
        }});
    }

    // Unit actions — show for each of my units here
    for (const unit of myUnits) {
        const stats = UNIT_STATS[unit.type];
        const unitLabel = `${stats.symbol} ${stats.name}`;

        // Select unit
        items.push({ label: `Select ${unitLabel}`, icon: '>', action: () => {
            input.selectUnit(unit);
        }});

        // Orders submenu items
        items.push({ label: `Orders: ${unitLabel}`, icon: '!', submenu: Object.values(ORDER).map(o => ({
            label: o.replace('_', ' ').toUpperCase() + (unit.orders === o ? ' *' : ''),
            action: () => {
                setOrder(unit, o);
                updateStatusBar(`${stats.name} orders set to: ${o.replace('_', ' ')}`);
            }
        }))});
    }

    if (items.length === 0) {
        // Nothing to do at this hex
        return;
    }

    showContextMenu(screenX, screenY, items);
}

function showContextMenu(x, y, items) {
    let menu = document.getElementById('contextMenu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'contextMenu';
        document.body.appendChild(menu);
    }

    let html = '';
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.submenu) {
            html += `<div class="ctx-group-label">${item.icon} ${item.label}</div>`;
            for (let j = 0; j < item.submenu.length; j++) {
                const sub = item.submenu[j];
                html += `<div class="ctx-item ctx-sub" data-idx="${i}" data-sub="${j}">${sub.label}</div>`;
            }
        } else {
            html += `<div class="ctx-item" data-idx="${i}">${item.icon} ${item.label}</div>`;
        }
    }

    menu.innerHTML = html;
    menu.style.display = 'block';

    // Position near click, but keep on screen
    const maxX = window.innerWidth - 220;
    const maxY = window.innerHeight - menu.scrollHeight - 10;
    menu.style.left = Math.min(x, maxX) + 'px';
    menu.style.top = Math.min(y, maxY) + 'px';

    // Bind click handlers
    menu.querySelectorAll('.ctx-item').forEach(el => {
        el.addEventListener('click', () => {
            const idx = parseInt(el.dataset.idx);
            const subIdx = el.dataset.sub;
            if (subIdx !== undefined) {
                items[idx].submenu[parseInt(subIdx)].action();
            } else {
                items[idx].action();
            }
            menu.style.display = 'none';
        });
    });
}

// ─── Override hex click to add combat ─────────────────────────────

const originalHandleClick = InputHandler.prototype.handleHexClick;
InputHandler.prototype.handleHexClick = function(hex, key) {
    const tile = gameState.map.tiles.get(key);

    // "Move to" destination pick mode
    if (gameState.moveToPickUnit) {
        const unit = gameState.moveToPickUnit;
        gameState.moveToPickUnit = null;
        document.body.style.cursor = 'default';
        setMoveTarget(unit, hex.q, hex.r);
        updateStatusBar(`${UNIT_STATS[unit.type].name} will move toward (${hex.q}, ${hex.r}) each turn.`);
        gameState.selectedUnit = null;
        gameState.movementRange = null;
        return;
    }

    if (gameState.selectedUnit && gameState.selectedUnit.owner === gameState.currentPlayer) {
        const unit = gameState.selectedUnit;

        if (gameState.movementRange) {
            const inRange = gameState.movementRange.some(h => h.q === hex.q && h.r === hex.r);
            if (inRange) {
                const enemies = gameState.units.filter(u =>
                    u.q === hex.q && u.r === hex.r && u.owner !== unit.owner && u.troops > 0
                );

                if (enemies.length > 0) {
                    unit.q = hex.q;
                    unit.r = hex.r;
                    unit.movesRemaining = 0;
                    showCombatDialog(unit, enemies[0]);
                    return;
                }
            }
        }
    }

    originalHandleClick.call(this, hex, key);
};

// ─── Combat Dialog ────────────────────────────────────────────────

function showCombatDialog(attacker, defender) {
    const preview = getCombatPreview(attacker, defender, gameState.map);
    const atkStats = UNIT_STATS[attacker.type];
    const defStats = UNIT_STATS[defender.type];

    const html = `
        <div class="combat-dialog" id="combatDialog">
            <h3>Combat</h3>
            <div class="combat-sides">
                <div class="combat-side attacker">
                    <div class="combat-symbol" style="background:${PLAYER_COLORS[attacker.owner]}">${atkStats.symbol}</div>
                    <div>${atkStats.name}</div>
                    <div>Troops: ${attacker.troops}</div>
                    <div>Strength: ${preview.attackerStrength}</div>
                    <div class="combat-odds">${preview.attackerOdds}%</div>
                </div>
                <div class="combat-vs">VS</div>
                <div class="combat-side defender">
                    <div class="combat-symbol" style="background:${PLAYER_COLORS[defender.owner]}">${defStats.symbol}</div>
                    <div>${defStats.name}</div>
                    <div>Troops: ${defender.troops}</div>
                    <div>Strength: ${preview.defenderStrength}</div>
                    <div class="combat-odds">${preview.defenderOdds}%</div>
                </div>
            </div>
            <div class="combat-outlook">${preview.outlook}</div>
            <div class="combat-matchup">${preview.matchupText} (${preview.matchupMult.toFixed(1)}x)</div>
            <div class="combat-buttons">
                <button onclick="window._combatAction('fight')">Fight</button>
                <button onclick="window._combatAction('deathmatch')">Fight to Death</button>
                <button onclick="window._combatAction('truce')">Offer Truce</button>
                <button onclick="window._combatAction('demand_surrender')">Demand Surrender</button>
                <button onclick="window._combatAction('withdraw')">Withdraw</button>
                <button onclick="window._combatAction('retreat')">Retreat</button>
            </div>
            <div class="combat-log" id="combatLog"></div>
        </div>
    `;

    let overlay = document.getElementById('combatOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'combatOverlay';
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = html;
    overlay.style.display = 'flex';

    window._combatAction = (action) => {
        const logEl = document.getElementById('combatLog');

        if (action === 'retreat') {
            overlay.style.display = 'none';
            updateStatusBar(`Your ${atkStats.name} retreated.`);
            gameState.selectedUnit = null;
            gameState.movementRange = null;
            return;
        }

        if (action === 'withdraw') {
            const result = runCombatRound(attacker, defender, gameState.map);
            logCombatResult(result, attacker, defender);
            cleanupCombat(attacker, defender, overlay);
            overlay.style.display = 'none';
            return;
        }

        if (action === 'truce') {
            const accepted = offerTruce(attacker, defender, gameState.map);
            if (accepted) {
                if (logEl) logEl.innerHTML += `<div style="color:#8cf">Truce accepted! Both sides stand down.</div>`;
                updateStatusBar('Truce accepted. Both units remain.');
                setTimeout(() => { overlay.style.display = 'none'; }, 1200);
                gameState.selectedUnit = null;
                gameState.movementRange = null;
            } else {
                if (logEl) logEl.innerHTML += `<div style="color:#f88">Truce rejected! The enemy refuses to stop fighting.</div>`;
                updateStatusBar('Truce rejected!');
            }
            return;
        }

        if (action === 'demand_surrender') {
            // AI surrenders if they're heavily outmatched
            const preview2 = getCombatPreview(attacker, defender, gameState.map);
            const willSurrender = preview2.attackerOdds >= 75 || (preview2.attackerOdds >= 60 && Math.random() < 0.4);

            if (willSurrender) {
                const capture = processSurrender(attacker, defender);
                if (logEl) logEl.innerHTML += `<div style="color:#8f8">Enemy ${defStats.name} surrenders!</div>`;
                showCaptureDialog(attacker, capture, overlay);
            } else {
                if (logEl) logEl.innerHTML += `<div style="color:#f88">Surrender demand refused! The enemy fights on.</div>`;
                updateStatusBar('Surrender refused!');
            }
            return;
        }

        // Fight or Fight to Death
        const toTheDeath = action === 'deathmatch';
        let rounds = 0;
        const maxRounds = toTheDeath ? 100 : 20;

        const fightRound = () => {
            if (attacker.troops <= 0 || defender.troops <= 0 || rounds >= maxRounds) {
                if (defender.troops <= 0 && attacker.troops > 0) {
                    // Victory — show capture options
                    const capture = calculateCapture(attacker, defender);
                    showCaptureDialog(attacker, capture, overlay);
                } else {
                    cleanupCombat(attacker, defender, overlay);
                    overlay.style.display = 'none';
                }
                return;
            }

            const result = runCombatRound(attacker, defender, gameState.map);
            rounds++;

            if (logEl) {
                logEl.innerHTML += `<div>Round ${rounds}: You lost ${result.attackerLoss}, enemy lost ${result.defenderLoss}</div>`;
                logEl.scrollTop = logEl.scrollHeight;
            }

            setTimeout(fightRound, 200);
        };

        fightRound();
    };
}

// Show capture options after defeating/capturing an enemy unit
function showCaptureDialog(winner, capture, combatOverlay) {
    const winnerStats = UNIT_STATS[winner.type];
    const logEl = document.getElementById('combatLog');

    const equipDesc = [];
    if (capture.equipAtkBonus > 0) equipDesc.push(`+${capture.equipAtkBonus} ATK`);
    if (capture.equipDefBonus > 0) equipDesc.push(`+${capture.equipDefBonus} DEF`);
    const equipText = equipDesc.join(', ');

    let captureHtml = `<div style="margin-top:10px;padding:8px;background:#1a2a1a;border:1px solid #3a5a3a;border-radius:4px;">
        <div style="color:#8f8;font-weight:bold;margin-bottom:6px;">Victory! Captured spoils:</div>
        <div>Prisoners: ${capture.troops} troops (${capture.loserName})</div>
        <div>Equipment: worth ${capture.equipment}g or use for ${equipText}</div>
        <div style="margin-top:8px;">`;

    if (capture.canAbsorb && capture.troops > 0) {
        const maxAbsorb = Math.min(capture.troops, UNIT_STATS[winner.type].maxTroops - winner.troops);
        if (maxAbsorb > 0) {
            captureHtml += `<button onclick="window._captureAction('absorb')" style="margin:2px">Absorb ${maxAbsorb} troops</button>`;
        }
    }
    captureHtml += `<button onclick="window._captureAction('use_equip')" style="margin:2px">Use equipment (${equipText})</button>`;
    captureHtml += `<button onclick="window._captureAction('sell_equip')" style="margin:2px">Sell equipment (+${capture.equipment}g)</button>`;
    captureHtml += `<button onclick="window._captureAction('absorb_and_use')" style="margin:2px">Troops + use equipment</button>`;
    captureHtml += `<button onclick="window._captureAction('absorb_and_sell')" style="margin:2px">Troops + sell equipment</button>`;
    captureHtml += `<button onclick="window._captureAction('disband')" style="margin:2px">Disband all</button>`;
    captureHtml += `</div></div>`;

    if (logEl) {
        logEl.innerHTML += captureHtml;
        logEl.scrollTop = logEl.scrollHeight;
    }

    window._captureAction = (choice) => {
        const player = gameState.players[0];
        const msgs = [];

        // Absorb troops
        if (choice === 'absorb' || choice === 'absorb_and_use' || choice === 'absorb_and_sell') {
            if (capture.canAbsorb && capture.troops > 0) {
                const absorbed = absorbCaptured(winner, capture.troops);
                msgs.push(`Absorbed ${absorbed} troops`);
            }
        }

        // Use captured equipment — permanent stat boost
        if (choice === 'use_equip' || choice === 'absorb_and_use') {
            equipCaptured(winner, capture.equipAtkBonus, capture.equipDefBonus);
            const bonusParts = [];
            if (capture.equipAtkBonus > 0) bonusParts.push(`+${capture.equipAtkBonus} ATK`);
            if (capture.equipDefBonus > 0) bonusParts.push(`+${capture.equipDefBonus} DEF`);
            msgs.push(`Equipped captured gear (${bonusParts.join(', ')})`);
        }

        // Sell captured equipment for gold
        if (choice === 'sell_equip' || choice === 'absorb_and_sell') {
            player.treasury += capture.equipment;
            msgs.push(`Sold equipment for ${capture.equipment}g`);
        }

        if (choice === 'disband') {
            msgs.push('All captured spoils disbanded');
        }

        updateStatusBar(`${winnerStats.name}: ${msgs.join('. ')}. Treasury: ${player.treasury}g`);
        cleanupCombat(winner, { troops: 0, owner: -1 }, combatOverlay);
        combatOverlay.style.display = 'none';
    };
}

function logCombatResult(result, attacker, defender) {
    const atkStats = UNIT_STATS[attacker.type];
    const defStats = UNIT_STATS[defender.type];
    updateStatusBar(`Combat: Your ${atkStats.name} lost ${result.attackerLoss}, enemy ${defStats.name} lost ${result.defenderLoss}.`);
}

function cleanupCombat(attacker, defender) {
    if (defender.troops <= 0) {
        const idx = gameState.units.indexOf(defender);
        if (idx !== -1) {
            gameState.units.splice(idx, 1);
            if (defender.type) updateStatusBar(`Enemy ${UNIT_STATS[defender.type].name} destroyed!`);
        }

        if (attacker.troops > 0) {
            const capture = tryCaptureCity(attacker, gameState.map, gameState.units);
            if (capture) {
                updateStatusBar(`${capture.city.name} captured!`);
            }
        }
    }

    if (attacker.troops <= 0) {
        const idx = gameState.units.indexOf(attacker);
        if (idx !== -1) gameState.units.splice(idx, 1);
        updateStatusBar(`Your ${UNIT_STATS[attacker.type].name} was destroyed!`);
    }

    const dead = checkCommanderDeath(gameState.units);
    for (const deadOwner of dead) {
        const player = gameState.players[deadOwner];
        if (player && player.alive) {
            player.alive = false;
            if (deadOwner === 0) {
                gameState.phase = 'gameover';
                updateStatusBar('Your commander has been killed! You lose.');
                showGameOverDialog(false);
            } else {
                updateStatusBar(`${player.name} has been eliminated!`);
                const aiAlive = gameState.players.filter(p => !p.isHuman && p.alive);
                if (aiAlive.length === 0) {
                    gameState.phase = 'gameover';
                    gameState.winner = gameState.players[0];
                    showGameOverDialog(true);
                }
            }
        }
    }

    gameState.selectedUnit = null;
    gameState.movementRange = null;
}

// ─── Game Over ────────────────────────────────────────────────────

function showGameOverDialog(won) {
    let overlay = document.getElementById('gameOverOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'gameOverOverlay';
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
        <div class="gameover-dialog">
            <h2>${won ? 'VICTORY!' : 'DEFEAT'}</h2>
            <p>${won ? 'All enemy commanders have been eliminated. You win!' : 'Your commander has fallen. The war is lost.'}</p>
            <p>Turns: ${gameState.turn} | Cities held: ${gameState.map.cities.filter(c => c.owner === 0).length}</p>
            <button onclick="document.getElementById('gameOverOverlay').style.display='none'">OK</button>
        </div>
    `;
    overlay.style.display = 'flex';
}

// ─── Turn Management ──────────────────────────────────────────────

function endTurn() {
    if (gameState.phase !== 'playing') return;

    const log = turnManager.endTurn();

    let statusMsg = `Turn ${gameState.turn}`;
    if (log.length > 0) {
        statusMsg += ' — ' + log[log.length - 1];
    }

    const player = gameState.players[0];
    statusMsg += ` | Gold: ${player.treasury}`;

    updateStatusBar(statusMsg);

    // Show toast notifications for tech upgrades, revolts, etc.
    showTurnNotifications();

    // Also notify revolts
    if (log.some(l => l.includes('Revolt'))) {
        for (const line of log) {
            if (line.includes('Revolt')) {
                showNotification('Revolt!', line, 'revolt', 5000);
            }
        }
    }

    _lastInfoKey = null; // force info panel refresh

    if (gameState.phase === 'gameover') {
        showGameOverDialog(gameState.winner && gameState.winner.id === 0);
    }
}

// ─── Investment Panel ─────────────────────────────────────────────

function showInvestPanel() {
    const myCities = gameState.map.cities.filter(c => c.owner === 0);
    if (myCities.length === 0) {
        updateStatusBar('You have no cities to invest in.');
        return;
    }

    const city = (gameState.selectedCity && gameState.selectedCity.owner === 0)
        ? gameState.selectedCity : myCities[0];

    const inv = city.investment;

    let overlay = document.getElementById('investOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'investOverlay';
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
        <div class="invest-dialog">
            <h3>Investment — ${city.name}</h3>
            <p>Tax Rate: <input type="range" id="taxSlider" min="0" max="80" value="${city.taxRate}">
            <span id="taxValue">${city.taxRate}%</span></p>
            <div class="invest-row">
                <label>Defense: <input type="range" class="inv-slider" data-sector="defense" min="0" max="100" value="${inv.defense}">
                <span class="inv-val">${inv.defense}%</span></label>
            </div>
            <div class="invest-row">
                <label>Knowledge: <input type="range" class="inv-slider" data-sector="knowledge" min="0" max="100" value="${inv.knowledge}">
                <span class="inv-val">${inv.knowledge}%</span></label>
            </div>
            <div class="invest-row">
                <label>Public: <input type="range" class="inv-slider" data-sector="public" min="0" max="100" value="${inv.public}">
                <span class="inv-val">${inv.public}%</span></label>
            </div>
            <div class="invest-row">
                <label>Economics: <input type="range" class="inv-slider" data-sector="economics" min="0" max="100" value="${inv.economics}">
                <span class="inv-val">${inv.economics}%</span></label>
            </div>
            <div class="invest-buttons">
                <button id="investApply">Apply</button>
                <button id="investClose">Close</button>
            </div>
        </div>
    `;
    overlay.style.display = 'flex';

    const taxSlider = document.getElementById('taxSlider');
    taxSlider.addEventListener('input', () => {
        document.getElementById('taxValue').textContent = taxSlider.value + '%';
    });

    overlay.querySelectorAll('.inv-slider').forEach(slider => {
        slider.addEventListener('input', () => {
            slider.nextElementSibling.textContent = slider.value + '%';
        });
    });

    document.getElementById('investApply').addEventListener('click', () => {
        city.taxRate = parseInt(taxSlider.value);
        const sliders = overlay.querySelectorAll('.inv-slider');
        const values = {};
        sliders.forEach(s => { values[s.dataset.sector] = parseInt(s.value); });

        const total = Object.values(values).reduce((a, b) => a + b, 0) || 1;
        const scale = 100 / total;
        city.investment = {
            defense: Math.round(values.defense * scale),
            knowledge: Math.round(values.knowledge * scale),
            public: Math.round(values.public * scale),
            economics: Math.round(values.economics * scale),
        };

        updateStatusBar(`Investment updated for ${city.name}. Tax: ${city.taxRate}%`);
        overlay.style.display = 'none';
    });

    document.getElementById('investClose').addEventListener('click', () => {
        overlay.style.display = 'none';
    });
}

// ─── Orders Panel ─────────────────────────────────────────────────

function showOrdersPanel() {
    const unit = gameState.selectedUnit;
    if (!unit || unit.owner !== 0) {
        updateStatusBar('Select one of your units first.');
        return;
    }

    const stats = UNIT_STATS[unit.type];
    const orders = Object.values(ORDER);

    let overlay = document.getElementById('ordersOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'ordersOverlay';
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
        <div class="orders-dialog">
            <h3>Orders — ${stats.name} (${unit.troops} troops)</h3>
            <p>Current order: <strong>${unit.orders}</strong></p>
            <div class="order-buttons">
                ${orders.map(o => `<button class="order-btn ${unit.orders === o ? 'active' : ''}" data-order="${o}">${o.replace('_', ' ').toUpperCase()}</button>`).join('')}
            </div>
            <button id="ordersClose" style="margin-top:10px">Close</button>
        </div>
    `;
    overlay.style.display = 'flex';

    overlay.querySelectorAll('.order-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setOrder(unit, btn.dataset.order);
            overlay.querySelectorAll('.order-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateStatusBar(`${stats.name} orders set to: ${unit.orders.replace('_', ' ')}`);
        });
    });

    document.getElementById('ordersClose').addEventListener('click', () => {
        overlay.style.display = 'none';
    });
}

// ─── List Panel ───────────────────────────────────────────────────

function showListPanel() {
    const myCities = gameState.map.cities.filter(c => c.owner === 0);
    const myUnits = gameState.units.filter(u => u.owner === 0);
    const player = gameState.players[0];

    let overlay = document.getElementById('listOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'listOverlay';
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);
    }

    const cityRows = myCities.map(c => `
        <tr><td>${c.name}</td><td>${c.population.toLocaleString()}</td><td>${c.garrison}</td><td>${c.defense}</td><td>${c.economics}</td></tr>
    `).join('');

    const unitRows = myUnits.map(u => {
        const s = UNIT_STATS[u.type];
        return `<tr><td>${s.symbol} ${s.name}</td><td>${u.troops}</td><td>${u.orders}</td><td>${u.movesRemaining}/${s.move}</td></tr>`;
    }).join('');

    overlay.innerHTML = `
        <div class="list-dialog">
            <h3>Your Empire — Gold: ${player.treasury}</h3>
            <h4>Cities (${myCities.length})</h4>
            <table class="list-table">
                <tr><th>City</th><th>Pop</th><th>Garrison</th><th>Def</th><th>Eco</th></tr>
                ${cityRows || '<tr><td colspan="5">No cities</td></tr>'}
            </table>
            <h4>Units (${myUnits.length})</h4>
            <table class="list-table">
                <tr><th>Unit</th><th>Troops</th><th>Orders</th><th>Moves</th></tr>
                ${unitRows || '<tr><td colspan="4">No units</td></tr>'}
            </table>
            <button id="listClose" style="margin-top:10px">Close</button>
        </div>
    `;
    overlay.style.display = 'flex';

    document.getElementById('listClose').addEventListener('click', () => {
        overlay.style.display = 'none';
    });
}

// ─── Reports Panel ────────────────────────────────────────────────

function showReportsPanel() {
    const player = gameState.players[0];
    const myCities = gameState.map.cities.filter(c => c.owner === 0);
    const myUnits = gameState.units.filter(u => u.owner === 0);
    const totalTroops = myUnits.reduce((sum, u) => sum + u.troops, 0);

    const opponentInfo = gameState.players.filter(p => p.id !== 0).map(p => {
        const theirCities = gameState.map.cities.filter(c => c.owner === p.id);
        const theirUnits = gameState.units.filter(u => u.owner === p.id);
        const theirTroops = theirUnits.reduce((sum, u) => sum + u.troops, 0);
        return `<tr><td style="color:${PLAYER_COLORS[p.id]}">${p.name}</td><td>${p.alive ? 'Active' : 'Eliminated'}</td><td>${theirCities.length}</td><td>${theirUnits.length}</td><td>${theirTroops.toLocaleString()}</td></tr>`;
    }).join('');

    let overlay = document.getElementById('reportsOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'reportsOverlay';
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
        <div class="reports-dialog">
            <h3>Strategic Report — Turn ${gameState.turn}</h3>
            <div class="report-section">
                <h4>Your Forces</h4>
                <div class="stat-row"><span>Cities:</span><span>${myCities.length}</span></div>
                <div class="stat-row"><span>Units:</span><span>${myUnits.length}</span></div>
                <div class="stat-row"><span>Total Troops:</span><span>${totalTroops.toLocaleString()}</span></div>
                <div class="stat-row"><span>Treasury:</span><span>${player.treasury} gold</span></div>
            </div>
            <div class="report-section">
                <h4>Opponents</h4>
                <table class="list-table">
                    <tr><th>Name</th><th>Status</th><th>Cities</th><th>Units</th><th>Troops</th></tr>
                    ${opponentInfo}
                </table>
            </div>
            <button id="reportsClose" style="margin-top:10px">Close</button>
        </div>
    `;
    overlay.style.display = 'flex';

    document.getElementById('reportsClose').addEventListener('click', () => {
        overlay.style.display = 'none';
    });
}

// ─── Info Panel (City + Units at selected hex) ───────────────────

let _lastInfoKey = null; // track what the panel is showing to avoid per-frame rebuilds

function updateInfoPanel() {
    const panel = document.getElementById('infoPanel');
    const hex = gameState.selectedHex;

    if (!hex) {
        panel.classList.remove('visible');
        _lastInfoKey = null;
        return;
    }

    const key = hexKey(hex.q, hex.r);
    const tile = gameState.map.tiles.get(key);
    const city = tile && tile.city ? tile.city : null;
    const unitsHere = gameState.units.filter(u => u.q === hex.q && u.r === hex.r);

    // Build a fingerprint to avoid rebuilding every frame
    const unitFingerprint = unitsHere.map(u => `${u.id}:${u.troops}:${u.orders}:${u.movesRemaining}`).join('|');
    const infoKey = `${key}:${city ? city.owner + ':' + city.population + ':' + city.garrison : 'none'}:${unitFingerprint}:${gameState.selectedUnit ? gameState.selectedUnit.id : 'x'}`;
    if (infoKey === _lastInfoKey) return;
    _lastInfoKey = infoKey;

    // Nothing to show?
    if (!city && unitsHere.length === 0) {
        panel.classList.remove('visible');
        return;
    }

    panel.classList.add('visible');

    // ── City section ──
    const citySection = document.getElementById('citySection');
    if (city) {
        citySection.style.display = 'block';
        document.getElementById('cityName').textContent = city.name;
        document.getElementById('cityOwner').textContent = city.owner === null ? 'Neutral' : city.owner === 0 ? 'You' : `${gameState.players[city.owner]?.name || 'Unknown'}`;
        document.getElementById('cityPop').textContent = city.population.toLocaleString();
        const cityTier = getTechTier(city.knowledge);
        const nextTier = getNextTechTier(city.knowledge);
        const progressText = nextTier ? ` (${Math.floor(city.knowledge)}/${nextTier.minKnowledge} → ${nextTier.name})` : ' (MAX)';
        document.getElementById('cityKnowledge').textContent = `${Math.floor(city.knowledge)} — ${cityTier.name}${progressText}`;
        document.getElementById('cityDefense').textContent = Math.floor(city.defense);
        document.getElementById('cityEconomics').textContent = Math.floor(city.economics);
        document.getElementById('citySatisfaction').textContent = Math.floor(city.satisfaction);
        document.getElementById('cityGarrison').textContent = city.garrison;

        const rating = calculateCityRating(city);
        const gradeEl = document.getElementById('cityGrade');
        gradeEl.textContent = rating.grade;
        gradeEl.className = 'rating-grade ' + rating.gradeClass;
        document.getElementById('cityScore').textContent = `${rating.score}/100 composite`;
        document.getElementById('citySummary').textContent = rating.summary;

        // Recruit button
        const wrap = document.getElementById('recruitBtnWrap');
        if (city.owner === 0) {
            wrap.innerHTML = '<button id="recruitBtn" style="margin-top:8px;width:100%;padding:6px;background:#2a5a2a;color:#8f8;border:1px solid #4a4a4a;cursor:pointer;border-radius:3px;">Recruit Unit</button>';
            document.getElementById('recruitBtn').onclick = () => showRecruitDialog(city);
        } else {
            wrap.innerHTML = '';
        }
    } else {
        citySection.style.display = 'none';
    }

    // ── Units section ──
    const unitsSection = document.getElementById('unitsSection');
    const unitsList = document.getElementById('unitsList');

    if (unitsHere.length > 0) {
        unitsSection.style.display = 'block';

        // Build unit cards
        let html = '';
        for (const unit of unitsHere) {
            const stats = UNIT_STATS[unit.type];
            const isSelected = gameState.selectedUnit && gameState.selectedUnit.id === unit.id;
            const isMine = unit.owner === 0;
            const ownerColor = PLAYER_COLORS[unit.owner] || '#888';
            const orders = Object.values(ORDER);

            html += `<div class="unit-card ${isSelected ? 'selected' : ''}" data-unit-id="${unit.id}">
                <div class="unit-card-header">
                    <span class="unit-card-symbol" style="color:${ownerColor}">${stats.symbol}</span>
                    <span class="unit-card-name">${stats.name}</span>
                    <span class="unit-card-toggle">[+]</span>
                </div>
                <div class="unit-card-details">
                    <div class="unit-card-stat"><span>Owner:</span><span style="color:${ownerColor}">${isMine ? 'You' : gameState.players[unit.owner]?.name || '?'}</span></div>
                    <div class="unit-card-stat"><span>Troops:</span><span>${unit.troops}/${unit.maxTroops}</span></div>
                    <div class="unit-card-stat"><span>Moves:</span><span>${unit.movesRemaining}/${stats.move}</span></div>
                    <div class="unit-card-stat"><span>Attack:</span><span>${stats.attack}${unit.equipBonusAtk ? ` <span style="color:#8f8">+${unit.equipBonusAtk.toFixed(1)}</span>` : ''}</span></div>
                    <div class="unit-card-stat"><span>Defense:</span><span>${stats.defense}${unit.equipBonusDef ? ` <span style="color:#8cf">+${unit.equipBonusDef.toFixed(1)}</span>` : ''}</span></div>
                    ${unit.techName ? `<div class="unit-card-stat"><span>Tech:</span><span style="color:#ac8">${unit.techName} era</span></div>` : ''}
                    <div class="unit-card-stat"><span>Orders:</span><span>${unit.orders === 'move_to' && unit.moveTarget ? `moving to (${unit.moveTarget.q},${unit.moveTarget.r})` : unit.orders}</span></div>
                    ${isMine && city && city.owner === 0 && unit.troops < stats.maxTroops && unit.type !== UNIT_TYPE.COMMANDER ? (() => {
                        const costPerTroop = Math.max(1, Math.round(stats.cost / Math.max(1, stats.maxTroops) * (1 + (100 - city.economics) / 100)));
                        const missing = stats.maxTroops - unit.troops;
                        return `<div class="unit-card-stat"><span>Replenish:</span><span>${costPerTroop}g/troop (${missing} needed)</span></div>
                        <button class="unit-replenish-btn" data-unit-id="${unit.id}" data-cost="${costPerTroop}" style="margin:4px 0;padding:3px 8px;background:#2a4a2a;color:#8f8;border:1px solid #4a4a4a;border-radius:3px;cursor:pointer;font-size:11px;width:100%;">Replenish Troops</button>`;
                    })() : ''}
                    ${isMine ? `<div class="unit-card-orders">
                        ${orders.filter(o => o !== 'move_to').map(o => `<button class="unit-order-btn ${unit.orders === o ? 'active' : ''}" data-unit-id="${unit.id}" data-order="${o}">${o.replace('_', ' ')}</button>`).join('')}
                        <button class="unit-order-btn unit-moveto-btn ${unit.orders === 'move_to' ? 'active' : ''}" data-unit-id="${unit.id}">move to...</button>
                    </div>` : ''}
                </div>
            </div>`;
        }
        unitsList.innerHTML = html;

        // Bind click handlers for unit cards
        unitsList.querySelectorAll('.unit-card').forEach(card => {
            const unitId = parseInt(card.dataset.unitId);
            const unit = gameState.units.find(u => u.id === unitId);

            // Click header to toggle details
            const header = card.querySelector('.unit-card-header');
            const details = card.querySelector('.unit-card-details');
            const toggle = card.querySelector('.unit-card-toggle');

            header.addEventListener('click', () => {
                const isOpen = details.classList.contains('open');
                details.classList.toggle('open');
                toggle.textContent = isOpen ? '[+]' : '[-]';

                // Select this unit if it's ours
                if (unit && unit.owner === 0) {
                    input.selectUnit(unit);
                    // Keep city selected too
                    if (city) gameState.selectedCity = city;
                }
            });
        });

        // Bind order buttons (non-moveto)
        unitsList.querySelectorAll('.unit-order-btn:not(.unit-moveto-btn)').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const unitId = parseInt(btn.dataset.unitId);
                const unit = gameState.units.find(u => u.id === unitId);
                if (unit) {
                    setOrder(unit, btn.dataset.order);
                    // Update active state
                    const card = btn.closest('.unit-card');
                    card.querySelectorAll('.unit-order-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    // Update the orders display
                    const orderStat = card.querySelector('.unit-card-stat:nth-child(6) span:last-child');
                    if (orderStat) orderStat.textContent = btn.dataset.order;
                    updateStatusBar(`${UNIT_STATS[unit.type].name} orders: ${btn.dataset.order.replace('_', ' ')}`);
                }
            });
        });

        // Bind "move to..." buttons
        unitsList.querySelectorAll('.unit-moveto-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const unitId = parseInt(btn.dataset.unitId);
                const unit = gameState.units.find(u => u.id === unitId);
                if (!unit) return;

                // Enter destination-pick mode
                gameState.moveToPickUnit = unit;
                document.body.style.cursor = 'crosshair';
                updateStatusBar(`Click a hex to set move-to destination for ${UNIT_STATS[unit.type].name}. Press Escape to cancel.`);
            });
        });

        // Bind replenish buttons
        unitsList.querySelectorAll('.unit-replenish-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const unitId = parseInt(btn.dataset.unitId);
                const costPerTroop = parseInt(btn.dataset.cost);
                const unit = gameState.units.find(u => u.id === unitId);
                if (!unit) return;

                const player = gameState.players[0];
                const stats = UNIT_STATS[unit.type];
                const missing = stats.maxTroops - unit.troops;
                const affordable = Math.floor(player.treasury / costPerTroop);
                const toAdd = Math.min(missing, affordable);

                if (toAdd <= 0) {
                    updateStatusBar('Not enough gold to replenish.');
                    return;
                }

                const totalCost = toAdd * costPerTroop;
                player.treasury -= totalCost;
                unit.troops += toAdd;
                unit.maxTroops = Math.max(unit.maxTroops, unit.troops);

                // Conscript from local population
                const conscripted = Math.min(city.population * 0.05, toAdd * 0.5);
                city.population = Math.max(100, Math.floor(city.population - conscripted));

                updateStatusBar(`Replenished ${toAdd} troops for ${stats.name}. Cost: ${totalCost}g. Treasury: ${player.treasury}g`);
                _lastInfoKey = null; // force panel refresh
            });
        });

        // Show "Manage Troops" button when 2+ of our units share this hex
        const myUnitsHere = unitsHere.filter(u => u.owner === 0);
        if (myUnitsHere.length >= 2) {
            const manageBtn = document.createElement('button');
            manageBtn.textContent = 'Manage Troops';
            manageBtn.style.cssText = 'margin-top:8px;width:100%;padding:6px;background:#2a4a6a;color:#8cf;border:1px solid #4a4a4a;cursor:pointer;border-radius:3px;';
            manageBtn.addEventListener('click', () => showManageTroopsDialog(hex, myUnitsHere));
            unitsList.appendChild(manageBtn);
        }
    } else {
        unitsSection.style.display = 'none';
    }
}

// ─── Manage Troops Dialog (merge / transfer) ─────────────────────

function showManageTroopsDialog(hex, myUnits) {
    let overlay = document.getElementById('manageTroopsOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'manageTroopsOverlay';
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);
    }

    function render() {
        // Re-fetch units at this hex (they may have changed)
        const units = gameState.units.filter(u => u.owner === 0 && u.q === hex.q && u.r === hex.r);

        const unitRows = units.map(u => {
            const s = UNIT_STATS[u.type];
            return `<div class="manage-unit-row" data-unit-id="${u.id}">
                <span class="recruit-symbol">${s.symbol}</span>
                <span class="recruit-name">${s.name}</span>
                <span style="margin-left:auto;font-weight:bold">${u.troops} troops</span>
            </div>`;
        }).join('');

        // Build merge options: for each pair of units, offer merge
        let mergeHtml = '';
        for (let i = 0; i < units.length; i++) {
            for (let j = i + 1; j < units.length; j++) {
                const a = units[i], b = units[j];
                const sa = UNIT_STATS[a.type], sb = UNIT_STATS[b.type];
                const totalTroops = a.troops + b.troops;
                // Can merge into either type
                mergeHtml += `<div class="manage-merge-row">
                    <span>${sa.symbol} ${sa.name} (${a.troops}) + ${sb.symbol} ${sb.name} (${b.troops})</span>
                    <div style="margin-top:4px">
                        <button class="merge-btn" data-from="${b.id}" data-into="${a.id}">Merge into ${sa.name} (${Math.min(totalTroops, sa.maxTroops)})</button>
                        <button class="merge-btn" data-from="${a.id}" data-into="${b.id}">Merge into ${sb.name} (${Math.min(totalTroops, sb.maxTroops)})</button>
                    </div>
                </div>`;
            }
        }

        // Build transfer options
        let transferHtml = '';
        if (units.length >= 2) {
            transferHtml = `<div class="manage-transfer-row">
                <label>From:
                    <select id="transferFrom">
                        ${units.map(u => `<option value="${u.id}">${UNIT_STATS[u.type].symbol} ${UNIT_STATS[u.type].name} (${u.troops})</option>`).join('')}
                    </select>
                </label>
                <label>To:
                    <select id="transferTo">
                        ${units.map((u, i) => `<option value="${u.id}" ${i === 1 ? 'selected' : ''}>${UNIT_STATS[u.type].symbol} ${UNIT_STATS[u.type].name} (${u.troops})</option>`).join('')}
                    </select>
                </label>
                <label>Troops: <input type="number" id="transferAmount" min="1" value="1" style="width:60px"></label>
                <button id="transferBtn">Transfer</button>
            </div>`;
        }

        overlay.innerHTML = `
            <div class="recruit-dialog" style="max-width:500px">
                <h3>Manage Troops at (${hex.q}, ${hex.r})</h3>
                <h4>Units Here</h4>
                ${unitRows}
                <h4 style="margin-top:12px">Merge Units</h4>
                ${mergeHtml || '<p>Need 2+ units to merge</p>'}
                <h4 style="margin-top:12px">Transfer Troops</h4>
                ${transferHtml}
                <button id="manageTroopsClose" style="margin-top:12px">Close</button>
            </div>
        `;
        overlay.style.display = 'flex';

        // Merge handlers
        overlay.querySelectorAll('.merge-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const fromId = parseInt(btn.dataset.from);
                const intoId = parseInt(btn.dataset.into);
                const fromUnit = gameState.units.find(u => u.id === fromId);
                const intoUnit = gameState.units.find(u => u.id === intoId);
                if (!fromUnit || !intoUnit) return;

                const intoStats = UNIT_STATS[intoUnit.type];
                const transferred = Math.min(fromUnit.troops, intoStats.maxTroops - intoUnit.troops);
                intoUnit.troops += transferred;
                intoUnit.maxTroops = Math.max(intoUnit.maxTroops, intoUnit.troops);
                fromUnit.troops -= transferred;

                // If the remaining troops from the source exceed what was transferred,
                // some couldn't fit — they stay. If source is empty, remove it.
                if (fromUnit.troops <= 0) {
                    const idx = gameState.units.indexOf(fromUnit);
                    if (idx !== -1) gameState.units.splice(idx, 1);
                }

                updateStatusBar(`Merged ${transferred} troops into ${intoStats.name}. Now ${intoUnit.troops} troops.`);
                _lastInfoKey = null;

                // Re-render the dialog with updated numbers
                const remaining = gameState.units.filter(u => u.owner === 0 && u.q === hex.q && u.r === hex.r);
                if (remaining.length < 2) {
                    overlay.style.display = 'none';
                } else {
                    render();
                }
            });
        });

        // Transfer handler
        const transferBtn = document.getElementById('transferBtn');
        if (transferBtn) {
            // Stop clicks on selects/inputs from closing dialog
            overlay.querySelectorAll('select, input').forEach(el => {
                el.addEventListener('click', (e) => e.stopPropagation());
            });

            transferBtn.addEventListener('click', () => {
                const fromId = parseInt(document.getElementById('transferFrom').value);
                const toId = parseInt(document.getElementById('transferTo').value);
                const amount = parseInt(document.getElementById('transferAmount').value) || 0;

                if (fromId === toId) {
                    updateStatusBar('Cannot transfer to the same unit.');
                    return;
                }

                const fromUnit = gameState.units.find(u => u.id === fromId);
                const toUnit = gameState.units.find(u => u.id === toId);
                if (!fromUnit || !toUnit) return;

                const toStats = UNIT_STATS[toUnit.type];
                const maxTransfer = Math.min(amount, fromUnit.troops - 1, toStats.maxTroops - toUnit.troops);
                if (maxTransfer < 1) {
                    updateStatusBar('Cannot transfer — source needs at least 1 troop, or target is full.');
                    return;
                }

                fromUnit.troops -= maxTransfer;
                toUnit.troops += maxTransfer;
                toUnit.maxTroops = Math.max(toUnit.maxTroops, toUnit.troops);

                updateStatusBar(`Transferred ${maxTransfer} troops from ${UNIT_STATS[fromUnit.type].name} to ${toStats.name}.`);
                _lastInfoKey = null;
                render();
            });
        }

        document.getElementById('manageTroopsClose').addEventListener('click', () => {
            overlay.style.display = 'none';
        });
    }

    render();
}

function showRecruitDialog(city) {
    const player = gameState.players[0];
    const available = getRecruitableUnits(city, player.treasury);

    let overlay = document.getElementById('recruitOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'recruitOverlay';
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);
    }

    const rows = available.map(u => {
        const maxAfford = Math.floor(player.treasury / u.cost);
        return `
        <div class="recruit-option" data-type="${u.type}">
            <span class="recruit-symbol">${u.symbol}</span>
            <span class="recruit-name">${u.name}</span>
            <span class="recruit-stats">ATK:${u.attack} DEF:${u.defense} MOV:${u.move}</span>
            <span class="recruit-cost">${u.cost}g</span>
            <span class="recruit-qty">
                x<select class="recruit-count" data-type="${u.type}">
                    ${[1,2,3,5,10].filter(n => n <= maxAfford).map(n => `<option value="${n}">${n}</option>`).join('')}
                </select>
            </span>
        </div>`;
    }).join('');

    // Find splittable units at this city (own units with troops > 1)
    const splittableUnits = gameState.units.filter(u =>
        u.owner === 0 && u.q === city.q && u.r === city.r && u.troops > 1 && u.type !== UNIT_TYPE.COMMANDER
    );

    const splitRows = splittableUnits.map(u => {
        const stats = UNIT_STATS[u.type];
        return `
        <div class="split-option" data-unit-id="${u.id}">
            <span class="recruit-symbol">${stats.symbol}</span>
            <span class="recruit-name">${stats.name} (${u.troops} troops)</span>
            <span class="recruit-qty">
                Split off: <input type="number" class="split-amount" data-unit-id="${u.id}" min="1" max="${u.troops - 1}" value="${Math.floor(u.troops / 2)}" style="width:50px">
            </span>
        </div>`;
    }).join('');

    overlay.innerHTML = `
        <div class="recruit-dialog">
            <h3>Recruit at ${city.name}</h3>
            <p id="recruitTreasury">Treasury: ${player.treasury} gold | City Pop: ${city.population.toLocaleString()}</p>
            <h4>Recruit New Units</h4>
            ${rows || '<p>No units available (insufficient funds or population)</p>'}
            ${splittableUnits.length > 0 ? `<h4 style="margin-top:12px">Split Existing Units</h4>${splitRows}` : ''}
            <button id="recruitClose" style="margin-top:10px">Close</button>
        </div>
    `;
    overlay.style.display = 'flex';

    // Stop clicks on selects/inputs from bubbling to the recruit-option
    overlay.querySelectorAll('select, input').forEach(el => {
        el.addEventListener('click', (e) => e.stopPropagation());
    });

    // Recruit handlers
    overlay.querySelectorAll('.recruit-option').forEach(el => {
        el.addEventListener('click', () => {
            const type = el.dataset.type;
            const stats = UNIT_STATS[type];
            const countSelect = el.querySelector('.recruit-count');
            const count = countSelect ? parseInt(countSelect.value) : 1;
            const totalCost = stats.cost * count;

            if (player.treasury < totalCost) {
                updateStatusBar('Not enough gold!');
                return;
            }

            for (let i = 0; i < count; i++) {
                player.treasury -= stats.cost;
                const conscripted = Math.min(city.population * 0.1, stats.maxTroops * 0.3);
                city.population = Math.max(100, Math.floor(city.population - conscripted));
                const unit = createUnit(type, 0, city);
                gameState.units.push(unit);
            }

            updateStatusBar(`${count}x ${stats.name} recruited at ${city.name}. Treasury: ${player.treasury}g`);
            _lastInfoKey = null; // force panel refresh
            overlay.style.display = 'none';
        });
    });

    // Split handlers
    overlay.querySelectorAll('.split-option').forEach(el => {
        el.addEventListener('click', () => {
            const unitId = parseInt(el.dataset.unitId);
            const unit = gameState.units.find(u => u.id === unitId);
            if (!unit) return;

            const amountInput = el.querySelector('.split-amount');
            const splitCount = parseInt(amountInput.value) || 0;

            if (splitCount < 1 || splitCount >= unit.troops) {
                updateStatusBar('Invalid split amount.');
                return;
            }

            // Create new unit of same type with split troops
            const newUnit = createUnit(unit.type, 0, city);
            newUnit.troops = splitCount;
            newUnit.maxTroops = splitCount;
            unit.troops -= splitCount;
            unit.maxTroops = unit.troops;
            gameState.units.push(newUnit);

            const stats = UNIT_STATS[unit.type];
            updateStatusBar(`Split ${splitCount} troops from ${stats.name} into new unit.`);
            _lastInfoKey = null; // force panel refresh
            overlay.style.display = 'none';
        });
    });

    document.getElementById('recruitClose').addEventListener('click', () => {
        overlay.style.display = 'none';
    });
}

// ─── Utility ──────────────────────────────────────────────────────

function calculateCityRating(city) {
    // Normalize uncapped stats to a 0-100 scale for rating (but they can exceed 100)
    const popScore = Math.min(100, (city.population / 5000) * 100);
    const knowledgeNorm = Math.min(100, city.knowledge);
    const defenseNorm = Math.min(100, city.defense);
    const economicsNorm = Math.min(100, city.economics);
    const satisfactionNorm = Math.min(100, city.satisfaction);

    let score = Math.round(
        popScore * 0.25 + knowledgeNorm * 0.20 + defenseNorm * 0.20 +
        economicsNorm * 0.25 + satisfactionNorm * 0.10
    );

    // Bonus for exceeding 100 in stats (advanced cities)
    const techTier = getTechTier(city.knowledge);
    if (techTier.tier >= 5) score = Math.min(score + (techTier.tier - 4) * 5, 120);

    let grade, gradeClass;
    if (score >= 100) { grade = 'S+'; gradeClass = 'grade-s'; }
    else if (score >= 80) { grade = 'S'; gradeClass = 'grade-s'; }
    else if (score >= 65) { grade = 'A'; gradeClass = 'grade-a'; }
    else if (score >= 50) { grade = 'B'; gradeClass = 'grade-b'; }
    else if (score >= 35) { grade = 'C'; gradeClass = 'grade-c'; }
    else if (score >= 20) { grade = 'D'; gradeClass = 'grade-d'; }
    else { grade = 'F'; gradeClass = 'grade-f'; }

    const stats = { Population: popScore, Knowledge: knowledgeNorm, Defense: defenseNorm, Economics: economicsNorm, Satisfaction: satisfactionNorm };
    const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
    const strongest = sorted[0][0];
    const weakest = sorted[sorted.length - 1][0];

    let summary;
    if (score >= 65 && sorted[0][1] - sorted[sorted.length - 1][1] < 20) summary = 'Well-rounded, high-value target';
    else if (score >= 50) summary = `Strong ${strongest.toLowerCase()}, weak ${weakest.toLowerCase()}`;
    else if (score >= 30) summary = `Best asset: ${strongest.toLowerCase()}`;
    else summary = 'Low-value settlement';

    return { score, grade, gradeClass, summary, popScore };
}

function updateStatusBar(text) {
    const statusEl = document.getElementById('statusBar');
    if (statusEl) statusEl.textContent = text;
}

// ─── Notification System ─────────────────────────────────────────

function showNotification(title, desc, type = 'info', duration = 4000) {
    const area = document.getElementById('notificationArea');
    if (!area) return;

    const toast = document.createElement('div');
    toast.className = `notification-toast ${type}`;
    toast.innerHTML = `<div class="toast-title">${title}</div>${desc ? `<div class="toast-desc">${desc}</div>` : ''}`;

    // Click to dismiss
    toast.addEventListener('click', () => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    });

    area.appendChild(toast);

    // Auto-dismiss
    setTimeout(() => {
        if (toast.parentNode) {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }
    }, duration);
}

// Show queued notifications from turn events
function showTurnNotifications() {
    const events = gameState.turnEvents || [];
    let delay = 0;

    for (const evt of events) {
        // Only show notifications for our cities or globally relevant events
        if (evt.type === 'tech_upgrade') {
            const isOurs = evt.city.owner === 0;
            if (isOurs) {
                setTimeout(() => {
                    showNotification(
                        `${evt.city.name} — ${evt.newTier.name} Era!`,
                        evt.newTier.desc,
                        'tech-upgrade',
                        6000
                    );
                }, delay);
                delay += 800;
            }
        }
    }
}

function gameLoop() {
    camera.update();
    updateInfoPanel();
    renderer.draw(gameState, camera);
    requestAnimationFrame(gameLoop);
}

window.addEventListener('DOMContentLoaded', init);
