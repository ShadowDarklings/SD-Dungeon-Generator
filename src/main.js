import { TILE_SIZE_PX } from "./constants.js";
import { generateDungeon } from "./generator.js";
import {
  clickEntity,
  collectLoot,
  collectRoomLoot,
  disarmTrap,
  dropLootAtPlayer,
  getRoomLoot,
  getRoomTraps,
  movePlayer,
  searchForTraps,
  toggleTorch
} from "./interactions.js";
import { renderDungeon } from "./render.js";
import { recomputeVisibility } from "./visibility.js";

const ui = {
  mapHost: document.getElementById("map-host"),
  levelInput: document.getElementById("level-input"),
  seedInput: document.getElementById("seed-input"),
  generateBtn: document.getElementById("generate-btn"),
  torchBtn: document.getElementById("torch-btn"),
  searchBtn: document.getElementById("search-btn"),
  searchMinusBtn: document.getElementById("search-minus-btn"),
  searchPlusBtn: document.getElementById("search-plus-btn"),
  searchModifierInput: document.getElementById("search-modifier-input"),
  searchResult: document.getElementById("search-result"),
  blackoutToggle: document.getElementById("blackout-toggle"),
  debugToggle: document.getElementById("debug-toggle"),
  statusText: document.getElementById("status-text"),
  connectivityText: document.getElementById("connectivity-text"),
  lootList: document.getElementById("loot-list"),
  totalValue: document.getElementById("total-value"),
  roomLootPanel: document.getElementById("room-loot-panel"),
  monsterPanel: document.getElementById("monster-panel"),
  trapPanel: document.getElementById("trap-panel")
};

let state = null;
let layers = null;
let forceBlackoutWhenTorchOut = true;

async function loadMonsterTable(level) {
  const tableLevel = level <= 1 ? 1 : 2;
  try {
    const response = await fetch(`./monsters-${tableLevel}.json`);
    if (!response.ok) {
      throw new Error(`Monster table request failed: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    console.warn("Using fallback monster names because the JSON table could not load.", error);
    return [];
  }
}

async function loadTrapTable() {
  try {
    const response = await fetch("./traps.json");
    if (!response.ok) {
      throw new Error(`Trap table request failed: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    console.warn("Using fallback trap names because traps.json could not load.", error);
    return [];
  }
}

function createLayerCanvas(className, width, height) {
  const canvas = document.createElement("canvas");
  canvas.className = className;
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function setupCanvasLayers(currentState) {
  ui.mapHost.innerHTML = "";
  const width = currentState.map.width * TILE_SIZE_PX;
  const height = currentState.map.height * TILE_SIZE_PX;
  ui.mapHost.style.width = `${width}px`;
  ui.mapHost.style.height = `${height}px`;

  const background = createLayerCanvas("layer layer-background", width, height);
  const topology = createLayerCanvas("layer layer-topology", width, height);
  const objects = createLayerCanvas("layer layer-objects", width, height);
  const fog = createLayerCanvas("layer layer-fog", width, height);

  ui.mapHost.append(background, topology, objects, fog);

  layers = {
    backgroundCtx: background.getContext("2d"),
    topologyCtx: topology.getContext("2d"),
    objectsCtx: objects.getContext("2d"),
    fogCtx: fog.getContext("2d"),
    objectsCanvas: objects
  };
}

function updateLootUi() {
  ui.lootList.innerHTML = "";
  for (const entry of state.lootLog.entries) {
    const item = document.createElement("li");
    item.className = "loot-item";
    item.textContent = `${entry.name} (${entry.value} gp)`;
    const dropBtn = document.createElement("button");
    dropBtn.textContent = "Drop";
    dropBtn.addEventListener("click", () => {
      const result = dropLootAtPlayer(state, entry.id);
      ui.statusText.textContent = result.message;
      render();
      updatePanels();
    });
    item.append(" ", dropBtn);
    ui.lootList.append(item);
  }
  ui.totalValue.textContent = `${state.lootLog.totalValue}`;
}

function updateRoomLootPanel() {
  ui.roomLootPanel.innerHTML = "";
  const roomLoot = getRoomLoot(state);
  if (!state.player.roomId || roomLoot.length === 0) {
    ui.roomLootPanel.textContent = "No loot in this room.";
    return;
  }

  if (roomLoot.length > 1) {
    const lootAllButton = document.createElement("button");
    lootAllButton.type = "button";
    lootAllButton.textContent = "Loot All";
    lootAllButton.addEventListener("click", () => {
      const result = collectRoomLoot(state);
      ui.statusText.textContent = result.message;
      render();
      updatePanels();
    });
    ui.roomLootPanel.append(lootAllButton);
  }

  for (const loot of roomLoot) {
    const lootButton = document.createElement("button");
    lootButton.type = "button";
    lootButton.textContent = `Loot: ${loot.name || "loot"} (${loot.value}gp)`;
    lootButton.addEventListener("click", () => {
      const result = collectLoot(state, loot.id);
      ui.statusText.textContent = result.message;
      render();
      updatePanels();
    });
    ui.roomLootPanel.append(lootButton);
  }
}

function createStatRow(term, value) {
  const fragment = document.createDocumentFragment();
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  dd.textContent = value || "unknown";
  fragment.append(dt, dd);
  return fragment;
}

function updateMonsterPanel() {
  ui.monsterPanel.innerHTML = "";
  const currentRoomId = state.player.roomId;
  const monsters = state.entities.filter((entity) => {
    return entity.type === "monster" && !entity.defeated && entity.roomId === currentRoomId;
  });

  if (!currentRoomId || monsters.length === 0) {
    ui.monsterPanel.textContent = "No monsters in this room.";
    return;
  }

  for (const monster of monsters) {
    const card = document.createElement("article");
    card.className = "monster-card";

    const title = document.createElement("h3");
    title.textContent = monster.name;
    card.append(title);

    const stats = document.createElement("dl");
    stats.append(
      createStatRow("AC", monster.ac),
      createStatRow("HP", monster.hp),
      createStatRow("ATK", monster.attack)
    );
    card.append(stats);

    const abilityEntries = Object.entries(monster.abilities || {});
    if (abilityEntries.length) {
      const abilities = document.createElement("ul");
      for (const [name, description] of abilityEntries) {
        const ability = document.createElement("li");
        ability.textContent = `${name.replaceAll("*", "")}: ${description}`;
        abilities.append(ability);
      }
      card.append(abilities);
    }

    ui.monsterPanel.append(card);
  }
}

function updateTrapPanel() {
  ui.trapPanel.innerHTML = "";
  const traps = getRoomTraps(state);
  if (!state.player.roomId || traps.length === 0) {
    ui.trapPanel.textContent = "No revealed traps in this room.";
    return;
  }

  for (const trap of traps) {
    const card = document.createElement("article");
    card.className = "trap-card";

    const title = document.createElement("h3");
    title.textContent = trap.name;
    card.append(title);

    const stats = document.createElement("dl");
    const stateLabel = trap.disarmed ? "disarmed" : trap.triggered ? "triggered" : "found";
    stats.append(
      createStatRow("Trigger", trap.trigger),
      createStatRow("Effect", trap.effect),
      createStatRow("Trap DC", trap.dc),
      createStatRow("State", stateLabel)
    );
    card.append(stats);

    if (!trap.triggered && !trap.disarmed) {
      const disarmButton = document.createElement("button");
      disarmButton.type = "button";
      disarmButton.textContent = "Disarm?";
      disarmButton.addEventListener("click", () => {
        const result = disarmTrap(state, trap.id, normalizeSearchModifier());
        ui.statusText.textContent = result.message;
        ui.searchResult.textContent = `${result.total}`;
        ui.searchResult.title = formatRollTooltip(result, "disarm");
        render();
        updatePanels();
      });
      card.append(disarmButton);
    }

    ui.trapPanel.append(card);
  }
}

function updatePanels() {
  updateLootUi();
  updateRoomLootPanel();
  updateMonsterPanel();
  updateTrapPanel();
}

function render() {
  renderDungeon(state, layers, {
    forceBlackout: forceBlackoutWhenTorchOut && !state.player.torchLit,
    debug: ui.debugToggle.checked
  });
  ui.connectivityText.textContent = state.generation.connectivityValid ? "valid" : "invalid";
}

function getTileFromPointer(event) {
  const rect = layers.objectsCanvas.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  return {
    x: Math.floor(localX / TILE_SIZE_PX),
    y: Math.floor(localY / TILE_SIZE_PX)
  };
}

function normalizeSearchModifier() {
  const modifier = Math.max(-9, Math.min(9, Number(ui.searchModifierInput.value || 0)));
  ui.searchModifierInput.value = `${modifier}`;
  return modifier;
}

function formatRollTooltip(result, action) {
  return `roll of ${result.roll} ${result.modifier >= 0 ? "+" : "-"} ${Math.abs(result.modifier)} = ${result.total} for ${action}`;
}

function hookInputEvents() {
  document.addEventListener("keydown", (event) => {
    if (!state) {
      return;
    }
    const moves = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      w: [0, -1],
      s: [0, 1],
      a: [-1, 0],
      d: [1, 0]
    };
    const delta = moves[event.key];
    if (!delta) {
      return;
    }
    event.preventDefault();
    const result = movePlayer(state, delta[0], delta[1]);
    ui.statusText.textContent = result.message;
    render();
    updatePanels();
  });

  ui.generateBtn.addEventListener("click", () => {
    generateAndRender();
  });

  ui.torchBtn.addEventListener("click", () => {
    if (!state) {
      return;
    }
    const { torchLit } = toggleTorch(state);
    ui.statusText.textContent = torchLit ? "Torch relit." : "Torch extinguished.";
    render();
  });

  ui.searchMinusBtn.addEventListener("click", () => {
    ui.searchModifierInput.value = `${Math.max(-9, normalizeSearchModifier() - 1)}`;
  });

  ui.searchPlusBtn.addEventListener("click", () => {
    ui.searchModifierInput.value = `${Math.min(9, normalizeSearchModifier() + 1)}`;
  });

  ui.searchModifierInput.addEventListener("change", () => {
    normalizeSearchModifier();
  });

  ui.searchBtn.addEventListener("click", () => {
    if (!state) {
      return;
    }
    const result = searchForTraps(state, normalizeSearchModifier());
    ui.statusText.textContent = result.message;
    ui.searchResult.textContent = `${result.total}`;
    ui.searchResult.title = formatRollTooltip(result, "search");
    render();
    updatePanels();
  });

  ui.blackoutToggle.addEventListener("change", () => {
    forceBlackoutWhenTorchOut = ui.blackoutToggle.checked;
    render();
  });

  ui.debugToggle.addEventListener("change", () => {
    render();
  });
}

function hookCanvasInteractions() {
  layers.objectsCanvas.addEventListener("click", (event) => {
    const { x, y } = getTileFromPointer(event);
    const result = clickEntity(state, x, y);
    ui.statusText.textContent = result.message;
    render();
    updatePanels();
  });
}

async function generateAndRender() {
  const seed = Number(ui.seedInput.value || Date.now());
  const level = Number(ui.levelInput.value || 1);
  ui.statusText.textContent = "Generating dungeon...";
  const [monsterTable, trapTable] = await Promise.all([loadMonsterTable(level), loadTrapTable()]);
  state = generateDungeon(seed, level, { monsterTable, trapTable });
  ui.searchResult.textContent = "none";
  ui.searchResult.title = "";
  recomputeVisibility(state);
  setupCanvasLayers(state);
  hookCanvasInteractions();
  updatePanels();
  render();
  ui.statusText.textContent = `Generated level ${level} map with seed ${seed}. Move with WASD or arrow keys.`;
}

hookInputEvents();
generateAndRender();
