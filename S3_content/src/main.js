import { MAX_SEARCH_MODIFIER, MIN_SEARCH_MODIFIER, TILE_SIZE_PX } from "./constants.js";
import { generateDungeon } from "./generator.js";
import {
  clickEntity,
  collectLoot,
  collectRoomLoot,
  disarmTrap,
  dropLootAtPlayer,
  attemptLockedDoor,
  getPendingLockedDoorAction,
  getRoomLoot,
  getRoomTraps,
  movePlayer,
  searchForTraps
} from "./interactions.js";
import {
  createRun,
  hydrateDungeonState,
  listRunsWithNames,
  loadRun,
  MAX_SAVE_NAME_LENGTH,
  normalizeSaveName,
  updateRun
} from "./persistence.js";
import { preloadRendererAssets, renderDungeon } from "./render.js";
import {
  advanceTorchTime,
  forceTorchOut,
  lightNewTorch,
  syncElapsedTime,
  TORCH_SEARCH_ADVANCE_MS
} from "./timers.js";
import { recomputeVisibility } from "./visibility.js";
import { maybeSpawnWanderingMonster, normalizeWanderingChance, wanderingEnabled } from "./wandering.js";

const ui = {
  mapHost: document.getElementById("map-host"),
  levelInput: document.getElementById("level-input"),
  seedInput: document.getElementById("seed-input"),
  generateBtn: document.getElementById("generate-btn"),
  saveBtn: document.getElementById("save-btn"),
  loadBtn: document.getElementById("load-btn"),
  lightTorchBtn: document.getElementById("light-torch-btn"),
  torchOutBtn: document.getElementById("torch-out-btn"),
  torchBtn: document.getElementById("torch-btn"),
  searchBtn: document.getElementById("search-btn"),
  searchModifierInput: document.getElementById("search-modifier-input"),
  searchResult: document.getElementById("search-result"),
  blackoutToggle: document.getElementById("blackout-toggle"),
  statusText: document.getElementById("status-text"),
  lockedDoorActions: document.getElementById("locked-door-actions"),
  pickLockBtn: document.getElementById("pick-lock-btn"),
  breakDoorBtn: document.getElementById("break-door-btn"),
  darknessMessage: document.getElementById("darkness-message"),
  connectivityText: document.getElementById("connectivity-text"),
  wanderingSection: document.getElementById("wandering-section"),
  wanderingNumerator: document.getElementById("wandering-numerator"),
  wanderingDenominator: document.getElementById("wandering-denominator"),
  lootList: document.getElementById("loot-list"),
  inventorySlots: document.getElementById("inventory-slots"),
  totalValue: document.getElementById("total-value"),
  roomLootPanel: document.getElementById("room-loot-panel"),
  monsterPanel: document.getElementById("monster-panel"),
  trapPanel: document.getElementById("trap-panel"),
  saveLoadModal: document.getElementById("save-load-modal"),
  saveLoadTitle: document.getElementById("save-load-title"),
  saveLoadStatus: document.getElementById("save-load-status"),
  saveNameRow: document.getElementById("save-name-row"),
  saveNameInput: document.getElementById("save-name-input"),
  savedRunsList: document.getElementById("saved-runs-list"),
  overwriteConfirmation: document.getElementById("overwrite-confirmation"),
  overwriteConfirmBtn: document.getElementById("overwrite-confirm-btn"),
  overwriteCancelBtn: document.getElementById("overwrite-cancel-btn"),
  replaceConfirmation: document.getElementById("replace-confirmation"),
  replaceConfirmBtn: document.getElementById("replace-confirm-btn"),
  replaceCancelBtn: document.getElementById("replace-cancel-btn"),
  saveModalSubmit: document.getElementById("save-modal-submit"),
  saveLoadClose: document.getElementById("save-load-close"),
  lootCompleteModal: document.getElementById("loot-complete-modal"),
  lootCompleteClose: document.getElementById("loot-complete-close")
};

let state = null;
let layers = null;
let forceBlackoutWhenTorchOut = true;
let monsterTable = [];
let trapTable = [];
let shadowdarkContent = null;
let saveDialog = {
  mode: "save",
  runs: [],
  pendingRun: null
};
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

async function loadShadowdarkContent() {
  try {
    const response = await fetch("./data/shadowdark-content.json");
    if (!response.ok) {
      throw new Error(`Shadowdark content request failed: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    console.warn("Using fallback local content because the Shadowdark snapshot could not load.", error);
    return { monsters: [], loot: { gear: [], armor: [], weapons: [], magicItems: [] } };
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
  ui.mapHost.style.marginRight = "";
  ui.mapHost.style.marginBottom = "";
  commitViewportTransform();
}

function setStatus(resultOrMessage) {
  const result = typeof resultOrMessage === "string"
    ? { message: resultOrMessage }
    : resultOrMessage || { message: "" };
  ui.statusText.classList.toggle("trap-sprung-status", result.trapSprung === true);
  ui.statusText.textContent = result.trapSprung
    ? `Trap is Sprung! ${result.message || ""}`
    : result.message || "";
  ui.darknessMessage.textContent = result.darknessMessage || "";
  updateLockedDoorUi();
}

function markUserActivity() {
  if (!state) {
    return;
  }
  state.run = {
    ...state.run,
    dirty: true,
    hasUserActivity: true
  };
}

function updateWanderingUi() {
  if (!state) {
    return;
  }
  ui.wanderingNumerator.value = `${state.wanderingMonsters?.numerator ?? 1}`;
  ui.wanderingDenominator.value = `${state.wanderingMonsters?.denominator ?? 6}`;
  sizeControlField(ui.wanderingNumerator);
  sizeControlField(ui.wanderingDenominator);
  ui.wanderingSection.classList.toggle("is-disabled", !wanderingEnabled(state));
}

function updateLockedDoorUi() {
  const action = getPendingLockedDoorAction(state);
  ui.lockedDoorActions.hidden = !action;
  if (!action) {
    return;
  }
  ui.pickLockBtn.textContent = `Pick Lock DC ${action.pickDc}`;
  ui.breakDoorBtn.textContent = `Break DC ${action.breakDc}`;
}

function sizeControlField(input) {
  if (!input?.matches("[data-autosize-field]")) {
    return;
  }
  const configuredChars = Number(input.dataset.sizeChars) || 0;
  const valueChars = String(input.value || input.placeholder || "").length;
  const maxChars = input.max ? String(input.max).length : 0;
  const minChars = input.min && input.min.startsWith("-") ? String(input.min).length : 0;
  const chars = Math.max(configuredChars, valueChars, maxChars, minChars, 1);
  input.style.setProperty("--field-width", `calc(${chars}ch + 2.6em)`);
}

function updateControlSizing() {
  document.querySelectorAll("[data-autosize-field]").forEach(sizeControlField);
}

function processWanderingChecks(count) {
  let lastMessage = "";
  for (let i = 0; i < count; i += 1) {
    const result = maybeSpawnWanderingMonster(state, monsterTable);
    if (result.message) {
      lastMessage = result.message;
    }
  }
  if (lastMessage) {
    setStatus(lastMessage);
  }
}

function render() {
  renderDungeon(state, layers, {
    forceBlackout: forceBlackoutWhenTorchOut && !state.player.torchLit
  });
  ui.connectivityText.textContent = state.generation.connectivityValid ? "valid" : "invalid";
  updateLockedDoorUi();
  updateWanderingUi();
}

function updateLootUi() {
  ui.lootList.innerHTML = "";
  for (const entry of state.lootLog.entries) {
    const item = document.createElement("li");
    item.className = "loot-item";
    const slotText = `${entry.slots || 1} slot${(entry.slots || 1) === 1 ? "" : "s"}`;
    const valueText = entry.priceless ? "priceless" : `${entry.value} gp`;
    item.textContent = `${entry.name} (${slotText}, ${valueText})`;
    const dropBtn = document.createElement("button");
    dropBtn.textContent = "Leave";
    dropBtn.addEventListener("click", () => {
      const result = dropLootAtPlayer(state, entry.id);
      markUserActivity();
      setStatus(result);
      render();
      updatePanels();
    });
    item.append(" ", dropBtn);
    ui.lootList.append(item);
  }
  ui.totalValue.textContent = `${state.lootLog.totalValue}`;
  if (ui.inventorySlots) {
    const inventory = state.inventory || { baseSlots: 10, bonusSlots: 0, usedSlots: 0 };
    const capacity = (inventory.baseSlots || 10) + (inventory.bonusSlots || 0);
    ui.inventorySlots.textContent = `${inventory.usedSlots || 0} / ${capacity} slots`;
  }
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
      markUserActivity();
      setStatus(result);
      render();
      updatePanels();
      maybeShowFullyLooted();
    });
    ui.roomLootPanel.append(lootAllButton);
  }

  for (const loot of roomLoot) {
    const lootButton = document.createElement("button");
    lootButton.type = "button";
    const slotText = `${loot.slots || 1} slot${(loot.slots || 1) === 1 ? "" : "s"}`;
    const valueText = loot.priceless ? "priceless" : `${loot.value} gp`;
    lootButton.textContent = `Get: ${loot.name || "treasure"} (${slotText}, ${valueText})`;
    lootButton.addEventListener("click", () => {
      const result = collectLoot(state, loot.id);
      markUserActivity();
      setStatus(result);
      render();
      updatePanels();
      maybeShowFullyLooted();
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
    title.textContent = monster.wandering ? `${monster.name} (wandering)` : monster.name;
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

    if (trap.wasSprung) {
      const sprungBanner = document.createElement("div");
      sprungBanner.className = "trap-sprung-banner";
      sprungBanner.textContent = "Trap is Sprung!";
      card.append(sprungBanner);
    }

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
        markUserActivity();
        setStatus(result);
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

function maybeShowFullyLooted() {
  if (state.lootLog.fullyLootedShown) {
    return;
  }
  const hasUncollectedTreasure = state.entities.some((entity) => {
    return entity.type === "treasure" && !entity.collected;
  });
  if (!hasUncollectedTreasure) {
    state.lootLog.fullyLootedShown = true;
    ui.lootCompleteModal.hidden = false;
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
  sizeControlField(ui.searchModifierInput);
  return modifier;
}

function formatRollTooltip(result, action) {
  return `roll of ${result.roll} ${result.modifier >= 0 ? "+" : "-"} ${Math.abs(result.modifier)} = ${result.total} for ${action}`;
}

function applyTorchAdvance(result) {
  if (result.crossedWanderingChecks) {
    processWanderingChecks(result.crossedWanderingChecks);
  }
  if (result.expired) {
    recomputeVisibility(state);
    setStatus("Torch went out!");
  }
}

function performSearch() {
  if (!state) {
    return;
  }
  const result = searchForTraps(state, normalizeSearchModifier());
  markUserActivity();
  setStatus(result);
  ui.searchResult.textContent = `${result.total}`;
  ui.searchResult.title = result.roll ? formatRollTooltip(result, "search") : "";
  if (state.player.torchLit) {
    applyTorchAdvance(advanceTorchTime(state, TORCH_SEARCH_ADVANCE_MS));
  }
  render();
  updatePanels();
}

function performGet() {
  if (!state) {
    return;
  }
  const [loot] = getRoomLoot(state);
  const result = loot ? collectLoot(state, loot.id) : { message: "No revealed treasure to get." };
  markUserActivity();
  setStatus(result);
  render();
  updatePanels();
  maybeShowFullyLooted();
}

function performLeave() {
  if (!state) {
    return;
  }
  const [entry] = state.lootLog.entries;
  const result = entry ? dropLootAtPlayer(state, entry.id) : { message: "No carried treasure to leave." };
  markUserActivity();
  setStatus(result);
  render();
  updatePanels();
}

function performDisarm() {
  if (!state) {
    return;
  }
  const [trap] = getRoomTraps(state).filter((candidate) => !candidate.triggered && !candidate.disarmed);
  if (!trap) {
    setStatus("No active revealed trap to disarm.");
    return;
  }
  const result = disarmTrap(state, trap.id, normalizeSearchModifier());
  markUserActivity();
  setStatus(result);
  ui.searchResult.textContent = `${result.total}`;
  ui.searchResult.title = formatRollTooltip(result, "disarm");
  render();
  updatePanels();
}

function sanitizeWanderingInput(input) {
  const value = Math.max(0, Math.min(99, Number.parseInt(input.value || "0", 10) || 0));
  input.value = `${value}`;
  sizeControlField(input);
  normalizeWanderingChance(state, ui.wanderingNumerator.value, ui.wanderingDenominator.value);
  markUserActivity();
  updateWanderingUi();
}

async function refreshSavedRuns() {
  ui.saveLoadStatus.textContent = "Loading saves...";
  ui.savedRunsList.innerHTML = "";
  try {
    saveDialog.runs = await listRunsWithNames();
    ui.saveLoadStatus.textContent = saveDialog.runs.length ? "" : "No saved runs yet.";
  } catch (error) {
    saveDialog.runs = [];
    ui.saveLoadStatus.textContent = error.message;
  }
  renderSavedRunsList();
}

function renderSavedRunsList() {
  ui.savedRunsList.innerHTML = "";
  for (const run of saveDialog.runs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "saved-run-button";
    const label = document.createElement("span");
    label.textContent = run.name || `Level ${run.level} - Seed ${run.seed}`;
    const meta = document.createElement("span");
    meta.className = "saved-run-meta";
    meta.textContent = `L${run.level} seed ${run.seed}`;
    button.append(label, meta);
    button.addEventListener("click", () => {
      if (saveDialog.mode === "save") {
        saveDialog.pendingRun = run;
        ui.saveNameInput.value = normalizeSaveName(run.name);
        ui.overwriteConfirmation.hidden = false;
        ui.replaceConfirmation.hidden = true;
      } else if (state.run?.hasUserActivity) {
        saveDialog.pendingRun = run;
        ui.replaceConfirmation.hidden = false;
      } else {
        loadSelectedRun(run);
      }
    });
    ui.savedRunsList.append(button);
  }
}

async function openSaveLoadModal(mode) {
  saveDialog = {
    mode,
    runs: [],
    pendingRun: null
  };
  ui.saveLoadTitle.textContent = mode === "save" ? "Save Run" : "Load Run";
  ui.saveNameRow.hidden = mode !== "save";
  ui.saveModalSubmit.hidden = mode !== "save";
  ui.saveNameInput.value = normalizeSaveName(state.run?.name || "");
  ui.overwriteConfirmation.hidden = true;
  ui.replaceConfirmation.hidden = true;
  ui.saveLoadModal.hidden = false;
  await refreshSavedRuns();
}

function closeSaveLoadModal() {
  ui.saveLoadModal.hidden = true;
  saveDialog.pendingRun = null;
}

function findRunByName(name) {
  const normalized = normalizeSaveName(name).toLowerCase();
  return saveDialog.runs.find((run) => normalizeSaveName(run.name).toLowerCase() === normalized) || null;
}

async function saveCurrentRun(overwriteRun = null) {
  const name = normalizeSaveName(ui.saveNameInput.value);
  if (!name) {
    ui.saveLoadStatus.textContent = "Enter a save name.";
    return;
  }
  const duplicate = overwriteRun || findRunByName(name);
  if (!overwriteRun && duplicate) {
    saveDialog.pendingRun = duplicate;
    ui.overwriteConfirmation.hidden = false;
    return;
  }
  if (!overwriteRun && saveDialog.runs.length >= 10) {
    ui.saveLoadStatus.textContent = "Maximum of 10 saved runs reached. Pick an existing save to overwrite.";
    return;
  }

  ui.saveLoadStatus.textContent = "Saving...";
  try {
    const result = duplicate
      ? await updateRun(duplicate.id, name, state)
      : await createRun(name, state);
    state.run.id = result.id || duplicate?.id || state.run.id;
    state.run.name = name;
    state.run.dirty = false;
    state.run.lastSavedAt = result.updated_at || result.created_at || new Date().toISOString();
    ui.saveLoadStatus.textContent = "Saved.";
    await refreshSavedRuns();
  } catch (error) {
    ui.saveLoadStatus.textContent = error.message;
  }
}

async function loadSelectedRun(run) {
  ui.saveLoadStatus.textContent = "Loading...";
  try {
    const loaded = await (run.state_json ? Promise.resolve(run) : loadRun(run.id));
    state = hydrateDungeonState(loaded.state_json);
    state.run.id = loaded.id;
    state.run.name = normalizeSaveName(loaded.name || state.run.name);
    state.run.dirty = false;
    state.run.hasUserActivity = false;
    recomputeVisibility(state);
    setupCanvasLayers(state);
    updatePanels();
    updateWanderingUi();
    render();
    closeSaveLoadModal();
    setStatus(`Loaded ${state.run.name || "saved run"}.`);
  } catch (error) {
    ui.saveLoadStatus.textContent = error.message;
  }
}

function hookInputEvents() {
  document.addEventListener("keydown", (event) => {
    if (!state) {
      return;
    }
    if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(event.target.tagName)) {
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
      markUserActivity();
      setStatus(result);
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
  ui.levelInput.addEventListener("input", () => sizeControlField(ui.levelInput));

  ui.saveBtn.addEventListener("click", () => {
    openSaveLoadModal("save");
  });

  ui.loadBtn.addEventListener("click", () => {
    openSaveLoadModal("load");
  });

  ui.lightTorchBtn.addEventListener("click", () => {
    lightNewTorch(state);
    markUserActivity();
    recomputeVisibility(state);
    setStatus("New torch lit.");
    render();
  });

  ui.torchOutBtn.addEventListener("click", () => {
    forceTorchOut(state);
    markUserActivity();
    recomputeVisibility(state);
    setStatus("Torch went out!");
    render();
  });

  ui.torchBtn.addEventListener("click", () => {
    if (state.player.torchLit) {
      forceTorchOut(state);
      setStatus("Torch extinguished.");
    } else {
      lightNewTorch(state);
      recomputeVisibility(state);
      setStatus("Torch relit.");
    }
    markUserActivity();
    render();
  });

  ui.searchModifierInput.addEventListener("change", () => {
    normalizeSearchModifier();
  });
  ui.searchModifierInput.addEventListener("input", () => {
    const value = Number(ui.searchModifierInput.value);
    sizeControlField(ui.searchModifierInput);
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

  ui.pickLockBtn.addEventListener("click", () => {
    const result = attemptLockedDoor(state, "pick", normalizeSearchModifier());
    markUserActivity();
    setStatus(result);
    ui.searchResult.textContent = `${result.total}`;
    ui.searchResult.title = formatRollTooltip(result, "pick lock");
    render();
    updatePanels();
  });

  ui.breakDoorBtn.addEventListener("click", () => {
    const result = attemptLockedDoor(state, "break", normalizeSearchModifier());
    markUserActivity();
    setStatus(result);
    ui.searchResult.textContent = `${result.total}`;
    ui.searchResult.title = formatRollTooltip(result, "break door");
    render();
    updatePanels();
  });

  ui.blackoutToggle.addEventListener("change", () => {
    forceBlackoutWhenTorchOut = ui.blackoutToggle.checked;
    render();
  });

  ui.wanderingNumerator.addEventListener("input", () => sanitizeWanderingInput(ui.wanderingNumerator));
  ui.wanderingDenominator.addEventListener("input", () => sanitizeWanderingInput(ui.wanderingDenominator));
  ui.saveNameInput.addEventListener("input", () => {
    ui.saveNameInput.value = ui.saveNameInput.value.slice(0, MAX_SAVE_NAME_LENGTH);
    ui.overwriteConfirmation.hidden = true;
  });
  ui.saveModalSubmit.addEventListener("click", () => saveCurrentRun());
  ui.overwriteConfirmBtn.addEventListener("click", () => saveCurrentRun(saveDialog.pendingRun));
  ui.overwriteCancelBtn.addEventListener("click", () => {
    ui.overwriteConfirmation.hidden = true;
    saveDialog.pendingRun = null;
    ui.saveNameInput.focus();
  });
  ui.replaceConfirmBtn.addEventListener("click", () => loadSelectedRun(saveDialog.pendingRun));
  ui.replaceCancelBtn.addEventListener("click", () => {
    ui.replaceConfirmation.hidden = true;
    saveDialog.pendingRun = null;
  });
  ui.saveLoadClose.addEventListener("click", closeSaveLoadModal);
  ui.lootCompleteClose.addEventListener("click", () => {
    ui.lootCompleteModal.hidden = true;
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
    const result = clickEntity(state, x, y);
    markUserActivity();
    setStatus(result);
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
  setStatus("Generating dungeon...");
  [shadowdarkContent, trapTable] = await Promise.all([loadShadowdarkContent(), loadTrapTable()]);
  monsterTable = Array.isArray(shadowdarkContent?.monsters)
    ? shadowdarkContent.monsters.filter((monster) => (monster.level ?? monster.lv ?? 1) <= Math.max(2, level + 1))
    : [];
  state = generateDungeon(seed, level, {
    monsterTable,
    trapTable,
    contentCatalog: shadowdarkContent
  });
  normalizeWanderingChance(state, ui.wanderingNumerator.value, ui.wanderingDenominator.value);
  state.run.hasUserActivity = false;
  state.run.dirty = false;
  ui.searchResult.textContent = "none";
  ui.searchResult.title = "";
  recomputeVisibility(state);
  setupCanvasLayers(state);
  updatePanels();
  render();
  setStatus(`Generated level ${level} map with seed ${seed}. Move with arrow keys.`);
}

function startClock() {
  window.setInterval(() => {
    if (!state) {
      return;
    }
    const result = syncElapsedTime(state);
    if (result.crossedWanderingChecks) {
      processWanderingChecks(result.crossedWanderingChecks);
    }
    if (result.expired) {
      recomputeVisibility(state);
      setStatus("Torch went out!");
    }
    render();
    updatePanels();
  }, 1000);
}

async function initialize() {
  try {
    setStatus("Loading hand-drawn renderer assets...");
    await preloadRendererAssets();
  } catch (error) {
    console.warn("Hand-drawn renderer assets failed to load. Falling back to flat renderer.", error);
  }
  hookInputEvents();
  hookMapViewportInteractions();
  updateControlSizing();
  startClock();
  generateAndRender();
}

initialize();
