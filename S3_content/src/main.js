import { MAX_SEARCH_MODIFIER, MIN_SEARCH_MODIFIER, TILE_SIZE_PX } from "./constants.js";
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
let viewport = {
  scale: 1,
  minScale: 1,
  maxScale: 1.5,
  width: 0,
  height: 0
};
let dragState = null;

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
  viewport.width = width;
  viewport.height = height;

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
  updateViewportBounds();
  applyViewportScale(1);
}

function updateViewportBounds() {
  const panel = ui.mapHost.parentElement;
  const availableWidth = Math.max(1, panel.clientWidth - 16);
  const availableHeight = Math.max(1, panel.clientHeight - 16);
  viewport.minScale = Math.min(1, availableWidth / viewport.width, availableHeight / viewport.height);
  viewport.scale = Math.max(viewport.minScale, Math.min(viewport.maxScale, viewport.scale));
}

function applyViewportScale(nextScale, anchor = null) {
  updateViewportBounds();
  const panel = ui.mapHost.parentElement;
  const previousScale = viewport.scale;
  const scale = Math.max(viewport.minScale, Math.min(viewport.maxScale, nextScale));

  if (anchor) {
    const worldX = (panel.scrollLeft + anchor.x) / previousScale;
    const worldY = (panel.scrollTop + anchor.y) / previousScale;
    viewport.scale = scale;
    ui.mapHost.style.transform = `scale(${scale})`;
    panel.scrollLeft = worldX * scale - anchor.x;
    panel.scrollTop = worldY * scale - anchor.y;
  } else {
    viewport.scale = scale;
    ui.mapHost.style.transform = `scale(${scale})`;
  }

  ui.mapHost.style.width = `${viewport.width}px`;
  ui.mapHost.style.height = `${viewport.height}px`;
  ui.mapHost.style.marginRight = `${Math.max(0, viewport.width * scale - viewport.width)}px`;
  ui.mapHost.style.marginBottom = `${Math.max(0, viewport.height * scale - viewport.height)}px`;
}

function updateLootUi() {
  ui.lootList.innerHTML = "";
  for (const entry of state.lootLog.entries) {
    const item = document.createElement("li");
    item.className = "loot-item";
    item.textContent = `${entry.name} (${entry.value} gp)`;
    const dropBtn = document.createElement("button");
    dropBtn.textContent = "Leave";
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
    ui.roomLootPanel.textContent = "No revealed treasure in this room.";
    return;
  }

  if (roomLoot.length > 1) {
    const lootAllButton = document.createElement("button");
    lootAllButton.type = "button";
    lootAllButton.textContent = "Get All";
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
    lootButton.textContent = `Get: ${loot.name || "treasure"} (${loot.value} gp)`;
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
    x: Math.floor(localX / (TILE_SIZE_PX * viewport.scale)),
    y: Math.floor(localY / (TILE_SIZE_PX * viewport.scale))
  };
}

function normalizeSearchModifier() {
  const modifier = Math.max(
    MIN_SEARCH_MODIFIER,
    Math.min(MAX_SEARCH_MODIFIER, Number(ui.searchModifierInput.value || 0))
  );
  ui.searchModifierInput.value = `${modifier}`;
  return modifier;
}

function formatRollTooltip(result, action) {
  return `roll of ${result.roll} ${result.modifier >= 0 ? "+" : "-"} ${Math.abs(result.modifier)} = ${result.total} for ${action}`;
}

function performSearch() {
  if (!state) {
    return;
  }
  const result = searchForTraps(state, normalizeSearchModifier());
  ui.statusText.textContent = result.message;
  ui.searchResult.textContent = `${result.total}`;
  ui.searchResult.title = formatRollTooltip(result, "search");
  render();
  updatePanels();
}

function performGet() {
  if (!state) {
    return;
  }
  const [loot] = getRoomLoot(state);
  const result = loot ? collectLoot(state, loot.id) : { message: "No revealed treasure to get." };
  ui.statusText.textContent = result.message;
  render();
  updatePanels();
}

function performLeave() {
  if (!state) {
    return;
  }
  const [entry] = state.lootLog.entries;
  const result = entry ? dropLootAtPlayer(state, entry.id) : { message: "No carried treasure to leave." };
  ui.statusText.textContent = result.message;
  render();
  updatePanels();
}

function performDisarm() {
  if (!state) {
    return;
  }
  const [trap] = getRoomTraps(state).filter((candidate) => !candidate.triggered && !candidate.disarmed);
  if (!trap) {
    ui.statusText.textContent = "No active revealed trap to disarm.";
    return;
  }
  const result = disarmTrap(state, trap.id, normalizeSearchModifier());
  ui.statusText.textContent = result.message;
  ui.searchResult.textContent = `${result.total}`;
  ui.searchResult.title = formatRollTooltip(result, "disarm");
  render();
  updatePanels();
}

function hookInputEvents() {
  document.addEventListener("keydown", (event) => {
    if (!state) {
      return;
    }
    if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) {
      return;
    }
    const moves = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0]
    };
    const delta = moves[event.key];
    if (delta) {
      event.preventDefault();
      const result = movePlayer(state, delta[0], delta[1]);
      ui.statusText.textContent = result.message;
      render();
      updatePanels();
      return;
    }
    if (event.key === "s" || event.key === "S") {
      event.preventDefault();
      performSearch();
      return;
    }
    if (event.key === "g" || event.key === "G") {
      event.preventDefault();
      performGet();
      return;
    }
    if (event.key === "l" || event.key === "L") {
      event.preventDefault();
      performLeave();
      return;
    }
    if (event.key === "d" || event.key === "D") {
      event.preventDefault();
      performDisarm();
    }
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

  ui.searchModifierInput.addEventListener("change", () => {
    normalizeSearchModifier();
  });
  ui.searchModifierInput.addEventListener("input", () => {
    const value = Number(ui.searchModifierInput.value);
    if (Number.isNaN(value)) {
      return;
    }
    if (value > MAX_SEARCH_MODIFIER || value < MIN_SEARCH_MODIFIER) {
      normalizeSearchModifier();
    }
  });

  ui.searchBtn.addEventListener("click", () => {
    performSearch();
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
    if (dragState?.moved) {
      return;
    }
    const { x, y } = getTileFromPointer(event);
    const result = clickEntity(state, x, y);
    ui.statusText.textContent = result.message;
    render();
    updatePanels();
  });
}

function hookMapViewportInteractions() {
  const panel = ui.mapHost.parentElement;
  panel.addEventListener("wheel", (event) => {
    if (!state) {
      return;
    }
    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    const zoomStep = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    applyViewportScale(viewport.scale * zoomStep, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    });
  }, { passive: false });

  panel.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: panel.scrollLeft,
      scrollTop: panel.scrollTop,
      moved: false
    };
    panel.classList.add("is-dragging");
    panel.setPointerCapture(event.pointerId);
  });

  panel.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragState.moved = true;
    }
    panel.scrollLeft = dragState.scrollLeft - dx;
    panel.scrollTop = dragState.scrollTop - dy;
  });

  panel.addEventListener("pointerup", (event) => {
    if (dragState?.pointerId === event.pointerId) {
      panel.classList.remove("is-dragging");
      setTimeout(() => {
        dragState = null;
      }, 0);
    }
  });

  window.addEventListener("resize", () => {
    if (state) {
      applyViewportScale(viewport.scale);
    }
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
  ui.statusText.textContent = `Generated level ${level} map with seed ${seed}. Move with arrow keys.`;
}

hookInputEvents();
hookMapViewportInteractions();
generateAndRender();
