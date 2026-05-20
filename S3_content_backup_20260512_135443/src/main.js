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
  doorDebugToggle: document.getElementById("door-debug-toggle"),
  doorDebugPanel: document.getElementById("door-debug-panel"),
  doorDebugStatus: document.getElementById("door-debug-status"),
  doorDebugDoor: document.getElementById("door-debug-door"),
  doorDebugTile: document.getElementById("door-debug-tile"),
  doorDebugSummary: document.getElementById("door-debug-summary"),
  doorDebugLog: document.getElementById("door-debug-log"),
  doorDebugReport: document.getElementById("door-debug-report"),
  doorDebugMode1: document.getElementById("door-debug-mode-1"),
  doorDebugMode2: document.getElementById("door-debug-mode-2"),
  doorDebugMode3: document.getElementById("door-debug-mode-3"),
  statusText: document.getElementById("status-text"),
  connectivityText: document.getElementById("connectivity-text"),
  lootList: document.getElementById("loot-list"),
  totalValue: document.getElementById("total-value"),
  roomLootPanel: document.getElementById("room-loot-panel"),
  monsterPanel: document.getElementById("monster-panel"),
  trapPanel: document.getElementById("trap-panel")
};

  ui.doorDebugReport.addEventListener("click", () => {
    outputAllChanges();
  });
let state = null;
let layers = null;
let forceBlackoutWhenTorchOut = true;
let animationFrameId = null;
let viewport = {
  scale: 1,
  minScale: 1,
  maxScale: 1.5,
  width: 0,
  height: 0,
  panX: 0,
  panY: 0
};
const DRAG_THRESHOLD_PX = 8;
/** Slightly smaller than "fit entire map" so neither axis binds flush; otherwise the limiting axis often gets zero slack (only X or only Y would pan). */
const MIN_ZOOM_INSET = 0.92;

let dragState = null;

function ensureDebugPlacementState() {
  if (!state) {
    return null;
  }
  if (!state.debugPlacement) {
    state.debugPlacement = {
      active: false,
      selectedDoorId: null,
      selectedTileKey: null,
      log: []
    };
  }
  return state.debugPlacement;
}

function getSelectedDoor() {
  const debug = ensureDebugPlacementState();
  if (!debug || !debug.selectedDoorId) {
    return null;
  }
  return state.entities.find((entity) => entity.subtype === "door" && entity.id === debug.selectedDoorId) || null;
}

function getSelectedTile() {
  const debug = ensureDebugPlacementState();
  if (!debug || !debug.selectedTileKey) {
    return null;
  }
  return state.tiles.find((tile) => `${tile.x},${tile.y}` === debug.selectedTileKey) || null;
}

function getDoorAnimationCandidates(door) {
  return [
    { id: "opposite-pivot", label: "open from opposite pivot point on the door" },
    { id: "swap-90-180", label: "open the door 90 degrees if it was 180 or 180 if it was 90" },
    { id: "flip-cw-ccw", label: "rotate CW if it was CCW and CW if it was CCW" }
  ];
}

function getCurrentDoorAnimationLabel(door) {
  if (door.transition) {
    return `${door.transition.from} -> ${door.transition.to}`;
  }
  return door.doorState || "unknown";
}

function getDoorDebugSummary(door) {
  if (!door) {
    return "No door selected.";
  }
  const offsetX = Number(door.debugOffsetX || 0);
  const offsetY = Number(door.debugOffsetY || 0);
  const currentCandidate = getDoorAnimationCandidates(door).find((candidate) => candidate.id === door.debugAnimationMode) || getDoorAnimationCandidates(door)[0];
  const verdict = door.debugAnimationVerdicts?.[currentCandidate.id] || "unrated";
  return [
    `${door.id} @ ${door.x},${door.y}`,
    `offset: ${offsetX}px, ${offsetY}px`,
    `wall: ${door.wallSide || "unknown"} / hall: ${door.hallDirection || "unknown"}`,
    `current animation: ${getCurrentDoorAnimationLabel(door)}`,
    `candidate: ${currentCandidate.label} (${verdict})`
  ].join(" | ");
}

function getTileDebugSummary(tile) {
  if (!tile) {
    return "No tile selected.";
  }
  const expectation = tile.meta?.debugLosExpectation || "unset";
  return [`${tile.x},${tile.y}`, `type: ${tile.type}`, `room: ${tile.roomId || "none"}`, `hall: ${tile.hallId || "none"}`, `LoS: ${expectation}`].join(" | ");
}

function pushDebugLog(message) {
  const debug = ensureDebugPlacementState();
  if (!debug) {
    return;
  }
  debug.log.unshift(message);
  debug.log = debug.log.slice(0, 8);
}

function buildDoorDebugReport() {
  if (!state) {
    return "No dungeon loaded.";
  }
  const lines = ["Door placement debug report"]; 
  const debug = ensureDebugPlacementState();
  lines.push(`Mode: ${debug?.active ? "on" : "off"}`);
  lines.push(`Selected door: ${getDoorDebugSummary(getSelectedDoor())}`);
  lines.push(`Selected tile: ${getTileDebugSummary(getSelectedTile())}`);
  lines.push("");
  lines.push("Doors with edits:");
  const editedDoors = state.entities.filter((entity) => {
    if (entity.subtype !== "door") {
      return false;
    }
    return Number(entity.debugOffsetX || 0) !== 0 || Number(entity.debugOffsetY || 0) !== 0 || entity.debugAnimationMode || entity.debugAnimationVerdicts || entity.debugPlaced;
  });
  if (editedDoors.length === 0) {
    lines.push("- none");
  } else {
    for (const door of editedDoors) {
      const verdicts = Object.entries(door.debugAnimationVerdicts || {}).map(([name, value]) => `${name}:${value}`).join(", ") || "none";
      lines.push(`- ${door.id} @ ${door.x},${door.y} offset(${door.debugOffsetX || 0},${door.debugOffsetY || 0}) animation(${door.debugAnimationMode || "unset"}) verdicts(${verdicts})`);
    }
  }
  lines.push("");
  lines.push("Tiles with LoS notes:");
  const notedTiles = state.tiles.filter((tile) => tile.meta?.debugLosExpectation);
  if (notedTiles.length === 0) {
    lines.push("- none");
  } else {
    for (const tile of notedTiles) {
      lines.push(`- ${tile.x},${tile.y} => ${tile.meta.debugLosExpectation}`);
    }
  }
  return lines.join("\n");
}

function outputAllChanges() {
  const report = buildDoorDebugReport();
  pushDebugLog(report.replaceAll("\n", " | "));
  ui.doorDebugLog.textContent = report;
}

function updateDoorDebugUi() {
  const debug = ensureDebugPlacementState();
  if (!debug) {
    return;
  }
  const selectedDoor = getSelectedDoor();
  const selectedTile = getSelectedTile();
  const activeModeId = selectedDoor?.debugAnimationMode || null;
  ui.doorDebugStatus.textContent = debug.active ? "on" : "off";
  ui.doorDebugDoor.textContent = getDoorDebugSummary(selectedDoor);
  ui.doorDebugTile.textContent = getTileDebugSummary(selectedTile);
  ui.doorDebugSummary.textContent = debug.active
    ? "Click a door tile to cycle door -> floor -> none. Selected doors use cyan; selected floor tiles use yellow."
    : "Turn on door placement debug mode to select doors and tiles.";
  ui.doorDebugMode1.classList.toggle("is-active", activeModeId === "opposite-pivot");
  ui.doorDebugMode2.classList.toggle("is-active", activeModeId === "swap-90-180");
  ui.doorDebugMode3.classList.toggle("is-active", activeModeId === "flip-cw-ccw");
  ui.doorDebugLog.textContent = debug.log.length ? debug.log.join("\n") : "No debug actions yet.";
}

function getTileSelectionKey(x, y) {
  return `${x},${y}`;
}

function renderWithDebug() {
  render();
  updateDoorDebugUi();
}

function selectDoorForDebug(door) {
  const debug = ensureDebugPlacementState();
  if (!debug) {
    return;
  }
  debug.selectedDoorId = door.id;
  debug.selectedTileKey = null;
  pushDebugLog(`door selected: ${door.id} @ ${door.x},${door.y}`);
}

function cycleDoorTileDebugSelection(door, tile) {
  const debug = ensureDebugPlacementState();
  if (!debug) {
    return;
  }
  const tileKey = getTileSelectionKey(tile.x, tile.y);
  if (debug.selectedDoorId === door.id && debug.selectedTileKey === null) {
    debug.selectedDoorId = null;
    debug.selectedTileKey = tileKey;
    pushDebugLog(`floor selected: ${tileKey}`);
    return;
  }
  if (debug.selectedTileKey === tileKey && debug.selectedDoorId === null) {
    debug.selectedTileKey = null;
    pushDebugLog(`floor unselected: ${tileKey}`);
    return;
  }
  debug.selectedDoorId = door.id;
  debug.selectedTileKey = null;
  pushDebugLog(`door selected: ${door.id} @ ${door.x},${door.y}`);
}

function selectTileForDebug(tile) {
  const debug = ensureDebugPlacementState();
  if (!debug) {
    return;
  }
  const tileKey = getTileSelectionKey(tile.x, tile.y);
  debug.selectedDoorId = null;
  if (debug.selectedTileKey === tileKey) {
    debug.selectedTileKey = null;
    pushDebugLog(`tile unselected: ${tileKey}`);
  } else {
    debug.selectedTileKey = tileKey;
    pushDebugLog(`tile selected: ${tileKey}`);
  }
}

function findDoorAtTile(x, y) {
  if (!state) {
    return null;
  }
  return state.entities.find((entity) => entity.subtype === "door" && entity.x === x && entity.y === y) || null;
}

function getDebugAnimationCandidate(door) {
  const candidates = getDoorAnimationCandidates(door);
  return candidates.find((candidate) => candidate.id === door.debugAnimationMode) || candidates[0];
}

function applyDoorAnimationMode(door, mode) {
  const nextMode = door.debugAnimationMode === mode.id ? null : mode.id;
  door.debugAnimationMode = nextMode;
  pushDebugLog(
    nextMode
      ? `door animation mode enabled: ${door.id} -> ${mode.label}`
      : `door animation mode cleared: ${door.id} -> ${mode.label}`
  );
  renderWithDebug();
}

function toggleSelectedDoorAnimation() {
  const door = getSelectedDoor();
  if (!door) {
    pushDebugLog("no selected door for animation toggle");
    return;
  }
  const nextState = door.doorState === "closed" ? "open" : "closed";
  door.transition = {
    from: door.doorState,
    to: nextState,
    startedAt: performance.now(),
    duration: door.swingTarget === "room" ? 192 : 96
  };
  door.doorState = nextState;
  pushDebugLog(`door animation toggled: ${door.id} -> ${nextState}`);
  recomputeVisibility(state);
  renderWithDebug();
}

function handleDoorDebugPlacementKey(event) {
  const debug = ensureDebugPlacementState();
  if (!debug || !debug.active) {
    return false;
  }

  const selectedDoor = getSelectedDoor();
  const selectedTile = getSelectedTile();
  const key = event.code || event.key;
  const matches = (...values) => values.includes(key) || values.includes(event.key);
  const tileKeys = new Set(["Digit7", "Digit8", "Numpad7", "Numpad8", "7", "8"]);

  if (selectedDoor && (matches("Numpad8", "Numpad2", "Numpad4", "Numpad6"))) {
    event.preventDefault();
    if (matches("Numpad8")) {
      selectedDoor.debugOffsetY = Number(selectedDoor.debugOffsetY || 0) - 1;
      pushDebugLog(`door ${selectedDoor.id} moved up 1px`);
    } else if (matches("Numpad2")) {
      selectedDoor.debugOffsetY = Number(selectedDoor.debugOffsetY || 0) + 1;
      pushDebugLog(`door ${selectedDoor.id} moved down 1px`);
    } else if (matches("Numpad4")) {
      selectedDoor.debugOffsetX = Number(selectedDoor.debugOffsetX || 0) - 1;
      pushDebugLog(`door ${selectedDoor.id} moved left 1px`);
    } else if (matches("Numpad6")) {
      selectedDoor.debugOffsetX = Number(selectedDoor.debugOffsetX || 0) + 1;
      pushDebugLog(`door ${selectedDoor.id} moved right 1px`);
    }
    renderWithDebug();
    return true;
  }

  if (selectedDoor && matches("Digit1", "1")) {
    event.preventDefault();
    applyDoorAnimationMode(selectedDoor, getDoorAnimationCandidates(selectedDoor)[0]);
    return true;
  }

  if (selectedDoor && matches("Digit2", "2")) {
    event.preventDefault();
    applyDoorAnimationMode(selectedDoor, getDoorAnimationCandidates(selectedDoor)[1]);
    return true;
  }

  if (selectedDoor && matches("Digit3", "3")) {
    event.preventDefault();
    toggleSelectedDoorAnimation();
    return true;
  }

  if (selectedDoor && matches("Digit4", "4")) {
    event.preventDefault();
    outputAllChanges();
    return true;
  }

  if (selectedDoor && matches("Digit5", "5")) {
    event.preventDefault();
    const current = getDebugAnimationCandidate(selectedDoor);
    selectedDoor.debugAnimationVerdicts = selectedDoor.debugAnimationVerdicts || {};
    selectedDoor.debugAnimationVerdicts[current.id] = "impossible";
    pushDebugLog(`door animation marked impossible: ${selectedDoor.id} / ${current.label}`);
    renderWithDebug();
    return true;
  }

  if (selectedDoor && matches("Digit6", "6")) {
    event.preventDefault();
    const current = getDebugAnimationCandidate(selectedDoor);
    selectedDoor.debugAnimationVerdicts = selectedDoor.debugAnimationVerdicts || {};
    selectedDoor.debugAnimationVerdicts[current.id] = "valid";
    pushDebugLog(`door animation marked valid: ${selectedDoor.id} / ${current.label}`);
    renderWithDebug();
    return true;
  }

  if (selectedTile && (tileKeys.has(key) || matches("Digit7", "Digit8", "Numpad7", "Numpad8", "7", "8"))) {
    event.preventDefault();
    selectedTile.meta = selectedTile.meta || {};
    if (matches("Digit7", "Numpad7", "7")) {
      selectedTile.meta.debugLosExpectation = "blocked";
      pushDebugLog(`tile marked blocked by LoS: ${selectedTile.x},${selectedTile.y}`);
    } else if (matches("Digit8", "Numpad8", "8")) {
      selectedTile.meta.debugLosExpectation = "clear";
      pushDebugLog(`tile marked clear for LoS: ${selectedTile.x},${selectedTile.y}`);
    }
    renderWithDebug();
    return true;
  }

  return false;
}

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
  viewport.panX = 0;
  viewport.panY = 0;

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

function getMapViewSize(panel) {
  const style = getComputedStyle(panel);
  const pl = parseFloat(style.paddingLeft) || 0;
  const pr = parseFloat(style.paddingRight) || 0;
  const pt = parseFloat(style.paddingTop) || 0;
  const pb = parseFloat(style.paddingBottom) || 0;
  return {
    width: Math.max(1, panel.clientWidth - pl - pr),
    height: Math.max(1, panel.clientHeight - pt - pb)
  };
}

function pointerInMapView(panel, clientX, clientY) {
  const rect = panel.getBoundingClientRect();
  const style = getComputedStyle(panel);
  const pl = parseFloat(style.paddingLeft) || 0;
  const pt = parseFloat(style.paddingTop) || 0;
  return {
    x: clientX - rect.left - pl,
    y: clientY - rect.top - pt
  };
}

function updateViewportBounds() {
  const panel = ui.mapHost.parentElement;
  const { width: availableWidth, height: availableHeight } = getMapViewSize(panel);
  const fit = Math.min(1, availableWidth / viewport.width, availableHeight / viewport.height);
  viewport.minScale = fit * MIN_ZOOM_INSET;
  viewport.scale = Math.max(viewport.minScale, Math.min(viewport.maxScale, viewport.scale));
}

function centerMapInView() {
  const panel = ui.mapHost.parentElement;
  const { width: viewW, height: viewH } = getMapViewSize(panel);
  const mw = viewport.width * viewport.scale;
  const mh = viewport.height * viewport.scale;
  viewport.panX = mw > viewW ? 0 : (viewW - mw) / 2;
  viewport.panY = mh > viewH ? 0 : (viewH - mh) / 2;
}

function clampPan() {
  const panel = ui.mapHost.parentElement;
  const { width: viewW, height: viewH } = getMapViewSize(panel);
  const mw = viewport.width * viewport.scale;
  const mh = viewport.height * viewport.scale;

  if (mw > viewW) {
    viewport.panX = Math.max(viewW - mw, Math.min(0, viewport.panX));
  } else {
    const maxSlackX = viewW - mw;
    viewport.panX = Math.max(0, Math.min(maxSlackX, viewport.panX));
  }
  if (mh > viewH) {
    viewport.panY = Math.max(viewH - mh, Math.min(0, viewport.panY));
  } else {
    const maxSlackY = viewH - mh;
    viewport.panY = Math.max(0, Math.min(maxSlackY, viewport.panY));
  }
}

function commitViewportTransform() {
  clampPan();
  ui.mapHost.style.transform = `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.scale})`;
}

function applyViewportScale(nextScale, anchor = null) {
  updateViewportBounds();
  const previousScale = viewport.scale;
  const scale = Math.max(viewport.minScale, Math.min(viewport.maxScale, nextScale));

  if (anchor) {
    const localX = (anchor.x - viewport.panX) / previousScale;
    const localY = (anchor.y - viewport.panY) / previousScale;
    viewport.scale = scale;
    viewport.panX = anchor.x - localX * scale;
    viewport.panY = anchor.y - localY * scale;
  } else {
    viewport.scale = scale;
    centerMapInView();
  }

  ui.mapHost.style.width = `${viewport.width}px`;
  ui.mapHost.style.height = `${viewport.height}px`;
  commitViewportTransform();
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

function hasActiveDoorAnimations(now = performance.now()) {
  if (!state) {
    return false;
  }
  return state.entities.some((entity) => {
    if (entity.subtype !== "door" || !entity.transition) {
      return false;
    }
    return now - entity.transition.startedAt < entity.transition.duration;
  });
}

function scheduleAnimationFrame() {
  if (animationFrameId !== null) {
    return;
  }
  animationFrameId = requestAnimationFrame((now) => {
    animationFrameId = null;
    if (!state || !layers) {
      return;
    }
    render(now);
  });
}

function render(now = performance.now()) {
  const debug = ensureDebugPlacementState();
  renderDungeon(state, layers, {
    forceBlackout: forceBlackoutWhenTorchOut && !state.player.torchLit,
    debug: ui.debugToggle.checked,
    doorPlacementDebug: debug?.active === true,
    now
  });
  ui.connectivityText.textContent = state.generation.connectivityValid ? "valid" : "invalid";
  if (hasActiveDoorAnimations(now)) {
    scheduleAnimationFrame();
  }
}

function getTileFromPointer(event) {
  const canvas = layers.objectsCanvas;
  const rect = canvas.getBoundingClientRect();
  const rw = rect.width;
  const rh = rect.height;
  if (rw <= 0 || rh <= 0) {
    return { x: 0, y: 0 };
  }
  const px = ((event.clientX - rect.left) / rw) * canvas.width;
  const py = ((event.clientY - rect.top) / rh) * canvas.height;
  return {
    x: Math.floor(px / TILE_SIZE_PX),
    y: Math.floor(py / TILE_SIZE_PX)
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
    if (handleDoorDebugPlacementKey(event)) {
      return;
    }
    const debug = ensureDebugPlacementState();
    if (debug?.active) {
      const blockedGameplayKeys = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "s", "S", "g", "G", "l", "L", "d", "D"]);
      if (blockedGameplayKeys.has(event.key)) {
        event.preventDefault();
        return;
      }
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

  ui.doorDebugReport.addEventListener("click", () => {
    outputAllChanges();
  });

  ui.doorDebugMode1.addEventListener("click", () => {
    const door = getSelectedDoor();
    if (door) {
      applyDoorAnimationMode(door, getDoorAnimationCandidates(door)[0]);
    }
  });

  ui.doorDebugMode2.addEventListener("click", () => {
    const door = getSelectedDoor();
    if (door) {
      applyDoorAnimationMode(door, getDoorAnimationCandidates(door)[1]);
    }
  });

  ui.doorDebugMode3.addEventListener("click", () => {
    const door = getSelectedDoor();
    if (door) {
      applyDoorAnimationMode(door, getDoorAnimationCandidates(door)[2]);
    }
  });

  ui.doorDebugToggle.addEventListener("change", () => {
    const debug = ensureDebugPlacementState();
    if (!debug) {
      return;
    }
    debug.active = ui.doorDebugToggle.checked;
    if (!debug.active) {
      debug.selectedDoorId = null;
      debug.selectedTileKey = null;
      pushDebugLog("door placement debug mode off");
    } else {
      pushDebugLog("door placement debug mode on");
    }
    renderWithDebug();
  });
}

function hookMapViewportInteractions() {
  const panel = ui.mapHost.parentElement;

  const onDocumentMove = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      dragState.moved = true;
    }
    viewport.panX = dragState.panStartX + dx;
    viewport.panY = dragState.panStartY + dy;
    commitViewportTransform();
  };

  const finishPointerSequence = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    const wasDrag = dragState.moved;
    const clickX = dragState.clickX;
    const clickY = dragState.clickY;
    dragState = null;
    panel.classList.remove("is-dragging");
    document.removeEventListener("pointermove", onDocumentMove);
    document.removeEventListener("pointerup", finishPointerSequence);
    document.removeEventListener("pointercancel", finishPointerSequence);

    if (event.type !== "pointerup" || wasDrag || !state || !layers) {
      return;
    }
    const { x, y } = getTileFromPointer({ clientX: clickX, clientY: clickY });
    const debug = ensureDebugPlacementState();
    if (debug?.active) {
      const door = findDoorAtTile(x, y);
      if (door) {
        cycleDoorTileDebugSelection(door, state.tiles[y * state.map.width + x]);
      } else {
        const tile = state.tiles[y * state.map.width + x];
        if (tile) {
          selectTileForDebug(tile);
        }
      }
      renderWithDebug();
      return;
    }
    const result = clickEntity(state, x, y);
    ui.statusText.textContent = result.message;
    render();
    updatePanels();
  };

  panel.addEventListener("wheel", (event) => {
    if (!state) {
      return;
    }
    event.preventDefault();
    const zoomStep = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    applyViewportScale(viewport.scale * zoomStep, pointerInMapView(panel, event.clientX, event.clientY));
  }, { passive: false });

  panel.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      clickX: event.clientX,
      clickY: event.clientY,
      panStartX: viewport.panX,
      panStartY: viewport.panY,
      moved: false
    };
    panel.classList.add("is-dragging");
    document.addEventListener("pointermove", onDocumentMove, { passive: false });
    document.addEventListener("pointerup", finishPointerSequence);
    document.addEventListener("pointercancel", finishPointerSequence);
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
  state.debugPlacement = {
    active: ui.doorDebugToggle.checked,
    selectedDoorId: null,
    selectedTileKey: null,
    log: []
  };
  ui.searchResult.textContent = "none";
  ui.searchResult.title = "";
  recomputeVisibility(state);
  setupCanvasLayers(state);
  updatePanels();
  updateDoorDebugUi();
  render();
  ui.statusText.textContent = `Generated level ${level} map with seed ${seed}. Move with arrow keys.`;
}

hookInputEvents();
hookMapViewportInteractions();
generateAndRender();
