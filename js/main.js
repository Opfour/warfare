// Main entry point: game loop, state management

import { Renderer } from './renderer.js';
import { Camera } from './camera.js';
import { InputHandler } from './input.js';
import { generateMap } from './map.js';
import { SeededRNG } from './utils.js';
import { axialToPixel } from './hex.js';
import { DEFAULT_MAP_WIDTH, DEFAULT_MAP_HEIGHT, DEFAULT_CITY_COUNT, UNIT_TYPE, UNIT_STATS } from './config.js';

// Game state — single source of truth
const gameState = {
    map: null,
    units: [],
    players: [],
    currentPlayer: 0,
    turn: 1,
    phase: 'setup', // setup, playing, gameover

    // UI state
    selectedHex: null,
    selectedUnit: null,
    selectedCity: null,
    hoverHex: null,
    movementRange: null,
};

let renderer, camera, input;

function init() {
    const canvas = document.getElementById('gameCanvas');
    const container = document.getElementById('gameContainer');

    // Size canvas to container
    function resizeCanvas() {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        if (camera) {
            camera.resize(canvas.width, canvas.height);
        }
        if (renderer) {
            renderer.resize(canvas.width, canvas.height);
        }
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    renderer = new Renderer(canvas);
    camera = new Camera(canvas.width, canvas.height);
    input = new InputHandler(canvas, camera, gameState);

    // Wire up menu buttons
    document.getElementById('btnNew').addEventListener('click', newGame);
    document.getElementById('btnEndTurn').addEventListener('click', endTurn);
    document.getElementById('closeCityPanel').addEventListener('click', () => {
        gameState.selectedCity = null;
    });

    // Start with a new game
    newGame();

    // Start game loop
    requestAnimationFrame(gameLoop);
}

function newGame() {
    const seed = Date.now();
    const rng = new SeededRNG(seed);

    // Generate map
    gameState.map = generateMap(rng, {
        width: DEFAULT_MAP_WIDTH,
        height: DEFAULT_MAP_HEIGHT,
        cityCount: DEFAULT_CITY_COUNT,
    });

    // Reset state
    gameState.units = [];
    gameState.turn = 1;
    gameState.currentPlayer = 0;
    gameState.phase = 'playing';
    gameState.selectedHex = null;
    gameState.selectedUnit = null;
    gameState.selectedCity = null;
    gameState.hoverHex = null;
    gameState.movementRange = null;

    // Set up camera bounds and center on map
    camera.setMapBounds(gameState.map.width, gameState.map.height);
    const centerQ = Math.floor(gameState.map.width / 2);
    const centerR = Math.floor(gameState.map.height / 2);
    const { x, y } = axialToPixel(centerQ, centerR);
    camera.centerOn(x, y);

    // For now, assign first city to player 0, second to AI player 1
    const cities = gameState.map.cities;
    if (cities.length >= 2) {
        // Player gets a city near the center-left
        const playerCity = cities[0];
        playerCity.owner = 0;

        // AI gets a city further away
        const aiCity = cities[Math.floor(cities.length / 2)];
        aiCity.owner = 1;

        // Create commander units
        gameState.units.push(createUnit(UNIT_TYPE.COMMANDER, 0, playerCity));
        gameState.units.push(createUnit(UNIT_TYPE.COMMANDER, 1, aiCity));

        // Give player a starting scout
        gameState.units.push(createUnit(UNIT_TYPE.SCOUT, 0, playerCity));

        // Center camera on player's city
        const pos = axialToPixel(playerCity.q, playerCity.r);
        camera.centerOn(pos.x, pos.y);
    }

    updateStatusBar('New game started. Click your units to move them. Scroll with arrow keys or mouse at screen edges.');
}

function createUnit(type, owner, city) {
    const stats = UNIT_STATS[type];
    const id = `${type}-${owner}-${gameState.units.length}`;
    return {
        id,
        type,
        owner,
        q: city.q,
        r: city.r,
        troops: stats.maxTroops,
        maxTroops: stats.maxTroops,
        movesRemaining: stats.move,
        orders: 'hold',
        originCity: city.id,
    };
}

function endTurn() {
    // Reset movement for current player's units
    // (In the future, AI turns happen here too)

    gameState.turn++;

    // Reset movement for all units
    for (const unit of gameState.units) {
        const stats = UNIT_STATS[unit.type];
        unit.movesRemaining = stats.move;
    }

    // Clear selection
    gameState.selectedHex = null;
    gameState.selectedUnit = null;
    gameState.selectedCity = null;
    gameState.movementRange = null;

    updateStatusBar(`Turn ${gameState.turn} — Your move.`);
}

function updateStatusBar(text) {
    const statusEl = document.getElementById('statusBar');
    if (statusEl) statusEl.textContent = text;
}

function updateCityPanel() {
    const panel = document.getElementById('cityPanel');
    const city = gameState.selectedCity;

    if (!city) {
        panel.classList.remove('visible');
        return;
    }

    panel.classList.add('visible');
    document.getElementById('cityName').textContent = city.name;
    document.getElementById('cityOwner').textContent = city.owner === null ? 'Neutral' : city.owner === 0 ? 'You' : `Player ${city.owner + 1}`;
    document.getElementById('cityPop').textContent = city.population.toLocaleString();
    document.getElementById('cityKnowledge').textContent = city.knowledge;
    document.getElementById('cityDefense').textContent = city.defense;
    document.getElementById('cityEconomics').textContent = city.economics;
    document.getElementById('citySatisfaction').textContent = city.satisfaction;
    document.getElementById('cityGarrison').textContent = city.garrison;
}

function gameLoop() {
    // Update camera scroll
    camera.update();

    // Update city panel
    updateCityPanel();

    // Render
    renderer.draw(gameState, camera);

    requestAnimationFrame(gameLoop);
}

// Boot
window.addEventListener('DOMContentLoaded', init);
