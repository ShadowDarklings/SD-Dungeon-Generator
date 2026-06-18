import { DEFAULT_LIGHT_RADIUS, MAX_SEARCH_MODIFIER, MIN_SEARCH_MODIFIER, TILE_SIZE_PX } from "./constants.js";
import { generateDungeon } from "./generator.js";
import {
  clickEntity,
  collectLoot,
  collectRoomLoot,
  defeatMonster,
  disarmTrap,
  dropLootAtPlayer,
  attemptLockedDoor,
  getPendingLockedDoorAction,
  getRoomLoot,
  getRoomTraps,
  movePlayer,
  rollCheck,
  searchForTraps
} from "./interactions.js";
import { formatTreasureValue } from "./treasure.js";
import {
  createRun,
  hydrateDungeonState,
  importShadowdarklingsCharacter,
  listRunsWithNames,
  listSavedCharacters,
  loadRun,
  loadSavedCharacter,
  MAX_SAVE_NAME_LENGTH,
  normalizeSaveName,
  createSavedCharacter,
  updateRun
} from "./persistence.js";
import {
  abilityScoreModifier,
  decrementCharacterDyingRounds,
  extractShadowdarkCharacters,
  getCharacterCoinBagSlots,
  getActiveCharacter,
  getCharacterActionModifier,
  getCharacterAmmo,
  getCharacterAmmoEntries,
  getCharacterAttackSummary,
  getCharacterDisplayHeader,
  getCharacterGearFreeSlots,
  hasCharacterAmmo,
  getCharacterStatSummary,
  markCharacterSlain,
  normalizeCharacterState,
  setActiveCharacter,
  setCharacterAmmo,
  setCharacterHp
} from "./characters.js";
import { extractDamageReferences, normalizeDamageExpression, rollDamageExpression } from "./damage.js";
import { preloadRendererAssets, renderDungeon } from "./render.js";
import { loadSpellLibrary, normalizeSpellLookupKey } from "./spells.js";
import {
  assignSessionCharacter,
  createHostSession,
  getHostSession,
  joinHostSession,
  normalizeSessionCode,
  updateHostSessionState
} from "./multiplayer.js";
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
  zoomInBtn: document.getElementById("zoom-in-btn"),
  zoomOutBtn: document.getElementById("zoom-out-btn"),
  saveBtn: document.getElementById("save-btn"),
  loadBtn: document.getElementById("load-btn"),
  loadCharacterBtn: document.getElementById("load-character-btn"),
  multiplayerBtn: document.getElementById("multiplayer-btn"),
  multiplayerTitle: document.getElementById("multiplayer-title"),
  multiplayerHostSection: document.getElementById("multiplayer-host-section"),
  multiplayerJoinSection: document.getElementById("multiplayer-join-section"),
  lightTorchBtn: document.getElementById("light-torch-btn"),
  lightLanternBtn: document.getElementById("light-lantern-btn"),
  castLightBtn: document.getElementById("cast-light-btn"),
  torchOutBtn: document.getElementById("torch-out-btn"),
  torchBtn: document.getElementById("torch-btn"),
  searchBtn: document.getElementById("search-btn"),
  searchModifierInput: document.getElementById("search-modifier-input"),
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
  dungeonTabBtn: document.getElementById("dungeon-tab-btn"),
  charactersTabBtn: document.getElementById("characters-tab-btn"),
  dungeonTabPanel: document.getElementById("dungeon-tab-panel"),
  charactersTabPanel: document.getElementById("characters-tab-panel"),
  importCharacterBtn: document.getElementById("import-character-btn"),
  baseClassesOnlyToggle: document.getElementById("base-classes-only-toggle"),
  charactersEmpty: document.getElementById("characters-empty"),
  charactersList: document.getElementById("characters-list"),
  characterDetail: document.getElementById("character-detail"),
  damageResult: document.getElementById("damage-result"),
  damageContext: document.getElementById("damage-context"),
  damageExpandBtn: document.getElementById("damage-expand-btn"),
  damageDetail: document.getElementById("damage-detail"),
  diceHistoryToggle: document.getElementById("dice-history-toggle"),
  diceHistory: document.getElementById("dice-history"),
  manualDiceControls: document.getElementById("manual-dice-controls"),
  manualDieCount: document.getElementById("manual-die-count"),
  manualDieModifier: document.getElementById("manual-die-modifier"),
  manualDieReset: document.getElementById("manual-die-reset"),
  characterSheetModal: document.getElementById("character-sheet-modal"),
  characterSheetContent: document.getElementById("character-sheet-content"),
  characterSheetClose: document.getElementById("character-sheet-close"),
  spellDetailModal: document.getElementById("spell-detail-modal"),
  spellDetailClose: document.getElementById("spell-detail-close"),
  spellDetailTitle: document.getElementById("spell-detail-title"),
  spellDetailMeta: document.getElementById("spell-detail-meta"),
  spellDetailDuration: document.getElementById("spell-detail-duration"),
  spellDetailRange: document.getElementById("spell-detail-range"),
  spellDetailBody: document.getElementById("spell-detail-body"),
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
  multiplayerModal: document.getElementById("multiplayer-modal"),
  multiplayerStatus: document.getElementById("multiplayer-status"),
  multiplayerCreateHostBtn: document.getElementById("multiplayer-create-host-btn"),
  multiplayerInviteRow: document.getElementById("multiplayer-invite-row"),
  multiplayerInviteLink: document.getElementById("multiplayer-invite-link"),
  multiplayerCopyLinkBtn: document.getElementById("multiplayer-copy-link-btn"),
  multiplayerJoinCode: document.getElementById("multiplayer-join-code"),
  multiplayerJoinBtn: document.getElementById("multiplayer-join-btn"),
  multiplayerPresenceList: document.getElementById("multiplayer-presence-list"),
  multiplayerPlayerSelect: document.getElementById("multiplayer-player-select"),
  multiplayerCharacterSelect: document.getElementById("multiplayer-character-select"),
  multiplayerAssignBtn: document.getElementById("multiplayer-assign-btn"),
  multiplayerRefreshBtn: document.getElementById("multiplayer-refresh-btn"),
  multiplayerClose: document.getElementById("multiplayer-close"),
  lootCompleteModal: document.getElementById("loot-complete-modal"),
  lootCompleteClose: document.getElementById("loot-complete-close")
};

let state = null;
let layers = null;
let forceBlackoutWhenTorchOut = true;
let monsterTable = [];
let trapTable = [];
let shadowdarkContent = null;
let rulesData = null;
let spellLibraryPromise = null;
let spellLookup = new Map();
let lastDamageRoll = null;
let diceHistory = [];
let activeTab = "dungeon";
let characterSheetPosition = null;
let characterSheetDrag = null;
let activeShopPanel = null;
let saveDialog = {
  mode: "save",
  runs: [],
  pendingRun: null
};
let multiplayerSession = {
  inviteCode: "",
  inviteUrl: "",
  role: "",
  currentPlayerId: null,
  players: [],
  assignments: [],
  stateJson: null
};
let multiplayerRefreshTimer = null;
let multiplayerRefreshInFlight = false;
let multiplayerAutoJoinAttempted = false;

const BASE_CLASSES_ONLY_STORAGE_KEY = "shadowspawner.baseClassesOnly";
const SHADOWDARKLINGS_SOURCE_SWITCHES = [
  "Scroll #1",
  "Scroll #2",
  "Scroll #3",
  "Scroll #4",
  "B&R&K",
  "Roustabout",
  "Unnatural Selection",
  "Darcy"
];
let viewport = {
  scale: 1,
  minScale: 1,
  maxScale: 2.4,
  width: 0,
  height: 0,
  panX: 0,
  panY: 0
};
const DRAG_THRESHOLD_PX = 8;
const MAX_SESSION_CHARACTERS = 16;
const characterAmmoOverrides = new Map();
const characterColorOverrides = new Map();
const CHARACTER_COLOR_PALETTE = Object.freeze([
  { id: "dark-blue", label: "Dark blue", value: "#174a9c" },
  { id: "purple", label: "Purple", value: "#7b3fb2" },
  { id: "dark-purple", label: "Dark purple", value: "#44206f" },
  { id: "light-purple", label: "Light purple", value: "#b78cff" },
  { id: "orange", label: "Orange", value: "#e07022" },
  { id: "dark-red", label: "Dark red", value: "#7f1111" },
  { id: "brown", label: "Brown", value: "#694327" },
  { id: "black", label: "Black", value: "#050505" },
  { id: "white", label: "White", value: "#f7f7f7" },
  { id: "dark-gray", label: "Dark gray", value: "#3c3c3c" },
  { id: "light-gray", label: "Light gray", value: "#b8b8b8" },
  { id: "dark-green", label: "Dark green", value: "#155b2a" },
  { id: "light-green", label: "Light green", value: "#65bd55" },
  { id: "pink", label: "Pink", value: "#ef7aa7" },
  { id: "magenta", label: "Magenta", value: "#d51ea7" },
  { id: "cyan", label: "Cyan", value: "#22bfd0" }
]);
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

function getMonsterBucket(level) {
  const parsed = Number(level) || 1;
  return Math.max(1, Math.min(10, parsed >= 10 ? 10 : parsed));
}

async function loadMonsterTableForLevel(level) {
  const bucket = getMonsterBucket(level);
  try {
    const response = await fetch(`./monsters-${bucket}.json`);
    if (!response.ok) {
      throw new Error(`Monster table request failed: ${response.status}`);
    }
    const payload = await response.json();
    return Array.isArray(payload) ? payload : [];
  } catch (error) {
    console.warn(`Using fallback monster table for level ${level}.`, error);
    return Array.isArray(shadowdarkContent?.monsters)
      ? shadowdarkContent.monsters.filter((monster) => {
        const monsterLevel = Number(monster?.level ?? monster?.lv ?? monster?.["**LV**"] ?? 1) || 1;
        return bucket >= 10 ? monsterLevel >= 10 : monsterLevel === bucket;
      })
      : [];
  }
}

async function ensureSpellLibraryLoaded() {
  if (!spellLibraryPromise) {
    spellLibraryPromise = loadSpellLibrary().then((library) => {
      spellLookup = library.lookup;
      return library;
    });
  }
  return spellLibraryPromise;
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

function getMapViewCenter(panel) {
  const { width, height } = getMapViewSize(panel);
  return {
    x: width / 2,
    y: height / 2
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

function zoomMapBy(multiplier) {
  if (!state) {
    return;
  }
  const panel = ui.mapHost.parentElement;
  applyViewportScale(viewport.scale * multiplier, getMapViewCenter(panel));
}

function setStatus(resultOrMessage) {
  const result = typeof resultOrMessage === "string"
    ? { message: resultOrMessage }
    : resultOrMessage || { message: "" };
  ui.statusText.classList.toggle("trap-sprung-status", result.trapSprung === true);
  ui.statusText.classList.toggle("no-free-slots-status", result.noFreeSlots === true);
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
  ui.breakDoorBtn.textContent = `Smash DC ${action.breakDc}`;
}

function updateTrapActionUi() {
  // Revealed trap cards render their own Disarm? button; there is no global disarm control.
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

function syncSidebarWidth() {
  // Fixed width: ~180px narrow default + 300px requested (not title-sized).
  const SIDEBAR_WIDTH_PX = 480;
  const panel = document.querySelector(".controls-panel");
  if (!panel) {
    return;
  }
  panel.style.width = `${SIDEBAR_WIDTH_PX}px`;
  panel.style.setProperty("--sidebar-width", `${SIDEBAR_WIDTH_PX}px`);
  const layout = document.querySelector(".layout");
  if (layout) {
    layout.style.setProperty("--sidebar-width", `${SIDEBAR_WIDTH_PX}px`);
  }
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
    forceBlackout: forceBlackoutWhenTorchOut && !hasAnyVisibleLightSource()
  });
  if (ui.connectivityText) {
    ui.connectivityText.textContent = state.generation.connectivityValid ? "valid" : "invalid";
  }
  updateLightControlUi();
  updateLockedDoorUi();
  updateTrapActionUi();
  updateWanderingUi();
}

function setActiveTab(nextTab) {
  activeTab = nextTab;
  const isDungeon = nextTab === "dungeon";
  ui.dungeonTabBtn?.classList.toggle("is-active", isDungeon);
  ui.charactersTabBtn?.classList.toggle("is-active", !isDungeon);
  ui.dungeonTabBtn?.setAttribute("aria-selected", `${isDungeon}`);
  ui.charactersTabBtn?.setAttribute("aria-selected", `${!isDungeon}`);
  if (ui.dungeonTabPanel) {
    ui.dungeonTabPanel.hidden = false;
  }
  if (ui.charactersTabPanel) {
    ui.charactersTabPanel.hidden = true;
  }
  if (ui.characterDetail) {
    ui.characterDetail.hidden = true;
  }
  if (!isDungeon && state) {
    updateCharactersUi();
  }
}

function updateLootUi() {
  if (!ui.lootList || !ui.totalValue || !ui.inventorySlots) {
    return;
  }
  ui.lootList.innerHTML = "";
  for (const entry of state.lootLog.entries) {
    const item = document.createElement("li");
    item.className = "loot-item";
    const slotText = `${entry.slots || 1} slot${(entry.slots || 1) === 1 ? "" : "s"}`;
    const valueText = entry.priceless ? "priceless" : formatTreasureValue(entry.value);
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
  ui.totalValue.textContent = formatTreasureValue(state.lootLog.totalValue);
  if (ui.inventorySlots) {
    const inventory = state.inventory || { baseSlots: 10, bonusSlots: 0, usedSlots: 0 };
    const capacity = Number(inventory.baseSlots ?? 10) + Number(inventory.bonusSlots ?? 0);
    ui.inventorySlots.textContent = `${inventory.usedSlots || 0} / ${capacity} slots`;
  }
}

function getCharacterActionContext(action) {
  const character = getActiveCharacter(state);
  const situational = Number(ui.searchModifierInput?.value || 0) || 0;
  const baseModifier = getCharacterActionModifier(character, action);
  const className = String(character?.className || "").toLowerCase();
  const advantageClassByAction = {
    break: "fighter",
    search: "thief",
    disarm: "thief",
    pick: "thief"
  };
  const advantageClass = advantageClassByAction[action] || "";
  return {
    character,
    modifier: baseModifier + situational,
    doubleRoll: Boolean(advantageClass && className === advantageClass),
    advantageClass
  };
}

function formatRollText(result) {
  if (!result) {
    return "none";
  }
  const modifierText = result.modifier >= 0 ? `+${result.modifier}` : `${result.modifier}`;
  if (Number.isFinite(result.secondaryRoll)) {
    const kept = `*${result.roll}${modifierText}*`;
    const secondary = `${result.firstRoll}${modifierText}`;
    return `${kept} / ${secondary}`;
  }
  return `${result.roll}${modifierText}`;
}

function formatModifier(value) {
  const modifier = Number(value) || 0;
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

function createRandomDungeonSeed() {
  return Math.floor(Math.random() * 900000) + 100000;
}

function prettifyAttackName(value) {
  return String(value || "")
    .replace(/\b([A-Z]{2,})\b/g, (match) => match.charAt(0) + match.slice(1).toLowerCase())
    .replace(/\s+/g, " ")
    .trim();
}

function parseAttackText(attackText) {
  const normalized = String(attackText || "").replace(/^ATTACKS?:\s*/i, "").trim();
  if (!normalized) {
    return null;
  }
  const colonIndex = normalized.indexOf(":");
  if (colonIndex === -1) {
    return {
      name: prettifyAttackName(normalized),
      flag: "",
      bonus: 0,
      bonusText: "",
      detail: ""
    };
  }

  const namePart = normalized.slice(0, colonIndex).trim();
  const remainder = normalized.slice(colonIndex + 1).trim();
  const firstComma = remainder.indexOf(",");
  const firstChunk = firstComma === -1 ? remainder : remainder.slice(0, firstComma).trim();
  const rest = firstComma === -1 ? "" : remainder.slice(firstComma + 1).trim();
  const flagMatch = namePart.match(/\(([^)]+)\)/) || firstChunk.match(/\(([^)]+)\)/);
  const bonusMatch = firstChunk.match(/[+\-]\d+/);
  const cleanName = namePart.replace(/\s*\([^)]+\)\s*/g, " ").trim();
  const detail = rest
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s*,\s*/g, ", ")
    .replace(/[\s,;]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    name: prettifyAttackName(cleanName || namePart),
    flag: flagMatch ? ` (${flagMatch[1]})` : "",
    bonus: bonusMatch ? Number.parseInt(bonusMatch[0], 10) : 0,
    bonusText: bonusMatch ? bonusMatch[0] : firstChunk,
    detail,
    damageExpression: extractDamageReferences(detail)[0]?.expression || ""
  };
}

function isThiefCharacter(character) {
  return /\bthief\b/i.test(String(character?.className || ""));
}

function isBackstabAttackText(attackText) {
  return /^backstab\b/i.test(String(attackText || "").replace(/^ATTACKS?:\s*/i, "").trim());
}

function getBackstabIncreaseCount(character) {
  const haystack = [
    ...(character?.levels || []).map((level) => `${level?.talentRolledName || ""} ${level?.talentRolledDesc || ""}`),
    ...(character?.bonuses || []).map((bonus) => `${bonus?.bonusName || bonus?.name || ""} ${bonus?.bonusTo || ""}`)
  ].join(" ");
  return Array.from(haystack.matchAll(/backstab\s+increase/gi)).length;
}

function getBackstabMultiplier(character) {
  return isThiefCharacter(character) ? 2 + getBackstabIncreaseCount(character) : 0;
}

function multiplyDamageDice(expression, multiplier) {
  const normalized = normalizeDamageExpression(expression);
  if (!normalized || multiplier <= 1) {
    return normalized;
  }
  return normalized.replace(/(\d*)d(\d+)/gi, (match, count, sides) => {
    const diceCount = Number.parseInt(count || "1", 10);
    return `${diceCount * multiplier}d${sides}`;
  });
}

function applyAttackRoll(character, attack) {
  if (!ui.damageResult || !attack) {
    return;
  }
  const result = rollCheck(attack.bonus || 0);
  const characterName = character?.name || "Character";
  const attackName = `${attack.name}${attack.flag || ""}`.trim();
  const message = `${characterName} attacks with ${attackName} and rolls a ${result.total}.`;
  markUserActivity();
  setStatus(message);
  showCheckResult(result, "Attack", {
    headline: message,
    message: "Attack roll"
  });
}

function createAttackButton(character, attack) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "damage-token attack-roll-button";
  button.textContent = attack.name;
  button.title = `Roll attack ${attack.bonusText ? attack.bonusText : formatModifier(attack.bonus || 0)}`;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    applyAttackRoll(character, attack);
  });
  return button;
}

function getMonsterAttackDisplayName(monster) {
  const rawName = String(monster?.name || "monster").trim();
  return rawName ? rawName.toLowerCase() : "monster";
}

function applyMonsterAttackRoll(monster, attack) {
  if (!ui.damageResult || !attack) {
    return;
  }
  const result = rollCheck(attack.bonus || 0);
  const monsterName = getMonsterAttackDisplayName(monster);
  const message = `The ${monsterName} attacks and rolls a ${result.total}.`;
  markUserActivity();
  setStatus(message);
  showCheckResult(result, "Attack", {
    headline: message,
    message: `${attack.name} ${attack.bonusText || formatModifier(attack.bonus || 0)}`
  });
}

function createMonsterAttackButton(monster, attack) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "damage-token attack-roll-button";
  button.textContent = attack.name;
  button.title = `Roll attack ${attack.bonusText || formatModifier(attack.bonus || 0)}`;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    applyMonsterAttackRoll(monster, attack);
  });
  return button;
}

function parseMonsterAttackSegment(segment) {
  const value = String(segment || "").trim();
  if (!value) {
    return null;
  }
  const match = value.match(/^(\d+\s+)?(.+?)\s*(\([^)]+\)\s*)?([+\-]\d+)\b(.*)$/);
  if (!match) {
    return null;
  }
  const [, count = "", rawName = "", range = "", bonusText = "", detail = ""] = match;
  const name = prettifyAttackName(rawName.trim());
  if (!name) {
    return null;
  }
  return {
    count,
    name,
    range,
    bonus: Number.parseInt(bonusText, 10) || 0,
    bonusText,
    detail
  };
}

function appendMonsterAttackSegment(target, segment, monster) {
  const attack = parseMonsterAttackSegment(segment);
  if (!attack) {
    appendDamageAwareText(target, segment, {
      sourceLabel: `${monster?.name || "Monster"} attack`
    });
    return;
  }
  if (attack.count) {
    target.append(document.createTextNode(attack.count));
  }
  target.append(createMonsterAttackButton(monster, attack));
  if (attack.range) {
    target.append(document.createTextNode(` ${attack.range.trim()}`));
  }
  target.append(document.createTextNode(` ${attack.bonusText}`));
  if (attack.detail) {
    appendDamageAwareText(target, attack.detail, {
      sourceLabel: `${monster?.name || "Monster"} attack`
    });
  }
}

function createMonsterAttackContent(monster) {
  const content = document.createElement("span");
  const value = String(monster?.attack || "").trim();
  if (!value) {
    content.textContent = "unknown";
    return content;
  }
  const parts = value.split(/(\s+\b(?:or|and)\b\s+)/i);
  for (const part of parts) {
    if (!part) {
      continue;
    }
    if (/^\s+\b(?:or|and)\b\s+$/i.test(part)) {
      content.append(document.createTextNode(part));
      continue;
    }
    appendMonsterAttackSegment(content, part, monster);
  }
  return content;
}

function createBackstabButton(character, attack) {
  const multiplier = getBackstabMultiplier(character);
  const backstabExpression = multiplyDamageDice(attack?.damageExpression, multiplier);
  if (!multiplier || !backstabExpression) {
    return null;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "damage-token backstab-roll-button";
  button.textContent = "B.stab";
  button.title = `Roll ${backstabExpression}`;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    applyDamageRoll({
      expression: backstabExpression,
      display: `${attack.name} Backstab x ${multiplier}`,
      context: `${attack.name} backstab ${backstabExpression}`
    }, `${character?.name || "Character"} backstab`);
  });
  return button;
}

function getAttackGearNote(character, attack) {
  const attackName = String(attack?.name || "").toLowerCase();
  const item = (Array.isArray(character?.gear) ? character.gear : []).find((candidate) => {
    const name = String(candidate?.name || "")
      .replace(/\s*\([^)]*\)\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return name && attackName.includes(name);
  });
  const note = String(item?.description || item?.detail || item?.notes || item?.note || "").trim();
  if (note) {
    return note;
  }
  return /\bcrossbow\b/.test(attackName) ? "skip move to reload, 2H" : "";
}

function getGearHoverNote(item) {
  const name = String(item?.name || "").toLowerCase();
  const note = String(item?.description || item?.detail || item?.notes || item?.note || "").trim();
  if (note) {
    return note;
  }
  return /\bcrossbow\b/.test(name) ? "skip move to reload, 2H" : "";
}

function appendCompactAttackDetail(target, attack, character) {
  const damageExpression = attack?.damageExpression || extractDamageReferences(attack?.detail || "")[0]?.expression || "";
  const gearNote = getAttackGearNote(character, attack);
  if (gearNote) {
    target.title = gearNote;
  }
  if (!damageExpression) {
    return;
  }
  target.append(document.createTextNode(", "));
  appendDamageAwareText(target, damageExpression, {
    sourceLabel: `${character?.name || "Character"} attack`,
    character
  });
}

function createAttackAwareLine(attackText, character) {
  if (isSpellCheckText(attackText)) {
    return createDamageAwareLine(formatTalentSpellTextForSheet(formatAttackForSheet(attackText)), {
      sourceLabel: `${character?.name || "Character"} spell`,
      spellCheck: true,
      character
    });
  }
  const attack = parseAttackText(attackText);
  if (!attack) {
    return document.createTextNode("");
  }
  const content = document.createElement("span");
  content.append(createAttackButton(character, attack));
  if (attack.flag) {
    content.append(document.createTextNode(attack.flag));
  }
  if (attack.bonusText) {
    content.append(document.createTextNode(` ${attack.bonusText}`));
  }
  if (attack.detail) {
    appendCompactAttackDetail(content, attack, character);
  }
  const backstabButton = createBackstabButton(character, attack);
  if (backstabButton) {
    content.append(document.createTextNode(", "));
    content.append(backstabButton);
  }
  return content;
}

function formatAbilityPair(character, key) {
  const score = character.stats?.[key] ?? 10;
  return `${score} / ${formatModifier(abilityScoreModifier(score))}`;
}

function getCharacterColorValue(character) {
  const match = CHARACTER_COLOR_PALETTE.find((color) => color.id === character?.colorId);
  return match?.value || CHARACTER_COLOR_PALETTE[0].value;
}

function shuffleCoordinates(coords) {
  const shuffled = coords.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function hasCharacterMapPosition(character) {
  return (
    character?.x !== null &&
    character?.x !== undefined &&
    character?.y !== null &&
    character?.y !== undefined &&
    Number.isFinite(Number(character.x)) &&
    Number.isFinite(Number(character.y))
  );
}

function clampInt(value, min, max, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return Math.max(min, Math.min(max, fallback));
  }
  return Math.max(min, Math.min(max, parsed));
}

function formatAttackForSheet(attackText) {
  return String(attackText || "").replace(/^ATTACKS?:\s*/i, "").trim();
}

function characterGearNames(character) {
  return (Array.isArray(character?.gear) ? character.gear : []).map((item) => String(item?.name || "").toLowerCase());
}

function characterHasGear(character, matcher) {
  return characterGearNames(character).some(matcher);
}

function characterHasTorch(character) {
  return characterHasGear(character, (name) => /^torch\b/.test(name));
}

function characterHasLantern(character) {
  return characterHasGear(character, (name) => /\blantern\b/.test(name));
}

function characterHasOil(character) {
  return characterHasGear(character, (name) => /\boil\b/.test(name));
}

function characterHasFlintAndSteel(character) {
  return characterHasGear(character, (name) => /flint\s*(?:and|&)?\s*steel/.test(name));
}

function getCharacterGearUnitsByMatcher(character, matcher) {
  return (Array.isArray(character?.gear) ? character.gear : []).reduce((total, item) => {
    const name = String(item?.name || "").toLowerCase();
    return matcher(name, item) ? total + getGearUnits(item) : total;
  }, 0);
}

function getStackGroupSize(name) {
  const normalized = String(name || "").toLowerCase();
  if (/arrows?|bolts?/.test(normalized)) return 20;
  if (/rations?/.test(normalized)) return 3;
  if (/(?:iron\s+)?spikes?/.test(normalized)) return 10;
  if (/torches?/.test(normalized)) return 1;
  return 1;
}

function isEquipmentPileStackable(name) {
  return /arrows?|bolts?/i.test(String(name || ""));
}

function getGearUnits(item) {
  const units = Number.isFinite(Number(item?.totalUnits)) && Number(item.totalUnits) > 0
    ? Math.floor(Number(item.totalUnits))
    : Number.isFinite(Number(item?.quantity)) && Number(item.quantity) > 0
      ? Math.floor(Number(item.quantity))
      : 1;
  return Math.max(0, units);
}

function inferGearItemSlots(name, item = {}) {
  const normalizedName = String(name || "").toLowerCase();
  const treasureKind = String(item?.treasureKind || item?.kind || "").toLowerCase();
  if (item?.treasureItem === true || treasureKind) {
    if (treasureKind === "herbs" || treasureKind === "clothing" || treasureKind === "jewels") {
      return 0;
    }
    if (treasureKind === "platemail") {
      return 3;
    }
    if (treasureKind === "chainmail") {
      return 2;
    }
    if (treasureKind === "leather") {
      return 1;
    }
  }
  if (/\bplate\s*(?:mail|armor)?\b/.test(normalizedName)) {
    return 3;
  }
  if (/(?:chainmail|bastard\s+sword|greatsword|greataxe)/.test(normalizedName)) {
    return 2;
  }
  return 1;
}

function getGearAmmoType(item) {
  const name = String(item?.name || "").toLowerCase();
  if (/arrow/.test(name) && !/bolt/.test(name)) return "arrows";
  if (/bolt/.test(name)) return "bolts";
  return "";
}

function characterHasWeaponForAmmo(character, ammoType) {
  const names = characterGearNames(character).join(" ");
  if (ammoType === "arrows") {
    return /\b(?:shortbow|longbow)\b/.test(names);
  }
  if (ammoType === "bolts") {
    return /\bcrossbow\b/.test(names);
  }
  return false;
}

function attackRequiresMissingAmmo(character, attackText) {
  const attackName = String(attackText || "").replace(/^ATTACKS?:\s*/i, "").split(":")[0].toLowerCase();
  const ammoType = /crossbow|bolt/.test(attackName)
    ? "bolts"
    : /shortbow|longbow|bow|arrow/.test(attackName)
      ? "arrows"
      : "";
  return Boolean(ammoType && getDisplayCharacterAmmo(character, ammoType) <= 0);
}

function getRenderableAttacks(character) {
  return (character?.attacks || []).filter((attackText) => !isAmmoOnlyAttackText(attackText) && !attackRequiresMissingAmmo(character, attackText));
}

function isAmmoOnlyAttackText(attackText) {
  const attack = parseAttackText(attackText);
  if (!attack) {
    return false;
  }
  return /^(?:arrows?|crossbow\s+bolts?|bolts?)$/i.test(String(attack.name || "").trim());
}

const WEAPON_PROFILES = [
  { key: "bastard sword", pattern: /\bbastard\s+sword\b/, damage: "1d8", versatileDamage: "1d10", ability: "STR" },
  { key: "greatsword", pattern: /\bgreatsword\b/, damage: "1d12", ability: "STR" },
  { key: "greataxe", pattern: /\bgreataxe\b/, damage: "1d8", versatileDamage: "1d10", ability: "STR" },
  { key: "greatclub", pattern: /\bgreatclub\b/, damage: "1d8", ability: "STR" },
  { key: "polearm", pattern: /\bpolearm\b/, damage: "1d10", ability: "STR" },
  { key: "halberd", pattern: /\bhalberd\b/, damage: "1d10", ability: "STR" },
  { key: "longsword", pattern: /\blongsword\b/, damage: "1d8", ability: "STR" },
  { key: "shortsword", pattern: /\bshortsword\b/, damage: "1d6", ability: "STR" },
  { key: "warhammer", pattern: /\bwarhammer\b/, damage: "1d10", ability: "STR" },
  { key: "mace", pattern: /\bmace\b/, damage: "1d6", ability: "STR" },
  { key: "club", pattern: /\bclub\b/, damage: "1d4", ability: "STR" },
  { key: "dagger", pattern: /\bdagger\b/, damage: "1d4", ability: "DEX" },
  { key: "staff", pattern: /\bstaff\b/, damage: "1d4", ability: "STR" },
  { key: "longbow", pattern: /\blongbow\b/, damage: "1d8", ability: "DEX", ammo: "arrows" },
  { key: "shortbow", pattern: /\bshortbow\b/, damage: "1d4", ability: "DEX", ammo: "arrows" },
  { key: "crossbow", pattern: /\bcrossbow\b/, damage: "1d6", ability: "DEX", ammo: "bolts" }
];

const ARMOR_PROFILES = [
  { key: "mithral chainmail", pattern: /\bmithral\s+chainmail\b/, ac: 13 },
  { key: "chainmail", pattern: /\bchainmail\b/, ac: 13 },
  { key: "plate", pattern: /\b(?:plate\s+mail|plate armor|plate)\b/, ac: 15 },
  { key: "half plate", pattern: /\bhalf\s+plate\b/, ac: 14 },
  { key: "leather", pattern: /\bleather(?:\s+armor)?\b/, ac: 11 }
];

function normalizeEquipmentName(value) {
  return String(value || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getGearItemName(item) {
  return String(item?.name || "").trim();
}

function getWeaponProfileFromText(value) {
  const normalized = normalizeEquipmentName(value);
  return WEAPON_PROFILES.find((profile) => profile.pattern.test(normalized)) || null;
}

function getWeaponProfile(item) {
  return getWeaponProfileFromText(getGearItemName(item));
}

function getArmorProfile(item) {
  const normalized = normalizeEquipmentName(getGearItemName(item));
  return ARMOR_PROFILES.find((profile) => profile.pattern.test(normalized)) || null;
}

function isShieldItem(item) {
  return /\bshield\b/i.test(getGearItemName(item));
}

function isWeaponItem(item) {
  return Boolean(getWeaponProfile(item));
}

function isArmorItem(item) {
  return Boolean(getArmorProfile(item));
}

function isVersatileWeaponItem(item) {
  const profile = getWeaponProfile(item);
  return Boolean(profile?.versatileDamage || /\bgreataxe\b/i.test(getGearItemName(item)) || /\(v\)|versatile|\/\s*\d*d\d+/i.test(`${item?.name || ""} ${item?.damage || ""}`));
}

function characterHasShield(character) {
  return (Array.isArray(character?.gear) ? character.gear : []).some(isShieldItem);
}

function characterHasVersatileWeapon(character) {
  return (Array.isArray(character?.gear) ? character.gear : []).some(isVersatileWeaponItem);
}

function shouldReadyShield(character) {
  if (!characterHasShield(character)) {
    return false;
  }
  return !characterHasVersatileWeapon(character) || character?.shieldReadied !== false;
}

function normalizeArmorMasteryTarget(value) {
  const normalized = String(value || "").toLowerCase();
  if (/\bshield/.test(normalized)) {
    return "shield";
  }
  if (/\bleather/.test(normalized)) {
    return "leather";
  }
  if (/\bchainmail/.test(normalized)) {
    return "chainmail";
  }
  if (/\bplate/.test(normalized)) {
    return "plate";
  }
  return "";
}

function getArmorMasteryTarget(character) {
  const lines = [
    ...(Array.isArray(character?.levels) ? character.levels : []).map((level) => `${level?.talentRolledName || ""}: ${level?.talentRolledDesc || ""}`),
    ...(Array.isArray(character?.bonuses) ? character.bonuses : []).map((bonus) => `${bonus?.bonusName || bonus?.name || ""}: ${bonus?.bonusTo || ""}`),
    ...(Array.isArray(character?.raw?.levels) ? character.raw.levels : []).map((level) => `${level?.talentRolledName || ""}: ${level?.talentRolledDesc || ""}`),
    ...(Array.isArray(character?.raw?.bonuses) ? character.raw.bonuses : []).map((bonus) => `${bonus?.bonusName || bonus?.name || ""}: ${bonus?.bonusTo || ""}`)
  ];
  const explicit = lines.find((line) => /armor mastery/i.test(line) && !/choose one kind/i.test(line));
  return normalizeArmorMasteryTarget(explicit);
}

function getCharacterTalentSearchLines(character) {
  return [
    ...(Array.isArray(character?.levels) ? character.levels : []).map((level) => `${level?.talentRolledName || ""}: ${level?.talentRolledDesc || ""}`),
    ...(Array.isArray(character?.bonuses) ? character.bonuses : []).map((bonus) => `${bonus?.bonusName || bonus?.name || ""}: ${bonus?.bonusTo || ""}`),
    ...(Array.isArray(character?.raw?.levels) ? character.raw.levels : []).map((level) => `${level?.talentRolledName || ""}: ${level?.talentRolledDesc || ""}`),
    ...(Array.isArray(character?.raw?.bonuses) ? character.raw.bonuses : []).map((bonus) => `${bonus?.bonusName || bonus?.name || ""}: ${bonus?.bonusTo || ""}`)
  ];
}

function characterHasFighterMeleeRangedTalent(character) {
  if (!/\bfighter\b/.test(getCharacterClassKey(character))) {
    return false;
  }
  return getCharacterTalentSearchLines(character).some((line) => /melee\s+and\s+ranged\s+attacks/i.test(line));
}

function normalizeWeaponMasteryTarget(value) {
  const profile = getWeaponProfileFromText(value);
  return profile?.key || "";
}

function getWeaponMasteryTarget(character) {
  const normalizedTalentLines = buildTalentSpellLines(character).map(formatTalentSpellTextForSheet);
  for (const line of [...getCharacterTalentSearchLines(character), ...normalizedTalentLines]) {
    if (
      !/mastery/i.test(line) ||
      /armor\s*mastery/i.test(line) ||
      /choose one weapon/i.test(line)
    ) {
      continue;
    }
    const target = normalizeWeaponMasteryTarget(line);
    if (target) {
      return target;
    }
  }
  return "";
}

function getCharacterClassKey(character) {
  return String(character?.className || character?.class || "").toLowerCase();
}

function canUseWeapon(character, itemOrName) {
  const profile = typeof itemOrName === "string" ? getWeaponProfileFromText(itemOrName) : getWeaponProfile(itemOrName);
  if (!profile) {
    return false;
  }
  const classKey = getCharacterClassKey(character);
  if (/\bfighter\b/.test(classKey)) {
    return true;
  }
  if (/\bwizard\b/.test(classKey)) {
    return profile.key === "dagger" || profile.key === "staff";
  }
  if (/\bthief\b/.test(classKey)) {
    return ["club", "crossbow", "shortsword", "dagger", "shortbow"].includes(profile.key);
  }
  if (/\bpriest\b/.test(classKey)) {
    return ["club", "crossbow", "dagger", "mace", "longsword", "staff", "warhammer"].includes(profile.key);
  }
  return true;
}

function canUseArmor(character, item) {
  const profile = getArmorProfile(item);
  if (!profile) {
    return false;
  }
  const classKey = getCharacterClassKey(character);
  if (/\bwizard\b/.test(classKey)) {
    return false;
  }
  if (/\bthief\b/.test(classKey)) {
    return profile.key === "leather" || profile.key === "mithral chainmail";
  }
  return true;
}

function canUseShield(character) {
  return !/\b(?:wizard|thief)\b/.test(getCharacterClassKey(character));
}

function ensureEquipmentBaseline(character) {
  if (!character) {
    return;
  }
  const raw = character.raw || {};
  const currentAttacks = Array.isArray(character.attacks) ? character.attacks : [];
  const rawBaseAttacks = Array.isArray(raw.baseAttacks) ? raw.baseAttacks : null;
  const characterBaseAttacks = Array.isArray(character.baseAttacks) ? character.baseAttacks : null;
  const baseAttacks = rawBaseAttacks || characterBaseAttacks || currentAttacks;
  character.baseAttacks = JSON.parse(JSON.stringify(baseAttacks));
  character.baseArmorClass = Number.isFinite(Number(character.baseArmorClass))
    ? Number(character.baseArmorClass)
    : Number.isFinite(Number(raw.baseArmorClass))
      ? Number(raw.baseArmorClass)
      : Number.isFinite(Number(character.armorClass))
        ? Number(character.armorClass)
        : 10;
  character.raw = raw;
  character.raw.baseAttacks = JSON.parse(JSON.stringify(character.baseAttacks));
  character.raw.baseArmorClass = character.baseArmorClass;
  character.raw.shieldReadied = character.shieldReadied !== false;
}

function getWeaponDisplayName(item, profile) {
  const rawName = getGearItemName(item);
  if (rawName) {
    return rawName.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  }
  return prettifyAttackName(profile?.key || "Weapon");
}

function getWeaponDamageExpression(character, item, profile) {
  const explicitDamage = String(item?.damage || item?.damageExpression || "").trim();
  if (explicitDamage && !profile?.versatileDamage) {
    return explicitDamage;
  }
  if (profile?.versatileDamage) {
    return shouldReadyShield(character) ? profile.damage : profile.versatileDamage;
  }
  return explicitDamage || profile?.damage || "1d4";
}

function addDamageBonus(damageExpression, bonus) {
  const amount = Number(bonus) || 0;
  if (!amount) {
    return damageExpression;
  }
  const source = String(damageExpression || "").trim();
  if (!source) {
    return source;
  }
  const match = source.match(/^(.*?)([+-]\d+)?$/);
  const base = match?.[1] || source;
  const currentBonus = Number.parseInt(match?.[2] || "0", 10) || 0;
  return `${base}${formatModifier(currentBonus + amount)}`;
}

function buildWeaponAttackText(character, item) {
  const profile = getWeaponProfile(item);
  if (!profile || !canUseWeapon(character, item)) {
    return "";
  }
  const baseBonus = Number.isFinite(Number(item?.attackBonus))
    ? Number(item.attackBonus)
    : abilityScoreModifier(character?.stats?.[profile.ability || "STR"]);
  const masteryApplies = getWeaponMasteryTarget(character) === profile.key;
  const bonus = baseBonus
    + (characterHasFighterMeleeRangedTalent(character) ? 1 : 0)
    + (masteryApplies ? 1 : 0);
  const damage = masteryApplies
    ? addDamageBonus(getWeaponDamageExpression(character, item, profile), 1)
    : getWeaponDamageExpression(character, item, profile);
  const flag = profile.versatileDamage ? " (V)" : "";
  return `${getWeaponDisplayName(item, profile)}${flag}: ${formatModifier(bonus)}, ${damage}`;
}

function getAttackWeaponProfile(attackText) {
  const attack = parseAttackText(attackText);
  return attack ? getWeaponProfileFromText(attack.name) : null;
}

function characterCarriesWeapon(character, profile) {
  return (Array.isArray(character?.gear) ? character.gear : [])
    .some((item) => getWeaponProfile(item)?.key === profile?.key);
}

function mergeUniqueAttack(attacks, attackText) {
  if (!attackText) {
    return;
  }
  const attack = parseAttackText(attackText);
  const key = attack ? `${attack.name.toLowerCase()}|${attack.flag || ""}` : String(attackText).toLowerCase();
  const exists = attacks.some((candidate) => {
    const parsed = parseAttackText(candidate);
    const candidateKey = parsed ? `${parsed.name.toLowerCase()}|${parsed.flag || ""}` : String(candidate).toLowerCase();
    return candidateKey === key;
  });
  if (!exists) {
    attacks.push(attackText);
  }
}

function rebuildCharacterAttacks(character) {
  ensureEquipmentBaseline(character);
  const nextAttacks = [];
  for (const attackText of character.baseAttacks || []) {
    const profile = getAttackWeaponProfile(attackText);
    if (!profile) {
      if (!isBackstabAttackText(attackText)) {
        mergeUniqueAttack(nextAttacks, attackText);
      }
      continue;
    }
    if (characterCarriesWeapon(character, profile) && canUseWeapon(character, profile.key)) {
      const gearItem = (character.gear || []).find((item) => getWeaponProfile(item)?.key === profile.key);
      mergeUniqueAttack(nextAttacks, gearItem ? buildWeaponAttackText(character, gearItem) : attackText);
    }
  }
  for (const item of character.gear || []) {
    if (isWeaponItem(item) && canUseWeapon(character, item)) {
      mergeUniqueAttack(nextAttacks, buildWeaponAttackText(character, item));
    }
  }
  character.attacks = nextAttacks;
  character.raw.attacks = JSON.parse(JSON.stringify(nextAttacks));
}

function rebuildCharacterArmorClass(character) {
  ensureEquipmentBaseline(character);
  const dexModifier = abilityScoreModifier(character?.stats?.DEX);
  let armorClass = 10 + dexModifier;
  let armorMasteryApplies = false;
  const masteryTarget = getArmorMasteryTarget(character);
  for (const item of character.gear || []) {
    if (!isArmorItem(item) || !canUseArmor(character, item)) {
      continue;
    }
    const explicit = Number(item?.armorClass ?? item?.ac);
    const profile = getArmorProfile(item);
    const armorDex = profile?.key === "plate" ? 0 : dexModifier;
    const itemAc = (Number.isFinite(explicit) ? explicit : profile?.ac || 10) + armorDex;
    if (itemAc > armorClass) {
      armorClass = itemAc;
      armorMasteryApplies = masteryTarget && masteryTarget === profile?.key;
    }
  }
  if (characterHasShield(character) && canUseShield(character) && shouldReadyShield(character)) {
    armorClass += 2;
    if (masteryTarget === "shield") {
      armorClass += 1;
    }
  } else if (armorMasteryApplies) {
    armorClass += 1;
  }
  character.armorClass = Math.max(0, Math.min(99, armorClass));
  character.raw.armorClass = character.armorClass;
  character.raw.ac = character.armorClass;
  character.raw.shieldReadied = character.shieldReadied !== false;
}

function syncCharacterEquipmentDerivedStats(character) {
  if (!character) {
    return;
  }
  if (!characterHasShield(character) || !characterHasVersatileWeapon(character)) {
    character.shieldReadied = true;
  }
  rebuildCharacterAttacks(character);
  rebuildCharacterArmorClass(character);
}

function syncAllCharacterEquipmentDerivedStats() {
  if (!state?.characters?.length) {
    return;
  }
  for (const character of state.characters) {
    clearInvalidCharacterLight(character);
    syncCharacterEquipmentDerivedStats(character);
  }
}

function setCharacterLight(character, source) {
  if (!character) {
    return;
  }
  character.lightHidden = false;
  if (source === "light-spell") {
    character.lightSource = "light-spell";
    character.lightRadius = DEFAULT_LIGHT_RADIUS;
    character.raw = character.raw || {};
    character.raw.lightSource = character.lightSource;
    character.raw.lightRadius = character.lightRadius;
    character.raw.lightHidden = false;
    return;
  }
  if (source === "lantern") {
    character.lightSource = "lantern";
    character.lightRadius = 12;
    character.raw = character.raw || {};
    character.raw.lightSource = character.lightSource;
    character.raw.lightRadius = character.lightRadius;
    character.raw.lightHidden = false;
    return;
  }
  if (source === "torch") {
    character.lightSource = "torch";
    character.lightRadius = DEFAULT_LIGHT_RADIUS;
    character.raw = character.raw || {};
    character.raw.lightSource = character.lightSource;
    character.raw.lightRadius = character.lightRadius;
    character.raw.lightHidden = false;
    return;
  }
  character.lightSource = "";
  character.lightRadius = 0;
  character.raw = character.raw || {};
  character.raw.lightSource = "";
  character.raw.lightRadius = 0;
  character.raw.lightHidden = false;
}

function hideCharacterLight(character) {
  if (!character?.lightSource) {
    return;
  }
  character.lightRadius = 0;
  character.lightHidden = true;
  character.raw = character.raw || {};
  character.raw.lightSource = character.lightSource;
  character.raw.lightRadius = 0;
  character.raw.lightHidden = true;
}

function initializeImportedCharacterLight(character, index) {
  if (!character || Number(index) !== 0 || character.lightSource) {
    return;
  }
  if (characterHasLantern(character) && characterHasOil(character)) {
    setCharacterLight(character, "lantern");
    return;
  }
  if (characterHasTorch(character)) {
    setCharacterLight(character, "torch");
  }
}

function syncPlayerLightFromActiveCharacter() {
  const active = getActiveCharacter(state);
  const radius = Number(active?.lightRadius) || 0;
  state.player.lightSource = active?.lightSource || "";
  state.player.lightRadius = radius || DEFAULT_LIGHT_RADIUS;
  state.player.torchLit = radius > 0;
}

function syncActiveCharacterLightFromPlayer() {
  const active = getActiveCharacter(state);
  if (!active) {
    return;
  }
  if (!state.player.torchLit) {
    if (state.player.lightSource === "lantern" && active.lightSource === "lantern") {
      hideCharacterLight(active);
      return;
    }
    setCharacterLight(active, "");
    return;
  }
  if (state.player.lightSource === "lantern") {
    setCharacterLight(active, "lantern");
    return;
  }
  if (state.player.lightSource === "light-spell") {
    setCharacterLight(active, "light-spell");
    return;
  }
  setCharacterLight(active, "torch");
}

function lightActiveCharacter(source) {
  const active = getActiveCharacter(state);
  lightNewTorch(state);
  state.player.lightSource = source === "lantern" ? "lantern" : source === "light-spell" ? "light-spell" : "torch";
  state.player.lightRadius = source === "lantern" ? 12 : DEFAULT_LIGHT_RADIUS;
  if (active) {
    setCharacterLight(active, state.player.lightSource);
  }
}

function clearActiveCharacterLight() {
  forceTorchOut(state);
  state.player.lightSource = "";
  state.player.lightRadius = DEFAULT_LIGHT_RADIUS;
  syncActiveCharacterLightFromPlayer();
}

function snuffActiveTorch() {
  const active = getActiveCharacter(state);
  if (!active) {
    return false;
  }
  removeOneTorch(active);
  setCharacterLight(active, "");
  forceTorchOut(state);
  state.player.lightSource = "";
  state.player.lightRadius = DEFAULT_LIGHT_RADIUS;
  normalizeCharacterState(state);
  applyCharacterAmmoOverrides();
  syncAllCharacterEquipmentDerivedStats();
  applyCharacterColorOverrides();
  ensureCharacterPresentation();
  recomputeVisibility(state);
  markRunDirty();
  return true;
}

function extinguishActiveLantern() {
  const active = getActiveCharacter(state);
  if (!active) {
    return false;
  }
  setCharacterLight(active, "");
  forceTorchOut(state);
  state.player.lightSource = "";
  state.player.lightRadius = DEFAULT_LIGHT_RADIUS;
  recomputeVisibility(state);
  markRunDirty();
  return true;
}

function hideActiveLantern() {
  const active = getActiveCharacter(state);
  if (!active || active.lightSource !== "lantern") {
    return false;
  }
  hideCharacterLight(active);
  forceTorchOut(state);
  state.player.lightSource = "lantern";
  state.player.lightRadius = 12;
  recomputeVisibility(state);
  markRunDirty();
  return true;
}

function revealActiveLantern() {
  const active = getActiveCharacter(state);
  if (!active || active.lightSource !== "lantern" || active.lightHidden !== true) {
    return false;
  }
  active.lightRadius = 12;
  active.lightHidden = false;
  active.raw = active.raw || {};
  active.raw.lightSource = "lantern";
  active.raw.lightRadius = 12;
  active.raw.lightHidden = false;
  if (active.id === state.activeCharacterId) {
    syncPlayerLightFromActiveCharacter();
  }
  recomputeVisibility(state);
  markRunDirty();
  return true;
}

function hasAnyVisibleLightSource() {
  if (!state) {
    return false;
  }
  if ((state.characters || []).some((character) => Number(character?.lightRadius) > 0)) {
    return true;
  }
  if (state.player?.torchLit === true) {
    return true;
  }
  return (state.entities || []).some((entity) => (
    entity.subtype === "dropped-equipment" &&
    entity.collected !== true &&
    entity.visible !== false &&
    Number(entity.lightRadius) > 0
  ));
}

function expireActiveLightFromTimer() {
  const active = getActiveCharacter(state);
  const source = active?.lightSource || state.player.lightSource || "torch";
  if (source === "torch") {
    snuffActiveTorch();
    return "Torch snuffed!";
  }
  if (source === "lantern") {
    extinguishActiveLantern();
    return "Lantern went out!";
  }
  if (source === "light-spell") {
    setCharacterLight(active, "");
    state.player.lightSource = "";
    state.player.lightRadius = DEFAULT_LIGHT_RADIUS;
    forceTorchOut(state);
    recomputeVisibility(state);
    markRunDirty();
    return "Light spell faded.";
  }
  clearActiveCharacterLight();
  return "Light went out!";
}

function getGearDisplayName(item) {
  const name = String(item?.name || "Gear").trim() || "Gear";
  const units = Number.isFinite(Number(item?.totalUnits)) && Number(item.totalUnits) > 0
    ? Math.floor(Number(item.totalUnits))
    : Number.isFinite(Number(item?.quantity)) && Number(item.quantity) > 0
      ? Math.floor(Number(item.quantity))
      : 1;
  return units > 1 ? `${name} x${units}` : name;
}

function isLightGearItem(item, source = "") {
  const name = String(item?.name || "").toLowerCase();
  if (source === "torch") {
    return /^torch\b/.test(name);
  }
  if (source === "lantern") {
    return /\blantern\b/.test(name);
  }
  return /^torch\b/.test(name) || /\blantern\b/.test(name);
}

function markRunDirty() {
  if (state?.run) {
    state.run.dirty = true;
  }
}

function findEquipmentDropTile(character) {
  if (hasCharacterMapPosition(character)) {
    return {
      x: Number(character.x),
      y: Number(character.y),
      roomId: character.roomId ?? getTileAt(Number(character.x), Number(character.y))?.roomId ?? null
    };
  }
  const origin = hasCharacterMapPosition(character)
    ? { x: Number(character.x), y: Number(character.y) }
    : { x: Number(state.player.x), y: Number(state.player.y) };
  const occupied = new Set((state.characters || [])
    .filter((candidate) => candidate.id !== character?.id && hasCharacterMapPosition(candidate))
    .map((candidate) => `${candidate.x},${candidate.y}`));
  return findOpenCharacterTile(origin.x, origin.y, occupied);
}

function getPileUnits(item) {
  return Math.min(1000, Math.max(1, getGearUnits(item)));
}

function setGearItemUnits(item, units) {
  const nextUnits = Math.max(0, Math.floor(Number(units) || 0));
  if (Object.prototype.hasOwnProperty.call(item, "totalUnits")) {
    item.totalUnits = nextUnits;
  }
  item.quantity = nextUnits;
}

function removeOneGearUnit(character, matcher) {
  if (!character || !Array.isArray(character.gear)) {
    return null;
  }
  const index = character.gear.findIndex((item) => matcher(String(item?.name || "").toLowerCase(), item));
  if (index === -1) {
    return null;
  }
  const item = character.gear[index];
  const removedItem = JSON.parse(JSON.stringify(item));
  const units = getGearUnits(item);
  setGearItemUnits(removedItem, 1);
  if (units > 1) {
    setGearItemUnits(item, units - 1);
  } else {
    character.gear.splice(index, 1);
  }
  return removedItem;
}

function removeOneOil(character) {
  return removeOneGearUnit(character, (name) => /\boil\b/.test(name));
}

function removeOneTorch(character) {
  return removeOneGearUnit(character, (name) => /^torch\b/.test(name));
}

function getLitGearIndex(character, source = character?.lightSource) {
  if (!character || !source || !Array.isArray(character.gear)) {
    return -1;
  }
  if (source === "torch") {
    return character.gear.findIndex((item) => /^torch\b/i.test(String(item?.name || "")));
  }
  if (source === "lantern") {
    return character.gear.findIndex((item) => /\blantern\b/i.test(String(item?.name || "")));
  }
  return -1;
}

function updateCharacterAmmoFromGearItem(character, item) {
  const ammoType = getGearAmmoType(item);
  if (!ammoType) {
    return;
  }
  const total = (Array.isArray(character?.gear) ? character.gear : [])
    .filter((candidate) => getGearAmmoType(candidate) === ammoType)
    .reduce((sum, candidate) => sum + getGearUnits(candidate), 0);
  setCharacterAmmo(character, ammoType, total);
  const key = getCharacterAmmoOverrideKey(character, ammoType);
  if (key) {
    characterAmmoOverrides.set(key, total);
  }
}

function findExistingGearStack(character, item) {
  const groupSize = getStackGroupSize(item?.name);
  if (groupSize <= 1) {
    return null;
  }
  const name = String(item?.name || "").toLowerCase();
  return (character.gear || []).find((candidate) => String(candidate?.name || "").toLowerCase() === name) || null;
}

function getPickupSlotCost(character, item) {
  const groupSize = getStackGroupSize(item?.name);
  const units = getPileUnits(item);
  if (groupSize <= 1) {
    return units * inferGearItemSlots(item?.name, item);
  }
  const existing = findExistingGearStack(character, item);
  const currentUnits = existing ? getGearUnits(existing) : 0;
  return Math.max(0, Math.ceil((currentUnits + units) / groupSize) - Math.ceil(currentUnits / groupSize));
}

function findMergeableDroppedPile(item, tile) {
  if (!isEquipmentPileStackable(item?.name)) {
    return null;
  }
  const name = String(item?.name || "").toLowerCase();
  return state.entities.find((entity) => (
    entity.subtype === "dropped-equipment" &&
    !entity.collected &&
    entity.x === tile.x &&
    entity.y === tile.y &&
    String(entity.gearItem?.name || "").toLowerCase() === name &&
    isEquipmentPileStackable(entity.gearItem?.name) &&
    getGearUnits(entity.gearItem) < getStackGroupSize(entity.gearItem?.name)
  )) || null;
}

function createDroppedGearEntity(item, tile, litSource = "") {
  const units = getPileUnits(item);
  const droppedItem = JSON.parse(JSON.stringify(item));
  setGearItemUnits(droppedItem, units);
  const corpseLoot = droppedItem.corpseLoot === true;
  const worthlessLoot = droppedItem.worthlessLoot === true || corpseLoot;
  const entity = {
    id: `gear-drop-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type: "treasure",
    subtype: "dropped-equipment",
    kind: "equipment",
    name: getGearDisplayName(droppedItem),
    x: tile.x,
    y: tile.y,
    roomId: tile.roomId,
    visible: true,
    revealed: true,
    collected: false,
    value: 0,
    slots: Math.max(1, Math.ceil(units / getStackGroupSize(droppedItem.name))),
    bonusSlots: 0,
    priceless: false,
    description: "Dropped equipment.",
    gearItem: droppedItem,
    worthlessLoot,
    corpseLoot,
    monsterName: droppedItem.monsterName || ""
  };
  if (litSource === "torch" || litSource === "lantern") {
    entity.lightSource = litSource;
    entity.lightRadius = litSource === "lantern" ? 12 : DEFAULT_LIGHT_RADIUS;
  }
  return entity;
}

function addDroppedGearPile(item, tile, litSource = "") {
  const groupSize = getStackGroupSize(item?.name);
  const mergeable = isEquipmentPileStackable(item?.name) ? findMergeableDroppedPile(item, tile) : null;
  if (mergeable) {
    const nextUnits = Math.min(groupSize, getGearUnits(mergeable.gearItem) + getPileUnits(item));
    setGearItemUnits(mergeable.gearItem, nextUnits);
    mergeable.name = getGearDisplayName(mergeable.gearItem);
    mergeable.slots = Math.max(1, Math.ceil(nextUnits / groupSize));
    if (litSource === "torch" || litSource === "lantern") {
      mergeable.lightSource = litSource;
      mergeable.lightRadius = litSource === "lantern" ? 12 : DEFAULT_LIGHT_RADIUS;
    }
    return mergeable;
  }
  const entity = createDroppedGearEntity(item, tile, litSource);
  state.entities.push(entity);
  return entity;
}

function dropCharacterGear(character, gearIndex) {
  if (!character || !Array.isArray(character.gear)) {
    return { message: "No character gear to drop." };
  }
  const index = Number.parseInt(gearIndex, 10);
  if (!Number.isInteger(index) || index < 0 || index >= character.gear.length) {
    return { message: "Gear item not found." };
  }
  const item = character.gear[index];
  const itemName = String(item?.name || "Gear").trim() || "Gear";
  const originalUnits = getGearUnits(item);
  const droppedItem = JSON.parse(JSON.stringify(item));
  const dropsOneUnitAtATime = originalUnits > 1;
  const activeLight = character.lightSource || state.player.lightSource || "";
  const litSource = index === getLitGearIndex(character, activeLight) && Number(character.lightRadius) > 0 && isLightGearItem(item, activeLight)
    ? activeLight
    : "";
  const dropUnits = dropsOneUnitAtATime ? 1 : Math.max(1, originalUnits);
  if (dropsOneUnitAtATime) {
    setGearItemUnits(item, originalUnits - 1);
  } else {
    character.gear.splice(index, 1);
  }
  setGearItemUnits(droppedItem, dropUnits);
  if (litSource) {
    setCharacterLight(character, "");
    syncPlayerLightFromActiveCharacter();
  }
  const tile = findEquipmentDropTile(character);
  addDroppedGearPile(droppedItem, tile, litSource);
  updateCharacterAmmoFromGearItem(character, droppedItem);
  normalizeCharacterState(state);
  syncAllCharacterEquipmentDerivedStats();
  applyCharacterColorOverrides();
  ensureCharacterPresentation();
  syncPlayerLightFromActiveCharacter();
  recomputeVisibility(state);
  markRunDirty();
  return { message: `${character.name || "Character"} drops ${getGearDisplayName(droppedItem)}.` };
}

function pickupDroppedEquipment(entity) {
  const character = getActiveCharacter(state);
  if (!character) {
    return { message: "Select a character to pick up equipment." };
  }
  const item = entity?.gearItem;
  if (!item) {
    return { message: "Dropped equipment is missing item data." };
  }
  const itemSlots = getPickupSlotCost(character, item);
  if (getCharacterGearFreeSlots(character) < itemSlots) {
    return { noFreeSlots: true, message: "No free slots." };
  }
  character.gear = Array.isArray(character.gear) ? character.gear : [];
  const existing = findExistingGearStack(character, item);
  if (existing) {
    setGearItemUnits(existing, getGearUnits(existing) + getPileUnits(item));
  } else {
    const pickupItem = JSON.parse(JSON.stringify(item));
    setGearItemUnits(pickupItem, getPileUnits(item));
    character.gear.push(pickupItem);
  }
  const pickedUpLightSource = entity.lightSource === "torch" || entity.lightSource === "lantern" ? entity.lightSource : "";
  if (pickedUpLightSource) {
    setCharacterLight(character, pickedUpLightSource);
    if (character.id === state.activeCharacterId) {
      syncPlayerLightFromActiveCharacter();
    }
  }
  updateCharacterAmmoFromGearItem(character, item);
  entity.collected = true;
  delete entity.lightSource;
  delete entity.lightRadius;
  normalizeCharacterState(state);
  syncAllCharacterEquipmentDerivedStats();
  applyCharacterColorOverrides();
  ensureCharacterPresentation();
  syncPlayerLightFromActiveCharacter();
  recomputeVisibility(state);
  markRunDirty();
  return { message: `${character.name || "Character"} picks up ${getGearDisplayName(item)}.` };
}

function canLightLantern(character) {
  if (!characterHasLantern(character) || !characterHasFlintAndSteel(character)) {
    return false;
  }
  if (character?.lightSource === "lantern" && character.lightHidden === true) {
    return false;
  }
  return characterHasOil(character);
}

function canLightTorch(character) {
  if (!characterHasFlintAndSteel(character)) {
    return false;
  }
  const torchUnits = getCharacterGearUnitsByMatcher(character, (name) => /^torch\b/.test(name));
  const litTorchUnits = character?.lightSource === "torch" ? 1 : 0;
  return torchUnits > litTorchUnits;
}

function getExplicitActiveCharacter(stateValue = state) {
  if (!stateValue?.activeCharacterId) {
    return null;
  }
  return stateValue.characters?.find((character) => character.id === stateValue.activeCharacterId) || null;
}

function characterHasLightSpell(character) {
  const text = [
    character?.spellsKnown || "",
    ...(Array.isArray(character?.levels) ? character.levels : []).map((level) => `${level?.talentRolledName || ""} ${level?.talentRolledDesc || ""}`),
    ...(Array.isArray(character?.bonuses) ? character.bonuses : []).map((bonus) => `${bonus?.bonusName || bonus?.name || ""} ${bonus?.bonusTo || ""}`)
  ].join(" ");
  return /\blight\b/i.test(text);
}

function canCastLightSpell(character) {
  return characterHasLightSpell(character) && !isCharacterSpellFailed(character, "Light");
}

function clearInvalidCharacterLight(character) {
  if (!character?.lightSource) {
    return;
  }
  if (character.lightSource === "torch" && !characterHasTorch(character)) {
    setCharacterLight(character, "");
  } else if (character.lightSource === "lantern" && !characterHasLantern(character)) {
    setCharacterLight(character, "");
  } else if (character.lightSource === "light-spell" && !characterHasLightSpell(character)) {
    setCharacterLight(character, "");
  }
}

function createLightSourceMarker(source) {
  const marker = document.createElement("span");
  marker.className = ["light-source-marker", `light-source-marker--${source || "torch"}`].join(" ");
  marker.setAttribute("aria-hidden", "true");
  return marker;
}

function createCharacterLightNote(character) {
  if (!character?.lightSource || !Number(character.lightRadius)) {
    return null;
  }
  const source = character.lightSource;
  const note = document.createElement("span");
  note.className = "character-light-note";
  const rangeText = source === "lantern" ? "2 x Near" : "Near";
  note.append(document.createTextNode(`${getLightSourceLabel(source)} (${rangeText}) `), createLightSourceMarker(source));
  return note;
}

function clearMagicLightIfIncapacitated(character) {
  if (!character || character.lightSource !== "light-spell" || Number(character.hp) > 0) {
    return;
  }
  setCharacterLight(character, "");
  if (state?.activeCharacterId === character.id) {
    syncPlayerLightFromActiveCharacter();
    recomputeVisibility(state);
  }
}

function getLightSourceLabel(source) {
  if (source === "lantern") {
    return "Lantern";
  }
  if (source === "light-spell") {
    return "Light Spell";
  }
  return "Torch";
}

function updateLightControlUi() {
  const active = getExplicitActiveCharacter(state);
  if (!active) {
    if (state?.characters?.length) {
      if (ui.torchOutBtn) ui.torchOutBtn.hidden = true;
      if (ui.lightTorchBtn) ui.lightTorchBtn.hidden = true;
      if (ui.lightLanternBtn) ui.lightLanternBtn.hidden = true;
      if (ui.castLightBtn) ui.castLightBtn.hidden = true;
      if (ui.torchBtn) ui.torchBtn.hidden = true;
      return;
    }
    if (ui.torchOutBtn) {
      ui.torchOutBtn.hidden = false;
      ui.torchOutBtn.textContent = "Torch snuffed!";
    }
    if (ui.lightTorchBtn) ui.lightTorchBtn.hidden = false;
    if (ui.lightLanternBtn) ui.lightLanternBtn.hidden = false;
    if (ui.castLightBtn) ui.castLightBtn.hidden = false;
    if (ui.torchBtn) {
      ui.torchBtn.hidden = false;
      ui.torchBtn.textContent = "Hide Lantern";
    }
    return;
  }
  clearInvalidCharacterLight(active);
  syncPlayerLightFromActiveCharacter();
  const activeSource = active?.lightSource || "";
  const activeIsLit = Number(active?.lightRadius) > 0;
  const activeLanternHidden = activeSource === "lantern" && active?.lightHidden === true;
  if (ui.lightTorchBtn) {
    ui.lightTorchBtn.hidden = !canLightTorch(active);
  }
  if (ui.lightLanternBtn) {
    ui.lightLanternBtn.hidden = !canLightLantern(active);
  }
  if (ui.castLightBtn) {
    ui.castLightBtn.hidden = !canCastLightSpell(active);
  }
  if (ui.torchOutBtn) {
    ui.torchOutBtn.hidden = !(activeSource === "torch" || activeSource === "lantern");
    ui.torchOutBtn.textContent = activeSource === "lantern" ? "Lantern went out!" : "Torch snuffed!";
  }
  if (ui.torchBtn) {
    ui.torchBtn.hidden = !(activeSource === "lantern" && (activeIsLit || activeLanternHidden)) && !(activeSource === "light-spell" && activeIsLit);
    ui.torchBtn.textContent = activeLanternHidden ? "Reveal Lantern" : activeSource === "lantern" ? "Hide Lantern" : "Hide Light";
  }
}

function formatTalentSpellTextForSheet(text) {
  return String(text || "")
    .replace(/^Thief\s+\d+:\s+Thief\s+\d+:\s+/i, "Thief 1: ")
    .replace(/^Fighter\s+(\d+):\s*(Longbow|Shortbow|Crossbow|Dagger|Shortsword|Longsword|Bastard Sword|Greatsword|Greataxe|Mace|Club|Staff|Warhammer)\s*$/i, "Fighter $1: Mastery: $2 +1 atk/dmg")
    .replace(/^(\w+\s+\d+):\s*([^:]+):\s*Mastery\s*$/i, "$1: Mastery: $2 +1 atk/dmg")
    .replace(/^Fighter\s+(\d+):\s*Armor Mastery:\s*Shield\s*$/i, "Fighter $1: Armor Mastery: +1 AC from Shields")
    .replace(/^Fighter\s+(\d+):\s*Armor Mastery:\s*(Leather(?: armor)?|Chainmail|Plate(?:mail| armor)?)\s*$/i, "Fighter $1: Armor Mastery: +1 AC from $2")
    .replace(/^(\w+\s+\d+):\s*Melee and ranged attacks\s*$/i, "$1: +1 to melee and ranged attacks")
    .replace(/^((?:Priest|Human Ambition)\s*\d*):\s*Ranged attacks\s*$/i, "$1: +1 to hit with Ranged")
    .replace(/^Elf:\s*Attack Bonus:\s*RangedWeapons\s*$/i, "Elf: +1 to hit with Ranged")
    .replace(/^(\w+\s+\d+):\s*([^:]+):\s*AdvOnCastOneSpell\s*$/i, "$1: Cast $2 at advantage")
    .replace(
      /\bBackstab Increase:\s*Your Backstab deals \+1 dice of damage\.?/gi,
      "Backstab Increase: +1 dice of damage."
    )
    .replace(/\bAdvantageOnStatChecks\b/g, "Advantage")
    .replace(
      /\bWizard spell,\s*roll\s+1d20\s*\+\s*\[?int mod\]?\s+vs\.?\s+a\s+DC\s+equal\s+to\s+10\s*\+\s*the\s+spell'?s\s+tier\.?/gi,
      "Wizard spell, 1d20+[int mod] DC = 10 + Tier."
    )
    .replace(
      /\bTo cast a Priest spell,\s*roll\s+1d20\s*\+\s*\[?wis mod\]?\s+vs\.?\s+a\s+DC\s+equal\s+to\s+10\s*\+\s*the\s+spell'?s\s+tier\.?/gi,
      "Priest spell, 1d20+[wis mod] DC = 10 + Tier."
    )
    .replace(
      /\bPriest spell,\s*roll\s+1d20\s*\+\s*\[?wis mod\]?\s+vs\.?\s+a\s+DC\s+equal\s+to\s+10\s*\+\s*the\s+spell'?s\s+tier\.?/gi,
      "Priest spell, 1d20+[wis mod] DC = 10 + Tier."
    );
}

function isSpellCheckText(text) {
  return /\b(?:wizard|priest)\s+spell\b/i.test(String(text || "")) && /\b1d20\b/i.test(String(text || ""));
}

function getCharacterKnownSpellNames(character) {
  return String(character?.spellsKnown || "")
    .split(/\s*,\s*/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function getRemappedMagicMissileAdvantageSpell(character) {
  const spells = getCharacterKnownSpellNames(character).filter((name) => getSpellKey(name) !== "magic missile");
  if (!spells.length) {
    return "";
  }
  const seed = String(character?.id || character?.name || "").split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  return spells[seed % spells.length];
}

function isMagicMissileAdvantageTalentLine(line) {
  return /(?:gain advantage on casting\s+magic missile|magic missile:\s*advoncastonespell)/i.test(String(line || ""));
}

function shouldSuppressTalentLine(line, allLines) {
  const normalized = String(line || "").trim();
  if (/^Spells:\s*None\s*$/i.test(normalized)) {
    return true;
  }
  if (isMagicMissileAdvantageTalentLine(normalized)) {
    return true;
  }
  if (/Armor Mastery:\s*Choose one kind of armor/i.test(normalized)) {
    return allLines.some((candidate) => /Armor Mastery:\s*(?:Shield|Leather|Chainmail|Plate)/i.test(String(candidate || "")));
  }
  if (!/Backstab Increase\s*$/i.test(normalized)) {
  return false;
}
  const prefix = normalized.replace(/Backstab Increase\s*$/i, "Backstab Increase:");
  return allLines.some((candidate) => (
    candidate !== line &&
    String(candidate || "").startsWith(prefix) &&
    /\+1 dice of damage|Your Backstab deals/i.test(String(candidate || ""))
  ));
}

function buildTalentSpellLines(character) {
  const lines = [];
  const seenLines = new Set();
  const spellBuckets = {};
  const sourceEntries = new Map();
  const globalKnownSpells = new Set();
  const hasTopLevelLanguages = Boolean(normalizeName(character?.languages));

  function getSource(label) {
    const labelBase = normalizeName(label).replace(/\s+\d+$/u, "");
    if (!sourceEntries.has(label)) {
      sourceEntries.set(label, {
        learnByTier: new Map(),
        extraByDesc: new Map(),
        pendingExtraDesc: labelBase ? `Learn an additional ${labelBase} spell` : "Learn an additional spell",
        defaultSpellTier: "",
        simpleLines: []
      });
    }
    return sourceEntries.get(label);
  }

  function normalizeName(value) {
    return String(value || "").replace(/\s+/g, " ").replace(/^["']|["']$/g, "").trim();
  }

  function isNullText(value) {
    return /^\s*none\s*$/i.test(normalizeName(value));
  }

  function prettifyTalentName(value) {
    const normalized = normalizeName(value)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([0-9])([A-Za-z])/g, "$1 $2")
      .replace(/([A-Za-z])([0-9])/g, "$1 $2")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return normalized
      .split(" ")
      .map((word) => (/^[A-Z]{2,}$/i.test(word) ? word : `${word.charAt(0).toUpperCase()}${word.slice(1)}`))
      .filter(Boolean)
      .join(" ")
      .replace(/^Stat Bonus$/i, "Stat Bonus");
  }

  function normalizeTier(value) {
    const tier = String(value || "").trim();
    return tier ? tier : "";
  }

  function extractBonusSourceLabel(bonus) {
    const sourceName = normalizeName(bonus?.sourceName);
    const sourceType = normalizeName(bonus?.sourceType);
    const level = bonus?.gainedAtLevel || character.level || 1;
    const sourceTypeLower = sourceType.toLowerCase();

    if (sourceTypeLower === "class") {
      return `${sourceName || character.className || "Class"} ${level}`.trim();
    }
    if (sourceTypeLower === "ancestry") {
      return `${sourceName || character.ancestry || "Ancestry"}`.trim();
    }
    if (sourceTypeLower === "ambition") {
      return `${sourceName || character.ancestry || "Ancestry"} Ambition Talent`;
    }
    if (sourceName && sourceType && sourceTypeLower !== "talent") {
      if (sourceTypeLower.includes("ambition")) {
        return `${sourceName} ${sourceType}`.replace(/\bAmbition$/i, "Ambition Talent").trim();
      }
      return `${sourceName} ${sourceType}`.trim();
    }
    return `${sourceName || sourceType || "Talent"} ${sourceTypeLower === "talent" ? "" : level}`.trim();
  }

  function sanitizeSpell(value) {
    return normalizeName(value)
      .replace(/^\((.*?)\)$/, "$1")
      .replace(/^\[(.*?)\]$/, "$1")
      .replace(/^(?:-|\u2014)\s*/, "")
      .replace(/\s+(?:\(V\)|\(M\)|\(S\))$/i, "")
      .trim();
  }

  function looksLikeSpell(value) {
    const normalized = normalizeName(value);
    if (!normalized) {
      return false;
    }
    if (normalized.length > 70) {
      return false;
    }
    if (/^\d+$/.test(normalized)) {
      return false;
    }
    if (/learn\s+an\s+additional|learnextra|pickextraspell|spell(?:s)?\s*$/i.test(normalized)) {
      return false;
    }
    return true;
  }

  function extractExtraDescription(value) {
    const sourceText = normalizeName(value);
    const learnExtraMatch = sourceText.match(/\blearn\s+an\s+additional\s+(.+?\bspell)\b/i);
    if (learnExtraMatch && learnExtraMatch[1]) {
      const compact = normalizeName(`Learn an additional ${learnExtraMatch[1]}`);
      if (compact) {
        return compact;
      }
    }
    return "";
  }

  function ensureBucket(map, tier) {
    const tierKey = normalizeTier(tier);
    if (!map.has(tierKey)) {
      map.set(tierKey, []);
    }
    return map.get(tierKey);
  }

  function addSpellToBucket(map, name, tier) {
    const spell = sanitizeSpell(name);
    if (!spell || !looksLikeSpell(spell)) {
      return;
    }
    const bucket = ensureBucket(map, tier);
    const key = spell.toLowerCase();
    const already = bucket.some((item) => item.toLowerCase() === key);
    if (!already) {
      bucket.push(spell);
    }
  }

  function readSpellsForDisplay(spellsByTier) {
    const output = [];
    const sorted = Array.from(spellsByTier.entries()).sort((a, b) => {
      if (!a[0] && b[0]) {
        return 1;
      }
      if (a[0] && !b[0]) {
        return -1;
      }
      const aNum = Number(a[0]);
      const bNum = Number(b[0]);
      if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
        return aNum - bNum;
      }
      return a[0].localeCompare(b[0]);
    });
    for (const [tier, spells] of sorted) {
      for (const spell of spells) {
        output.push({ tier, name: spell });
      }
    }
    return output;
  }

  function addExtraGroup(source, desc, name, tier) {
    const groupKey = normalizeName(desc || "Learn an additional spell");
    const group = source.extraByDesc.get(groupKey) || {
      desc: groupKey,
      spellsByTier: new Map()
    };
    addSpellToBucket(group.spellsByTier, name, tier);
    source.extraByDesc.set(groupKey, group);
  }

  function addLine(line) {
    const value = String(line || "").trim();
    if (!value) {
      return;
    }
    const key = value.toLowerCase();
    if (seenLines.has(key)) {
      return;
    }
    seenLines.add(key);
    lines.push(value);
  }

  function hasGlobalSpellAnyTier(name) {
    const lower = sanitizeSpell(name).toLowerCase();
    return Object.values(spellBuckets).some((bucket) => (
      bucket.some((entry) => entry.toLowerCase() === lower)
    ));
  }

  function sameTalentText(name, detail) {
    const cleanName = prettifyTalentName(name).replace(/\s+/g, "").toLowerCase();
    const cleanDetail = prettifyTalentName(detail).replace(/\s+/g, "").toLowerCase();
    return cleanName && cleanName === cleanDetail;
  }

  function isChoiceText(name, detail) {
    const text = normalizeName(`${name} ${detail}`);
    return /\bor\b/i.test(text) && /\bplus\s*\d|\+\d/i.test(text);
  }

  function getCastingTarget(detail, learnedSpells) {
    if (learnedSpells.length) {
      return learnedSpells[0];
    }
    const castMatch = normalizeName(detail).match(/\bcasting\s+([A-Za-z][A-Za-z0-9' -]+)/i);
    return castMatch ? castMatch[1] : "";
  }

  function parseLearnSpells(source, sourceText) {
    const getBucketCount = (map) => Array.from(map.values()).reduce((count, list) => count + list.length, 0);
    const knownCount = getBucketCount(source.learnByTier);
    let text = sourceText;
    const addLearnSpell = (name, tier) => {
      const tierValue = normalizeTier(tier);
      if (!source.defaultSpellTier && tierValue) {
        source.defaultSpellTier = tierValue;
      }
      addSpellToBucket(source.learnByTier, name, tierValue);
    };

    const learnByNamePattern = /\b([A-Za-z][A-Za-z0-9' -]+?)\s*:\s*Tier:\s*([0-9]+)\s*,\s*Spell\b[^;,]*/gi;
    text = text.replace(learnByNamePattern, (match, name, tier) => {
      addLearnSpell(name, tier);
      return " ";
    });

    const learnByNameNoColonPattern = /\b([A-Za-z][A-Za-z0-9' -]+?)\s+Tier:\s*([0-9]+)\s*,\s*Spell\b/gi;
    text = text.replace(learnByNameNoColonPattern, (match, name, tier) => {
      addLearnSpell(name, tier);
      return " ";
    });

    const learnBySpellPattern = /\bSpell\s*\d*\s*:\s*([^,;()-]+)(?:\s*-\s*Tier\s*:\s*([0-9]+))?/gi;
    text = text.replace(learnBySpellPattern, (match, spellName, tier) => {
      const tierValue = normalizeTier(tier);
      if (!source.defaultSpellTier && tierValue) {
        source.defaultSpellTier = tierValue;
      }
      addSpellToBucket(source.learnByTier, spellName, tier);
      return " ";
    });

    const learnListPattern = /\blearn\s*:\s*([^;]+)/i;
    text = text.replace(learnListPattern, (match, listText) => {
      const spellNames = normalizeName(listText).split(",").map((entry) => sanitizeSpell(entry)).filter(Boolean);
      for (const spellName of spellNames) {
        addSpellToBucket(source.learnByTier, spellName, "");
      }
      return " ";
    });

    const learnTierOnlyPattern = /\b([A-Za-z][A-Za-z0-9' -]+?)\s*:\s*Tier:\s*([0-9]+)(?!\s*,\s*Spell)/gi;
    text = text.replace(learnTierOnlyPattern, (match, name, tier) => {
      addLearnSpell(name, tier);
      return " ";
    });

    return {
      parsedText: text.trim(),
      foundSpells: getBucketCount(source.learnByTier) > knownCount
    };
  }

  function toSpellList(value) {
    const list = normalizeName(value)
      .split(",")
      .map((entry) => sanitizeSpell(entry))
      .filter(Boolean)
      .filter(looksLikeSpell);
    return list;
  }

    function collectExtraSpells(label, source, sourceText) {
    const text = normalizeName(sourceText);
    if (!text) {
      return false;
    }

    const tierMatch = text.match(/Tier:\s*([0-9]+)/i);
    const tier = tierMatch ? tierMatch[1] : "";

    const extraKeywordPresent = /(Learn\s*Extra\s*Spell|LearnExtraSpell|PickExtraSpell)/i.test(text);
    const extraDescMatch = text.match(/\blearn\s+an\s+additional[^:;]*/i);

    if (!extraKeywordPresent && !extraDescMatch) {
      return false;
    }

    let markerMatch = text.match(/Learn\s*Extra\s*Spell|LearnExtraSpell|PickExtraSpell/i);
    const marker = markerMatch ? markerMatch[0] : "";
    const markerStart = markerMatch ? markerMatch.index : -1;
    const markerEnd = markerMatch ? markerStart + marker.length : -1;

    const beforeMarker = normalizeName(markerMatch ? text.slice(0, markerStart) : text);
    const afterMarker = normalizeName(markerMatch ? text.slice(markerEnd) : "");

    const descriptionCandidate = normalizeName(
      extractExtraDescription(beforeMarker) || extractExtraDescription(afterMarker) || source.pendingExtraDesc || "Learn an additional spell"
    );
    if (descriptionCandidate) {
      source.pendingExtraDesc = descriptionCandidate;
    }

    const beforeSpells = toSpellList(beforeMarker);
    const afterSpells = toSpellList(afterMarker);
    let spellNames = [...afterSpells];
    if (!spellNames.length) {
      spellNames = [...beforeSpells];
    }
    if (!spellNames.length && extraDescMatch) {
      source.pendingExtraDesc = extractExtraDescription(extraDescMatch[0]) || source.pendingExtraDesc;
      source.extraByDesc.set(source.pendingExtraDesc, {
        desc: source.pendingExtraDesc,
        spellsByTier: new Map()
      });
      return true;
    }

    if (!spellNames.length) {
      return false;
    }

    const effectiveTier = tier || source.defaultSpellTier || "";
    for (const spellName of spellNames) {
      addExtraGroup(source, source.pendingExtraDesc || "Learn an additional spell", spellName, effectiveTier);
    }
    return true;
  }

  function addSourceLanguageLine(characterLanguages) {
    if (!characterLanguages) {
      return;
    }
    addLine(`Languages: ${characterLanguages}`);
  }

  function addSourceFromKnownSpells(knownSpells) {
    for (const spell of knownSpells) {
      if (isNullText(spell)) {
        continue;
      }
      const cleaned = sanitizeSpell(spell);
      if (!looksLikeSpell(cleaned)) {
        continue;
      }
      if (globalKnownSpells.has(cleaned.toLowerCase())) {
        continue;
      }
      if (hasGlobalSpellAnyTier(cleaned)) {
        continue;
      }
      globalKnownSpells.add(cleaned.toLowerCase());
      addGlobalSpell(cleaned, "");
    }
  }

  function addGlobalSpell(name, tier) {
    const spell = sanitizeSpell(name);
    if (!spell || !looksLikeSpell(spell)) {
      return;
    }
    const key = normalizeTier(tier);
    const bucket = spellBuckets[key] || [];
    const lower = spell.toLowerCase();
    const exists = bucket.some((entry) => entry.toLowerCase() === lower);
    if (exists) {
      return;
    }
    if (!spellBuckets[key]) {
      spellBuckets[key] = [];
    }
    spellBuckets[key].push(spell);
  }

  function addSourceLines() {
    for (const [label, source] of sourceEntries) {
      const learnSpells = readSpellsForDisplay(source.learnByTier);
      if (learnSpells.length) {
        const names = [];
        for (const entry of learnSpells) {
          if (!names.includes(entry.name)) {
            names.push(entry.name);
          }
        }
        addLine(`${label}: Learn: ${names.join(", ")}`);
      }

      for (const extra of source.extraByDesc.values()) {
        const extras = readSpellsForDisplay(extra.spellsByTier);
        if (!extras.length) {
          continue;
        }
        const spellNames = extras.map((entry) => entry.name);
        if (spellNames.length) {
          const extraDesc = normalizeName(extra.desc) || "Learn an additional spell";
          if (isNullText(extraDesc)) {
            addLine(`${label}: Learn Extra Spell: ${spellNames.join(", ")}`);
          } else {
            addLine(`${label}: Learn Extra Spell: ${extraDesc}: ${spellNames.join(", ")}`);
          }
        }
      }

      for (const simple of source.simpleLines) {
        const talentName = String(simple?.name || "").trim();
        const detail = String(simple?.desc || "").trim();
        const nameLower = talentName.toLowerCase();
        const detailLower = detail.toLowerCase();
        const learnedSpells = readSpellsForDisplay(source.learnByTier).map((entry) => entry.name);

        if (/^languages$/i.test(nameLower) || /^languages$/i.test(detailLower)) {
          continue;
        }
        if (hasTopLevelLanguages && /languages/i.test(nameLower)) {
          continue;
        }
        if (hasTopLevelLanguages && /^languages\b/i.test(detailLower)) {
          continue;
        }
        if (hasTopLevelLanguages && /:\s*languages\b/i.test(detailLower)) {
          continue;
        }

        const isStatBonusGeneric = nameLower === "statbonus" || detailLower.startsWith("statbonus:");
        if (isStatBonusGeneric && /to\s+/.test(detailLower)) {
          const abilities = detailLower.match(/\b(str|strength|dex|dexterity|con|constitution|int|intelligence|wis|wisdom|cha|charisma)\b/g) || [];
          if (abilities.length >= 2) {
            continue;
          }
          continue;
        }
        if (nameLower === "talent" && !detail) {
          continue;
        }
        if (isChoiceText(talentName, detail)) {
          continue;
        }
        if (/^advantage/i.test(nameLower) || /adv on cast one spell|adv on cast/i.test(nameLower)) {
          if (/casting/i.test(detailLower) && /spell/i.test(detailLower)) {
            const castTarget = normalizeName(getCastingTarget(detail, learnedSpells));
            addLine(`${label}: Gain advantage on casting${castTarget ? ` ${castTarget}` : ""}`);
            continue;
          }
        }
        if (nameLower === "spellcasting") {
          const bonusMatch = detail.match(/[+-]?\d+/);
          if (bonusMatch) {
            const bonusValue = bonusMatch[0].startsWith("-") || bonusMatch[0].startsWith("+")
              ? bonusMatch[0]
              : `+${bonusMatch[0]}`;
            addLine(`${label}: Spellcasting${bonusValue}`);
            continue;
          }
          addLine(`${label}: Spellcasting${detail ? `: ${detail}` : ""}`);
          continue;
        }
        if (nameLower && detailLower === "") {
          if (nameLower.startsWith("learn an additional spell")) {
            const extraDesc = normalizeName(nameLower.replace(/\blearn an additional spell\b/i, "Learn an additional spell"));
            addLine(`${label}: Learn Extra Spell: ${extraDesc}`);
            continue;
          }
          if (nameLower === "learn") {
            continue;
          }
        }
        if (/^plus\s+\d/i.test(talentName) && !detail) {
          continue;
        }

        if (!nameLower && detail) {
          addLine(`${label}: ${detail}`);
          continue;
        }
        if (nameLower === "stat bonus" || nameLower === "statbonus") {
          const displayLabel = label.replace(/\bAmbition$/i, "Ambition Talent");
          addLine(`${displayLabel}: Stat Bonus${detail ? `: ${detail}` : ""}`);
          continue;
        }
        if (talentName && detail) {
          if (sameTalentText(talentName, detail)) {
            addLine(`${label}: ${prettifyTalentName(talentName)}`);
          } else if (/^plus\s+\d/i.test(talentName)) {
            addLine(`${label}: ${detail}`);
          } else {
            addLine(`${label}: ${prettifyTalentName(talentName)}: ${detail}`);
          }
          continue;
        }
        if (talentName) {
          addLine(`${label}: ${prettifyTalentName(talentName)}`);
        }
      }
    }
  }

  function parseTalentLine(label, talentName, talentDesc) {
    const source = getSource(label);
    const parsedName = normalizeName(talentName);
    const parsedDesc = normalizeName(talentDesc);
    const normalizedTalentName = /^spells?$/i.test(parsedName) ? "" : parsedName;
    const normalizedTalentDesc = parsedDesc;
    const talentText = normalizeName(`${normalizedTalentName} ${normalizedTalentDesc}`.trim());
    if (!talentText) {
      return false;
    }

    const parsed = parseLearnSpells(source, talentText);
    const extrasFound = collectExtraSpells(label, source, parsed.parsedText);

    const introPhrase = parsed.parsedText.match(/\blearn\s+an\s+additional\s+.+?\bspell\b/i);
    if (introPhrase) {
      const description = extractExtraDescription(introPhrase[0]);
      if (description) {
        source.pendingExtraDesc = description;
      }
      return true;
    }

    if (!parsed.foundSpells && !extrasFound && talentName) {
      source.simpleLines.push({
        name: normalizeName(prettifyTalentName(normalizedTalentName)),
        desc: normalizedTalentDesc
      });
    }
    return parsed.foundSpells || extrasFound || Boolean(talentName && talentText);
  }

  addSourceLanguageLine(character.languages);

  const className = character.className || "Class";
  for (const level of character.levels || []) {
    const levelNumber = level?.level || character.level || 1;
    const sourceLabel = `${className} ${levelNumber}`;
    if (!parseTalentLine(sourceLabel, level?.talentRolledName || "", level?.talentRolledDesc || "")) {
      parseTalentLine(sourceLabel, "Talent", level?.talentRolledDesc || "");
    }
  }

  for (const bonus of character.bonuses || []) {
    const sourceLabel = extractBonusSourceLabel(bonus);
    const sourceName = bonus?.bonusName || bonus?.name || "";
    const bonusDetail = bonus?.bonusTo || "";
    if (!parseTalentLine(sourceLabel, sourceName, bonusDetail)) {
      parseTalentLine(sourceLabel, "Talent", [sourceName, bonusDetail].filter(Boolean).join(" "));
    }
  }

  addSourceLines();

  for (const source of sourceEntries.values()) {
    for (const [tier, entry] of source.learnByTier.entries()) {
      for (const name of entry) {
        addGlobalSpell(name, tier);
      }
    }
    for (const extra of source.extraByDesc.values()) {
      for (const [tier, entry] of extra.spellsByTier.entries()) {
        for (const name of entry) {
          addGlobalSpell(name, tier);
        }
      }
    }
  }

  const knownSpells = typeof character?.spellsKnown === "string" ? character.spellsKnown.split(",").map((entry) => entry.trim()).filter(Boolean) : [];
  addSourceFromKnownSpells(knownSpells);

  const sortedTiers = Object.keys(spellBuckets).sort((a, b) => {
    if (!a) {
      return 1;
    }
    if (!b) {
      return -1;
    }
    return Number(a) - Number(b);
  });
  const spellLineParts = [];
  for (const tier of sortedTiers) {
    const values = spellBuckets[tier] || [];
    if (!values.length) {
      continue;
    }
    const label = tier ? `(Tier ${tier})` : "";
    spellLineParts.push(`${label ? `${label}: ` : ""}${values.join(", ")}`);
  }
  if (spellLineParts.length) {
    addLine(`Spells: ${spellLineParts.join("; ")}`);
  } else {
    addLine("Spells: None");
  }

  return lines;
}

function getCharacterGearSlots(character, options = {}) {
  const { maxSlots = 20, excludeBackpack } = options;
  const lines = [];
  const freeCarry = [];
  let totalSlots = 0;
  let backpackReserved = false;
  const capacitySlots = Math.max(10, Number(character?.gearSlotsTotal || character?.stats?.STR || 10) || 10);

  const configuredMaxSlots = Number.isFinite(Number(maxSlots)) ? Number(maxSlots) : 20;
  const maxUsedSlots = Math.max(configuredMaxSlots, capacitySlots);
  const items = Array.isArray(character?.gear) ? character.gear : [];

  function formatStackName(name, units, groupSize) {
    return groupSize > 1 && units > 1 ? `${name} x ${units}` : name;
  }

  function formatFreeCarryName(item) {
    const itemName = String(item?.name || "Gear").trim() || "Gear";
    const valueLabel = formatTreasureValue(Number(item?.value) || 0);
    return `${itemName} (${valueLabel})`;
  }

  function formatGearLineName(item, fallbackName) {
    const itemName = String(fallbackName || item?.name || "Gear").trim() || "Gear";
    if (item?.treasureItem === true) {
      return `${itemName} (${formatTreasureValue(Number(item?.value) || 0)})`;
    }
    return itemName;
  }

  function getCoinCount() {
    return Math.max(0, getCharacterMoney(character, "gold"))
      + Math.max(0, getCharacterMoney(character, "silver"))
      + Math.max(0, getCharacterMoney(character, "copper"));
  }

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex];
    const rawItemName = String(item?.name || "Gear").trim() || "Gear";
    const itemName = rawItemName;
    const displayItemName = formatGearLineName(item, itemName);
    const normalizedItemName = itemName.toLowerCase();
    const isTorch = normalizedItemName === "torch" || normalizedItemName.startsWith("torch ");
    const isBackpack = itemName.toLowerCase() === "backpack";
    const rawUnits = Number.isFinite(Number(item?.totalUnits)) && Number(item.totalUnits) > 0
      ? Math.max(0, Math.floor(Number(item.totalUnits)))
      : Number.isFinite(Number(item?.quantity)) && Number(item.quantity) > 0
        ? Math.max(0, Math.floor(Number(item.quantity)))
        : 1;
    const units = /arrows?/i.test(itemName)
      ? getCharacterAmmo(character, "arrows")
      : /bolts?/i.test(itemName)
        ? getCharacterAmmo(character, "bolts")
        : rawUnits;
    if (units <= 0) {
      continue;
    }
    const groupSize = getStackGroupSize(itemName);
    const slotsPerUnit = isTorch ? 1 : inferGearItemSlots(itemName, item);

    let remainingUnits = units;
    if (isBackpack && !backpackReserved && excludeBackpack !== false) {
      backpackReserved = true;
      if (units > 0) {
        freeCarry.push(itemName);
      }
      remainingUnits = Math.max(0, units - 1);
    }

    if (item?.treasureItem === true && inferGearItemSlots(itemName, item) === 0) {
      freeCarry.push(formatFreeCarryName(item));
      continue;
    }

    if (groupSize > 1) {
      const slotGroups = Math.max(1, Math.ceil(remainingUnits / groupSize));
      const displayName = formatStackName(displayItemName, remainingUnits, groupSize);
      lines.push({ text: displayName, available: totalSlots < capacitySlots, gearIndex: itemIndex, primary: true });
      totalSlots += 1;
      for (let group = 1; group < slotGroups; group += 1) {
        lines.push({ text: `   (${displayItemName})`, available: totalSlots < capacitySlots, gearIndex: itemIndex, primary: false });
        totalSlots += 1;
      }
      continue;
    }

    const unitText = formatStackName(displayItemName, 1, groupSize);
    for (let unit = 0; unit < remainingUnits; unit += 1) {
      for (let slot = 0; slot < slotsPerUnit; slot += 1) {
        lines.push({
          text: slot === 0 ? unitText : `   (${displayItemName})`,
          available: totalSlots < capacitySlots,
          gearIndex: itemIndex,
          primary: slot === 0
        });
        totalSlots += 1;
      }
    }
  }

  const carriedCoins = getCoinCount();
  const coinOverflow = Math.max(0, carriedCoins - 100);
  const coinBagSlots = getCharacterCoinBagSlots(character);
  if (coinBagSlots > 0) {
    lines.push({
      text: `bag of coins x ${coinOverflow}`,
      available: totalSlots < capacitySlots,
      gearIndex: null,
      primary: true
    });
    totalSlots += 1;
    for (let slot = 1; slot < coinBagSlots; slot += 1) {
      lines.push({
        text: "   (bag of coins)",
        available: totalSlots < capacitySlots,
        gearIndex: null,
        primary: false
      });
      totalSlots += 1;
    }
  }

  const total = maxUsedSlots;
  while (lines.length < total) {
    lines.push({
      text: "",
      available: lines.length < capacitySlots && lines.length < maxUsedSlots
    });
    totalSlots += 1;
  }
  return {
    slots: lines.slice(0, maxUsedSlots),
    freeCarry: [`coin bag x ${Math.min(100, carriedCoins)}`, ...freeCarry].slice(0, 10)
  };
}

function getCharacterMoney(character, key) {
  return Number(character?.[key] ?? character?.raw?.[key] ?? 0) || 0;
}

function getCharacterMoneyCopper(character) {
  return getCharacterMoney(character, "gold") * 100
    + getCharacterMoney(character, "silver") * 10
    + getCharacterMoney(character, "copper");
}

async function loadRulesData() {
  try {
    const response = await fetch("./data/rules-data.json");
    if (!response.ok) {
      throw new Error(`Rules data request failed: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    console.warn("Using built-in rules fallback because rules-data.json could not load.", error);
    return null;
  }
}

function setCharacterMoneyValue(character, key, value) {
  const nextValue = Math.max(0, Math.min(2000, Number.parseInt(value, 10) || 0));
  character[key] = nextValue;
  character.raw = character.raw || {};
  character.raw[key] = nextValue;
  return nextValue;
}

function updateCharacterMoneyField(character, key, nextValue) {
  const previousValue = getCharacterMoney(character, key);
  if (Number.parseInt(nextValue, 10) > previousValue) {
    return previousValue;
  }
  const clampedNext = setCharacterMoneyValue(character, key, nextValue);
  const delta = clampedNext - previousValue;
  if (delta < 0) {
    dropCharacterCoinPile(character, key, Math.abs(delta));
  }
  normalizeCharacterState(state);
  syncAllCharacterEquipmentDerivedStats();
  applyCharacterColorOverrides();
  ensureCharacterPresentation();
  markRunDirty();
  refreshCharacterViews(character);
  render();
  updatePanels();
  return clampedNext;
}

function getCoinLabel(key) {
  if (key === "gold") {
    return "g.p.";
  }
  if (key === "silver") {
    return "s.p.";
  }
  return "c.p.";
}

function getCoinBagName(key) {
  if (key === "gold") {
    return "GP coin bag";
  }
  if (key === "silver") {
    return "SP coin bag";
  }
  return "CP coin bag";
}

function getCoinValueInCopper(key, amount) {
  const units = Math.max(0, Number(amount) || 0);
  if (key === "gold") {
    return units * 100;
  }
  if (key === "silver") {
    return units * 10;
  }
  return units;
}

function findMergeableCoinPile(key, tile) {
  return state.entities.find((entity) => (
    entity.type === "treasure" &&
    entity.subtype === `dropped-${key}` &&
    !entity.collected &&
    entity.x === tile.x &&
    entity.y === tile.y &&
    Number(entity.coinBreakdown?.[key] || 0) < 100
  )) || null;
}

function createCoinPileEntity(character, key, amount) {
  const tile = findEquipmentDropTile(character);
  const label = getCoinLabel(key);
  return {
    id: `coin-drop-${key}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type: "treasure",
    subtype: `dropped-${key}`,
    kind: "coin-cache",
    name: getCoinBagName(key),
    x: tile.x,
    y: tile.y,
    roomId: tile.roomId,
    visible: true,
    revealed: true,
    collected: false,
    value: Math.max(1, Math.round(getCoinValueInCopper(key, amount) / 100)),
    slots: Math.max(1, Math.ceil(Math.max(1, amount) / 100)),
    bonusSlots: 0,
    priceless: false,
    description: `${amount} ${label} dropped from ${character?.name || "a character"}.`,
    coinBreakdown: {
      gold: key === "gold" ? amount : 0,
      silver: key === "silver" ? amount : 0,
      copper: key === "copper" ? amount : 0
    }
  };
}

function dropCharacterCoinPile(character, key, amount) {
  if (!character || !amount) {
    return null;
  }
  const tile = findEquipmentDropTile(character);
  let remaining = Math.max(0, Math.floor(Number(amount) || 0));
  let lastPile = null;
  while (remaining > 0) {
    const mergeable = findMergeableCoinPile(key, tile);
    if (mergeable) {
      mergeable.coinBreakdown = mergeable.coinBreakdown || { gold: 0, silver: 0, copper: 0 };
      const currentAmount = Math.max(0, Number(mergeable.coinBreakdown[key] || 0));
      const addAmount = Math.min(remaining, Math.max(0, 100 - currentAmount));
      mergeable.coinBreakdown[key] = currentAmount + addAmount;
      mergeable.value = Math.max(1, Math.round(getCoinValueInCopper(key, mergeable.coinBreakdown[key]) / 100));
      mergeable.slots = 1;
      mergeable.name = getCoinBagName(key);
      mergeable.description = `${mergeable.coinBreakdown[key]} ${getCoinLabel(key)} dropped from ${character?.name || "a character"}.`;
      remaining -= addAmount;
      lastPile = mergeable;
      continue;
    }
    const nextAmount = Math.min(remaining, 100);
    const entity = createCoinPileEntity(character, key, nextAmount);
    state.entities.push(entity);
    remaining -= nextAmount;
    lastPile = entity;
  }
  return lastPile;
}

function getXpTarget(character) {
  return Number(character.raw?.xpNext ?? character.raw?.XPToNextLevel ?? (character.level || 1) * 10) || 10;
}

function getTileAt(x, y) {
  if (!state || x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) {
    return null;
  }
  return state.tiles[y * state.map.width + x] || null;
}

function isCharacterTileBlocked(x, y) {
  const tile = getTileAt(x, y);
  if (!tile || tile.type !== "floor") {
    return true;
  }
  return state.entities.some((entity) => (
    entity.type === "trap" &&
    !entity.disarmed &&
    !entity.triggered &&
    entity.x === x &&
    entity.y === y
  ));
}

function findOpenCharacterTile(originX, originY, occupied = new Set()) {
  for (let radius = 1; radius <= 4; radius += 1) {
    const candidates = [];
    for (let y = originY - radius; y <= originY + radius; y += 1) {
      for (let x = originX - radius; x <= originX + radius; x += 1) {
        if (Math.max(Math.abs(x - originX), Math.abs(y - originY)) !== radius) {
          continue;
        }
        candidates.push({ x, y });
      }
    }
    for (const candidate of shuffleCoordinates(candidates)) {
      if (!isCharacterTileBlocked(candidate.x, candidate.y) && !occupied.has(`${candidate.x},${candidate.y}`)) {
        return { x: candidate.x, y: candidate.y, roomId: getTileAt(candidate.x, candidate.y)?.roomId || null };
      }
    }
  }
  return { x: originX, y: originY, roomId: getTileAt(originX, originY)?.roomId || null };
}

function getCharacterSpawnOrigin(character, index) {
  const active = getActiveCharacter(state);
  if (hasCharacterMapPosition(active) && active.id !== character?.id) {
    return {
      x: Number(active.x),
      y: Number(active.y)
    };
  }

  const previous = index > 0 ? state.characters[index - 1] : null;
  if (hasCharacterMapPosition(previous)) {
    return {
      x: Number(previous.x),
      y: Number(previous.y)
    };
  }

  if (hasCharacterMapPosition(state.player)) {
    return {
      x: Number(state.player.x),
      y: Number(state.player.y)
    };
  }

  return {
    x: 0,
    y: 0
  };
}

function getCharacterFallbackTile(character, index) {
  const origin = getCharacterSpawnOrigin(character, index);
  const originTile = getTileAt(Number(origin.x), Number(origin.y));
  if (originTile?.type === "floor") {
    return {
      x: Number(origin.x),
      y: Number(origin.y),
      roomId: originTile.roomId || null
    };
  }
  return findOpenCharacterTile(Number(origin.x) || 0, Number(origin.y) || 0);
}

function ensureCharacterPresentation() {
  if (!state?.characters?.length) {
    return;
  }
  const usedColors = new Set();

  for (const [index, character] of state.characters.entries()) {
    initializeImportedCharacterLight(character, index);
    const overrideColorId = characterColorOverrides.get(character.id);
    if (overrideColorId) {
      character.colorId = overrideColorId;
    } else if (character.raw?.colorId) {
      character.colorId = character.raw.colorId;
    }
    const paletteHasColor = CHARACTER_COLOR_PALETTE.some((color) => color.id === character.colorId);
    if (!paletteHasColor || usedColors.has(character.colorId)) {
      const preferred = index === 0 ? CHARACTER_COLOR_PALETTE[0] : null;
      const nextColor = preferred && !usedColors.has(preferred.id)
        ? preferred
        : CHARACTER_COLOR_PALETTE.find((color) => !usedColors.has(color.id)) || CHARACTER_COLOR_PALETTE[index % CHARACTER_COLOR_PALETTE.length];
      character.colorId = nextColor.id;
    }
    if (character.id && character.colorId) {
      characterColorOverrides.set(character.id, character.colorId);
      character.raw = character.raw || {};
      character.raw.colorId = character.colorId;
    }
    usedColors.add(character.colorId);

    const tile = hasCharacterMapPosition(character)
      ? getTileAt(Number(character.x), Number(character.y))
      : null;
    if (!hasCharacterMapPosition(character) || tile?.type !== "floor") {
      const start = getCharacterFallbackTile(character, index);
      character.x = start.x;
      character.y = start.y;
      character.roomId = start.roomId;
    } else {
      character.roomId = character.roomId ?? tile.roomId ?? null;
    }
    character.colorValue = getCharacterColorValue(character);
  }

  const active = getActiveCharacter(state);
  if (hasCharacterMapPosition(active)) {
    state.player.x = active.x;
    state.player.y = active.y;
    state.player.roomId = active.roomId ?? getTileAt(active.x, active.y)?.roomId ?? state.player.roomId;
    syncPlayerLightFromActiveCharacter();
  }
}

function syncPlayerToActiveCharacter() {
  const active = getActiveCharacter(state);
  if (!active || !hasCharacterMapPosition(active)) {
    return;
  }
  state.player.x = Number(active.x);
  state.player.y = Number(active.y);
  state.player.roomId = active.roomId ?? getTileAt(active.x, active.y)?.roomId ?? state.player.roomId;
  syncPlayerLightFromActiveCharacter();
}

function activateCharacter(character) {
  if (!state || !character) {
    return null;
  }
  setActiveCharacter(state, character.id);
  ensureCharacterPresentation();
  syncPlayerToActiveCharacter();
  recomputeVisibility(state);
  return getCurrentCharacter(character);
}

function syncActiveCharacterToPlayer() {
  const active = getActiveCharacter(state);
  if (!active) {
    return;
  }
  active.x = state.player.x;
  active.y = state.player.y;
  active.roomId = state.player.roomId;
  syncActiveCharacterLightFromPlayer();
}

function getCharacterAtTile(x, y) {
  return state?.characters?.find((character) => (
    character.dead !== true &&
    character.slain !== true &&
    hasCharacterMapPosition(character) &&
    Number(character.x) === x &&
    Number(character.y) === y
  )) || null;
}

function getCurrentCharacter(character) {
  if (!character?.id) {
    return character;
  }
  return state?.characters?.find((candidate) => candidate.id === character.id) || character;
}

function getCharacterAmmoOverrideKey(character, type) {
  return character?.id && type ? `${character.id}:${type}` : "";
}

function getDisplayCharacterAmmo(character, type) {
  const key = getCharacterAmmoOverrideKey(character, type);
  if (key && characterAmmoOverrides.has(key)) {
    return characterAmmoOverrides.get(key);
  }
  return getCharacterAmmo(character, type);
}

function setDisplayCharacterColor(character, color) {
  const currentCharacter = getCurrentCharacter(character);
  if (!currentCharacter?.id || !color?.id) {
    return currentCharacter;
  }
  characterColorOverrides.set(currentCharacter.id, color.id);
  currentCharacter.colorId = color.id;
  currentCharacter.colorValue = color.value;
  currentCharacter.raw = currentCharacter.raw || {};
  currentCharacter.raw.colorId = color.id;
  return currentCharacter;
}

function applyCharacterColorOverrides() {
  if (!state?.characters?.length || !characterColorOverrides.size) {
    return;
  }
  for (const character of state.characters) {
    const colorId = characterColorOverrides.get(character.id);
    if (!colorId) {
      continue;
    }
    character.colorId = colorId;
    character.colorValue = getCharacterColorValue(character);
    character.raw = character.raw || {};
    character.raw.colorId = colorId;
  }
}

function setDisplayCharacterAmmo(character, type, value) {
  const currentCharacter = getCurrentCharacter(character);
  const key = getCharacterAmmoOverrideKey(currentCharacter, type);
  if (key) {
    characterAmmoOverrides.set(key, value);
  }
  setCharacterAmmo(currentCharacter, type, value);
  return currentCharacter;
}

function applyCharacterAmmoOverrides() {
  if (!state?.characters?.length || !characterAmmoOverrides.size) {
    return;
  }
  for (const character of state.characters) {
    for (const type of ["arrows", "bolts"]) {
      const key = getCharacterAmmoOverrideKey(character, type);
      if (key && characterAmmoOverrides.has(key)) {
        setCharacterAmmo(character, type, characterAmmoOverrides.get(key));
      }
    }
  }
}

function refreshCharacterViews(character) {
  const currentCharacter = getCurrentCharacter(character);
  clearMagicLightIfIncapacitated(currentCharacter);
  normalizeCharacterState(state);
  applyCharacterAmmoOverrides();
  syncAllCharacterEquipmentDerivedStats();
  applyCharacterColorOverrides();
  ensureCharacterPresentation();
  const refreshedCharacter = getCurrentCharacter(currentCharacter);
  markUserActivity();
  updateCharactersUi();
  if (ui.characterSheetModal && !ui.characterSheetModal.hidden) {
    renderCharacterDetail(refreshedCharacter, ui.characterSheetContent, { popout: true });
  }
  updatePanels();
}

function createDyingBanner(character) {
  if (!character?.dead && !character?.dyingRounds) {
    return null;
  }
  const banner = document.createElement("button");
  banner.type = "button";
  banner.className = character.dead ? "character-death-banner is-dead" : "character-death-banner";
  banner.textContent = character.dead
    ? "DEAD"
    : `${character.name} is dying in ${character.dyingRounds} ${character.dyingRounds === 1 ? "round" : "rounds"}!`;
  banner.disabled = character.dead === true;
  banner.addEventListener("click", (event) => {
    event.stopPropagation();
    decrementCharacterDyingRounds(character);
    refreshCharacterViews(character);
  });
  return banner;
}

function renderCharacterCard(character) {
  const card = document.createElement("article");
  card.className = "character-card";
  card.classList.toggle("is-active", character.id === state.activeCharacterId);
  card.classList.toggle("is-slain", character.dead === true || character.slain === true);
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `Open ${character.name} character sheet`);
  card.addEventListener("click", () => {
    const currentCharacter = activateCharacter(character) || character;
    updateCharactersUi();
    render();
    openCharacterSheet(currentCharacter);
  });
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const currentCharacter = activateCharacter(character) || character;
      updateCharactersUi();
      render();
      openCharacterSheet(currentCharacter);
    }
  });

  const header = document.createElement("div");
  header.className = "character-mini-header";
  header.append(
    document.createTextNode(`${character.name} | ${character.ancestry || "Unknown"} | ${character.className || "Class"} ${character.level || 1} | AC ${character.armorClass} | HP `),
    createMiniInlineNumberField(character.hp, character.maxHitPoints, (value) => {
      const currentCharacter = getCurrentCharacter(character);
      setCharacterHp(currentCharacter, value);
      clearMagicLightIfIncapacitated(currentCharacter);
      refreshCharacterViews(currentCharacter);
    }),
    document.createTextNode(" "),
    createCharacterColorControl(character)
  );
  card.append(header);

  card.append(buildMiniAttackLine(character));
  const dyingBanner = createDyingBanner(character);
  if (dyingBanner) {
    card.append(dyingBanner);
  }
  return card;
}

function removeCharacterCompletely(character) {
  if (!state || !character?.id) {
    return false;
  }
  const index = state.characters.findIndex((candidate) => candidate.id === character.id);
  if (index === -1) {
    return false;
  }
  const removed = state.characters[index]?.name || "Character";
  state.characters.splice(index, 1);
  normalizeCharacterState(state);
  state.run.dirty = true;
  state.run.hasUserActivity = true;
  markUserActivity();
  updateCharactersUi();
  updatePanels();
  closeCharacterSheet();
  setStatus(`${removed} has been removed.`);
  return true;
}

function renderCharacterDetail(character, target = ui.characterDetail, options = {}) {
  const { popout = false } = options;
  if (!target) {
    return;
  }
  if (!character) {
    target.hidden = true;
    target.innerHTML = "";
    return;
  }

  target.hidden = false;
  target.innerHTML = "";

  const sheet = document.createElement("article");
  sheet.className = "character-sheet";
  if (popout) {
    sheet.classList.add("character-sheet--popout");
  }
  sheet.classList.toggle("is-slain", character.dead === true || character.slain === true);

  const dyingBanner = createDyingBanner(character);
  if (dyingBanner) {
    sheet.append(dyingBanner);
  }

  const logo = document.createElement("div");
  logo.className = "sd-sheet-logo";
  logo.textContent = "ShadowDark";

  const nameBox = createSdField("Name", character.name, "sd-name-box");
  const talentLines = buildTalentSpellLines(character);
  const displayedTalentKeys = new Set();
  const talentRows = [];
  for (const line of talentLines.filter((candidate) => !shouldSuppressTalentLine(candidate, talentLines))) {
    const displayLine = formatTalentSpellTextForSheet(line);
    const displayKey = displayLine.toLowerCase().replace(/\s+/g, " ").trim();
    if (displayedTalentKeys.has(displayKey)) {
      continue;
    }
    displayedTalentKeys.add(displayKey);
    talentRows.push(/^Spells:/i.test(displayLine)
      ? createSpellSummaryLine(displayLine, character)
      : createDamageAwareLine(displayLine, {
        sourceLabel: `${character.name} talent`,
        spellCheck: isSpellCheckText(displayLine),
        character
      }));
  }
  if (talentLines.some(isMagicMissileAdvantageTalentLine)) {
    const replacementSpell = getRemappedMagicMissileAdvantageSpell(character);
    if (replacementSpell) {
      talentRows.push(createDamageAwareLine(`Wizard 1: Cast ${replacementSpell} at advantage`, {
        sourceLabel: `${character.name} talent`,
        character
      }));
    }
  }
  if (getBackstabMultiplier(character)) {
    talentRows.unshift(document.createTextNode(`Thief 1: Backstab x ${getBackstabMultiplier(character)} (all thieves)`));
  }
  const attackRows = getRenderableAttacks(character)
    .filter((attackText) => !isBackstabAttackText(attackText))
    .map((attackText) => createAttackAwareLine(formatAttackForSheet(attackText), character));
  const talentPanelTitle = getCharacterKnownSpellNames(character).length ? "Talents / Spells" : "Talents";
  const talents = createSdPanel(talentPanelTitle, buildSheetLines(talentRows, 8), "sd-talents-panel");
  const attacks = createSdPanel("Attacks", buildSheetLines(attackRows, 8), "sd-attacks-panel");
  const gear = createSdGearPanel(character);
  const dismissal = popout ? createSdDismissPanel(character) : null;

  const statCluster = document.createElement("div");
  statCluster.className = "sd-stat-cluster";
  for (const key of ["STR", "INT", "DEX", "WIS", "CON", "CHA"]) {
    statCluster.append(createSdField(key, formatAbilityPair(character, key), "sd-stat-box"));
  }
  statCluster.append(createSdField("HP", `${character.maxHitPoints} / ${character.hp}`, "sd-vital-box"));
  statCluster.append(createSdField("AC", `${character.armorClass}`, "sd-vital-box"));

  const identity = document.createElement("div");
  identity.className = "sd-identity-column";
  identity.append(
    createSdField("Ancestry", character.ancestry || "Unknown"),
    createSdField("Class", character.className || "Class"),
    createSdField("Level", `${character.level || 1}`, "sd-level-box"),
    createSdField("XP", `${character.XP || 0} / ${getXpTarget(character)}`, "sd-xp-box"),
    createSdField("Title", character.title || "Unknown"),
    createSdField("Alignment", character.alignment || "Unknown"),
    createSdField("Background", character.background || "Unknown"),
    createSdField("Deity", character.deity || "Unknown")
  );

  sheet.append(logo, nameBox, talents, statCluster, identity, attacks, gear);
  if (dismissal) {
    sheet.append(dismissal);
  }
  target.append(sheet);
}

function enableCharacterNameEdit(character) {
  const currentCharacter = getCurrentCharacter(character);
  const valueNode = ui.characterSheetContent?.querySelector(".sd-name-box .sd-sheet-value");
  if (!currentCharacter || !valueNode) {
    return;
  }
  valueNode.contentEditable = "true";
  valueNode.setAttribute("role", "textbox");
  valueNode.classList.add("is-editing");
  valueNode.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(valueNode);
  selection?.removeAllRanges();
  selection?.addRange(range);

  let committed = false;
  const commitName = () => {
    if (committed) {
      return;
    }
    committed = true;
    const nextName = valueNode.textContent.trim() || currentCharacter.name || "Character";
    currentCharacter.name = nextName;
    currentCharacter.raw = currentCharacter.raw || {};
    currentCharacter.raw.name = nextName;
    refreshCharacterViews(currentCharacter);
    render();
    updatePanels();
    setStatus(`Renamed character to ${nextName}.`);
  };

  valueNode.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitName();
    }
  }, { once: false });
  valueNode.addEventListener("blur", commitName, { once: true });
}

function isCharacterInStartingRoom(character) {
  const entranceRoomId = state?.generation?.entranceRoomId;
  if (!entranceRoomId) {
    return false;
  }
  const roomId = character?.roomId || state?.player?.roomId || null;
  return roomId === entranceRoomId;
}

function createShopGearItem(config) {
  return {
    instanceId: `shop-${config.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    gearId: `shop-${config.id}`,
    name: config.name,
    type: "sundry",
    quantity: 1,
    totalUnits: 1,
    slots: config.slots,
    cost: config.cost,
    currency: config.currency
  };
}

const STARTING_ROOM_SHOP_ITEMS = [
  { id: "torch", name: "Torch", costLabel: "5 s.p.", costCopper: 50, cost: 5, currency: "sp", slots: 1 },
  { id: "lantern", name: "Lantern", costLabel: "5 g.p.", costCopper: 500, cost: 5, currency: "gp", slots: 1 },
  { id: "oil-flask", name: "Oil, flask", costLabel: "5 s.p.", costCopper: 50, cost: 5, currency: "sp", slots: 1 }
];

function addPurchasedGearToCharacterOrFloor(character, item) {
  const slotCost = getPickupSlotCost(character, item);
  if (getCharacterGearFreeSlots(character) >= slotCost) {
    character.gear = Array.isArray(character.gear) ? character.gear : [];
    const existing = findExistingGearStack(character, item);
    if (existing) {
      setGearItemUnits(existing, getGearUnits(existing) + getPileUnits(item));
    } else {
      character.gear.push(JSON.parse(JSON.stringify(item)));
    }
    return "gear";
  }
  addDroppedGearPile(item, findEquipmentDropTile(character));
  return "floor";
}

function buyStartingRoomShopItem(character, config) {
  const currentCharacter = getCurrentCharacter(character);
  if (!currentCharacter || !isCharacterInStartingRoom(currentCharacter)) {
    return;
  }
  const currentCopper = getCharacterMoneyCopper(currentCharacter);
  if (currentCopper < config.costCopper) {
    return;
  }
  setCharacterMoneyFromCopper(currentCharacter, currentCopper - config.costCopper);
  const item = createShopGearItem(config);
  const destination = addPurchasedGearToCharacterOrFloor(currentCharacter, item);
  normalizeCharacterState(state);
  syncAllCharacterEquipmentDerivedStats();
  applyCharacterColorOverrides();
  ensureCharacterPresentation();
  syncPlayerLightFromActiveCharacter();
  recomputeVisibility(state);
  markRunDirty();
  markUserActivity();
  refreshCharacterViews(currentCharacter);
  render();
  updatePanels();
  setStatus(`${currentCharacter.name || "Character"} buys ${config.name}${destination === "floor" ? "; no gear slot was free, so it lands on the floor." : "."}`);
}

function closeActiveShopPanel() {
  activeShopPanel?.remove();
  activeShopPanel = null;
}

function openStartingRoomShop(character, anchor) {
  closeActiveShopPanel();
  const currentCharacter = getCurrentCharacter(character);
  if (!currentCharacter) {
    return;
  }
  const panel = document.createElement("section");
  panel.className = "sd-shop-popover";
  const heading = document.createElement("h3");
  heading.textContent = "BUY";
  const coinLine = document.createElement("div");
  coinLine.className = "sd-shop-coins";
  coinLine.textContent = `${currentCharacter.name || "Character"} coins: GP ${getCharacterMoney(currentCharacter, "gold")}  SP ${getCharacterMoney(currentCharacter, "silver")}  CP ${getCharacterMoney(currentCharacter, "copper")}`;
  panel.append(heading, coinLine);

  const availableCopper = getCharacterMoneyCopper(currentCharacter);
  for (const config of STARTING_ROOM_SHOP_ITEMS) {
    const row = document.createElement("div");
    row.className = "sd-shop-row";
    const label = document.createElement("span");
    label.textContent = config.name;
    const price = document.createElement("span");
    price.textContent = config.costLabel;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "buy";
    button.disabled = availableCopper < config.costCopper;
    row.classList.toggle("is-unavailable", button.disabled);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      buyStartingRoomShopItem(currentCharacter, config);
      closeActiveShopPanel();
    });
    row.append(label, price, button);
    panel.append(row);
  }

  document.body.append(panel);
  const anchorRect = anchor?.getBoundingClientRect?.() || getCharacterSheetCard()?.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const left = Math.min(window.innerWidth - panelRect.width - 12, Math.max(12, anchorRect.left));
  const top = Math.min(window.innerHeight - panelRect.height - 12, Math.max(12, anchorRect.bottom + 6));
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  activeShopPanel = panel;

  const closeOnOutside = (event) => {
    if (!panel.contains(event.target) && event.target !== anchor) {
      closeActiveShopPanel();
      document.removeEventListener("pointerdown", closeOnOutside);
    }
  };
  setTimeout(() => document.addEventListener("pointerdown", closeOnOutside), 0);
}

function createSdDismissPanel(character) {
  const panel = document.createElement("section");
  panel.className = "sd-sheet-panel sd-dismiss-panel";

  const name = character?.name || "character";
  const isDead = character.dead === true || character.slain === true || (character.hp <= 0 && (character.dyingRounds || 0) <= 0);
  const actionLabel = `${isDead ? "BURY" : "DISMISS"} ${name}`;

  const dismissButton = document.createElement("button");
  dismissButton.type = "button";
  dismissButton.className = "sd-dismiss-button";
  dismissButton.textContent = actionLabel;

  const buttonWrap = document.createElement("div");
  buttonWrap.className = "sd-dismiss-button-wrap";
  const actionRow = document.createElement("div");
  actionRow.className = "sd-sheet-action-row";
  const renameButton = document.createElement("button");
  renameButton.type = "button";
  renameButton.className = "sd-rename-button";
  renameButton.textContent = `RENAME ${name}`;
  renameButton.addEventListener("click", (event) => {
    event.stopPropagation();
    enableCharacterNameEdit(character);
  });
  const saveCharacterButton = document.createElement("button");
  saveCharacterButton.type = "button";
  saveCharacterButton.className = "sd-save-character-button";
  saveCharacterButton.textContent = "SAVE CHARACTER";
  saveCharacterButton.addEventListener("click", (event) => {
    event.stopPropagation();
    saveCharacterSnapshot(character);
  });
  actionRow.append(dismissButton, renameButton, saveCharacterButton);
  if (isCharacterInStartingRoom(character)) {
    const buyButton = document.createElement("button");
    buyButton.type = "button";
    buyButton.className = "sd-buy-button";
    buyButton.textContent = "BUY";
    buyButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openStartingRoomShop(character, buyButton);
    });
    actionRow.append(buyButton);
  }
  buttonWrap.append(actionRow);

  if (isDead) {
    dismissButton.addEventListener("click", () => {
      setStatus(`you say a few words and bury ${name} in the dungeon.`);
      removeCharacterCompletely(character);
    });
    panel.append(buttonWrap);
  } else {
    const confirmation = document.createElement("div");
    confirmation.className = "sd-dismiss-confirmation";
    confirmation.hidden = true;
    const promptText = document.createElement("div");
    promptText.className = "sd-dismiss-prompt-text";
    promptText.textContent = "I'm really being fired?";

    const actions = document.createElement("div");
    actions.className = "sd-dismiss-confirmation-actions";
    const yesButton = document.createElement("button");
    yesButton.type = "button";
    yesButton.textContent = "Yes";
    const noButton = document.createElement("button");
    noButton.type = "button";
    noButton.textContent = "No";

    yesButton.addEventListener("click", () => {
      removeCharacterCompletely(character);
    });

    noButton.addEventListener("click", () => {
      confirmation.hidden = true;
    });

    actions.append(yesButton, noButton);
    confirmation.append(promptText, actions);
    buttonWrap.append(confirmation);

    dismissButton.addEventListener("click", () => {
      confirmation.hidden = false;
    });
    panel.append(buttonWrap);
  }

  return panel;
}

function buildMiniAttackLine(character) {
  const line = document.createElement("div");
  line.className = "character-mini-attacks";
  const attacks = getRenderableAttacks(character)
    .filter((attack) => !isBackstabAttackText(attack))
    .map((attack) => createMiniAttackNode(String(attack), character))
    .filter(Boolean);
  const lightNote = createCharacterLightNote(character);
  if (!attacks.length) {
    line.textContent = "Attacks: None";
    if (lightNote) {
      line.append(document.createTextNode("; "));
      line.append(lightNote);
    }
    return line;
  }
  line.append(document.createTextNode("Attacks: "));
  attacks.forEach((attackNode, index) => {
    if (index > 0) {
      line.append(document.createTextNode("; "));
    }
    line.append(attackNode);
  });
  if (lightNote) {
    line.append(document.createTextNode("; "));
    line.append(lightNote);
  }
  return line;
}

function createMiniAttackNode(attackText, character) {
  if (isSpellCheckText(attackText)) {
    return createDamageAwareLine(formatTalentSpellTextForSheet(formatAttackForSheet(attackText)), {
      sourceLabel: `${character?.name || "Character"} spell`,
      spellCheck: true,
      character
    });
  }
  const attack = parseAttackText(attackText);
  if (!attack) {
    return null;
  }
  const rawName = String(attackText || "").replace(/^ATTACKS?:\s*/i, "").split(":")[0] || attack.name;
  const ammoType = /bolt|crossbow/i.test(rawName)
    ? "bolts"
    : /bow|arrow/i.test(rawName)
      ? "arrows"
      : "";
  const attackNode = document.createElement("span");
  attackNode.className = "character-mini-attack-entry";
  attackNode.append(createAttackButton(character, attack));
  if (attack.flag) {
    attackNode.append(document.createTextNode(attack.flag));
  }
  if (attack.bonusText) {
    attackNode.append(document.createTextNode(` ${attack.bonusText}`));
  }
  if (attack.detail) {
    appendCompactAttackDetail(attackNode, attack, character);
  }
  const backstabButton = createBackstabButton(character, attack);
  if (backstabButton) {
    attackNode.append(document.createTextNode(", "));
    attackNode.append(backstabButton);
  }
  return attackNode;
}

function createCharacterColorControl(character) {
  const wrap = document.createElement("span");
  wrap.className = "character-color-control";
  ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "keydown"].forEach((eventName) => {
    wrap.addEventListener(eventName, (event) => event.stopPropagation());
  });

  const button = document.createElement("button");
  button.type = "button";
  button.className = "character-color-dot";
  button.title = "Change character color";
  const currentColorValue = getCharacterColorValue(character);
  button.style.setProperty("--character-color", currentColorValue);
  button.style.setProperty("background-color", currentColorValue);
  button.style.setProperty("background", currentColorValue);
  button.style.backgroundImage = "none";

  const picker = document.createElement("span");
  picker.className = "character-color-picker";
  picker.hidden = true;
  ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "keydown"].forEach((eventName) => {
    picker.addEventListener(eventName, (event) => event.stopPropagation());
  });

  const usedColors = new Set(state.characters.filter((candidate) => candidate.id !== character.id).map((candidate) => candidate.colorId));
  for (const color of CHARACTER_COLOR_PALETTE) {
    const colorButton = document.createElement("button");
    colorButton.type = "button";
    colorButton.className = "character-color-choice";
    colorButton.title = color.label;
    colorButton.disabled = usedColors.has(color.id);
    colorButton.style.setProperty("--character-color", color.value);
    colorButton.style.setProperty("background-color", color.value);
    colorButton.style.setProperty("background", color.value);
    colorButton.style.backgroundImage = "none";
    colorButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (colorButton.disabled) {
        return;
      }
      closeActiveColorPicker(picker);
      setDisplayCharacterColor(character, color);
      markUserActivity();
      updateCharactersUi();
      render();
    });
    picker.append(colorButton);
  }

  button.addEventListener("click", (event) => {
    if (event.button !== 0 && event.button !== undefined) {
      return;
    }
    const wasOpen = !picker.hidden;
    if (activeColorPicker?.picker && activeColorPicker.picker !== picker) {
      closeActiveColorPicker();
    }

    if (wasOpen) {
      closeActiveColorPicker(picker);
      return;
    }

    picker.hidden = false;
    document.body.append(picker);
    picker.classList.add("is-floating");
    const buttonRect = button.getBoundingClientRect();
    picker.style.left = `${buttonRect.left}px`;
    picker.style.top = `${buttonRect.bottom + 6}px`;
    activeColorPicker = {
      picker,
      anchor: wrap,
      home: wrap
    };
  });

  wrap.append(button, picker);
  return wrap;
}

let lastMousePosition = { x: 0, y: 0 };
let activeColorPicker = null;
const COLOR_PICKER_CLOSE_DISTANCE = 20;

function isPointerInActiveColorPickerBuffer(point) {
  if (!activeColorPicker?.picker || activeColorPicker.picker.hidden) {
    return false;
  }
  const pickerRect = activeColorPicker.picker.getBoundingClientRect();
  const anchorRect = activeColorPicker.anchor?.getBoundingClientRect?.() || pickerRect;
  const minX = Math.min(pickerRect.left, anchorRect.left) - COLOR_PICKER_CLOSE_DISTANCE;
  const maxX = Math.max(pickerRect.right, anchorRect.right) + COLOR_PICKER_CLOSE_DISTANCE;
  const minY = Math.min(pickerRect.top, anchorRect.top) - COLOR_PICKER_CLOSE_DISTANCE;
  const maxY = Math.max(pickerRect.bottom, anchorRect.bottom) + COLOR_PICKER_CLOSE_DISTANCE;
  return (
    point.x >= minX &&
    point.x <= maxX &&
    point.y >= minY &&
    point.y <= maxY
  );
}

function closeActiveColorPicker(expectedPicker = null) {
  if (!activeColorPicker?.picker) {
    return;
  }
  if (expectedPicker && activeColorPicker.picker !== expectedPicker) {
    return;
  }
  activeColorPicker.picker.hidden = true;
  activeColorPicker.picker.classList.remove("is-floating");
  activeColorPicker.picker.style.left = "";
  activeColorPicker.picker.style.top = "";
  if (activeColorPicker.home && activeColorPicker.picker.parentElement !== activeColorPicker.home) {
    activeColorPicker.home.append(activeColorPicker.picker);
  }
  activeColorPicker = null;
}

document.addEventListener("pointermove", (event) => {
  lastMousePosition = { x: event.clientX, y: event.clientY };
  if (activeColorPicker?.picker && !isPointerInActiveColorPickerBuffer(lastMousePosition)) {
    closeActiveColorPicker();
  }
});

function createMiniInlineNumberField(value, max, onChange) {
  const field = document.createElement("span");
  field.className = "character-mini-inline-field";
  ["click", "mousedown", "pointerdown", "keydown"].forEach((eventName) => {
    field.addEventListener(eventName, (event) => event.stopPropagation());
  });
  const controls = document.createElement("span");
  controls.className = "character-mini-spinner";
  const up = document.createElement("button");
  up.type = "button";
  up.textContent = "^";
  const down = document.createElement("button");
  down.type = "button";
  down.textContent = "v";
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = `${max}`;
  input.value = `${value}`;
  input.inputMode = "numeric";
  input.step = "1";
  const emitValue = () => {
    const parsed = Number.parseInt(input.value, 10);
    const next = Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : value;
    input.value = `${next}`;
    onChange(next);
  };
  input.addEventListener("change", emitValue);
  input.addEventListener("blur", emitValue);
  input.addEventListener("input", () => {
    const parsed = Number.parseInt(input.value, 10);
    const clamped = Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : value;
    if (parsed !== Number(input.value)) {
      input.value = `${clamped}`;
    }
    if (Number.isFinite(parsed)) {
      onChange(clamped);
    }
  });
  up.addEventListener("click", (event) => {
    event.stopPropagation();
    const next = Math.min(max, (Number(input.value) || 0) + 1);
    input.value = `${next}`;
    emitValue();
  });
  down.addEventListener("click", (event) => {
    event.stopPropagation();
    const next = Math.max(0, (Number(input.value) || 0) - 1);
    input.value = `${next}`;
    emitValue();
  });
  input.addEventListener("click", (event) => event.stopPropagation());
  controls.append(up, down);
  field.append(controls, input);
  return field;

}

function updateCharactersUi() {
  if (!state) {
    return;
  }
  if (activeColorPicker?.picker && !activeColorPicker.picker.hidden) {
    return;
  }
  normalizeCharacterState(state);
  applyCharacterAmmoOverrides();
  syncAllCharacterEquipmentDerivedStats();
  applyCharacterColorOverrides();
  ensureCharacterPresentation();
  ui.charactersList.innerHTML = "";
  ui.charactersEmpty.hidden = state.characters.length > 0;
  for (const character of state.characters) {
    ui.charactersList.append(renderCharacterCard(character));
  }
  ui.characterDetail.hidden = true;
  ui.characterDetail.innerHTML = "";
}

function openCharacterSheet(character) {
  if (!ui.characterSheetModal || !ui.characterSheetContent) {
    return;
  }
  const currentCharacter = getCurrentCharacter(character);
  if (!currentCharacter) {
    return;
  }
  renderCharacterDetail(currentCharacter, ui.characterSheetContent, { popout: true });
  ui.characterSheetModal.hidden = false;
  positionCharacterSheetModal();
}

function setCharacterMoneyFromCopper(character, copperValue) {
  const totalCopper = Math.max(0, Math.floor(Number(copperValue) || 0));
  setCharacterMoneyValue(character, "gold", Math.floor(totalCopper / 100));
  setCharacterMoneyValue(character, "silver", Math.floor((totalCopper % 100) / 10));
  setCharacterMoneyValue(character, "copper", totalCopper % 10);
}

function closeCharacterSheet() {
  if (!ui.characterSheetModal) {
    return;
  }
  closeActiveShopPanel();
  ui.characterSheetModal.hidden = true;
  characterSheetDrag = null;
}

function getCharacterSheetCard() {
  return ui.characterSheetModal?.querySelector(".character-sheet-modal") || null;
}

function clampCharacterSheetPosition(left, top) {
  const card = getCharacterSheetCard();
  if (!card) {
    return { left, top };
  }
  const margin = 12;
  const rect = card.getBoundingClientRect();
  const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
  return {
    left: Math.max(margin, Math.min(maxLeft, left)),
    top: Math.max(margin, Math.min(maxTop, top))
  };
}

function positionCharacterSheetModal() {
  const card = getCharacterSheetCard();
  if (!card) {
    return;
  }
  const rect = card.getBoundingClientRect();
  const fallback = {
    left: Math.max(12, (window.innerWidth - rect.width) / 2),
    top: 24
  };
  const position = characterSheetPosition || fallback;
  characterSheetPosition = clampCharacterSheetPosition(position.left, position.top);
  card.style.left = `${characterSheetPosition.left}px`;
  card.style.top = `${characterSheetPosition.top}px`;
}

function startCharacterSheetDrag(event) {
  const card = getCharacterSheetCard();
  if (!card || event.button !== 0 || event.target.closest("button, input, textarea, select, a")) {
    return;
  }
  const rect = card.getBoundingClientRect();
  characterSheetDrag = {
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top
  };
  card.classList.add("is-dragging");
  card.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function dragCharacterSheet(event) {
  if (!characterSheetDrag) {
    return;
  }
  characterSheetPosition = clampCharacterSheetPosition(
    event.clientX - characterSheetDrag.offsetX,
    event.clientY - characterSheetDrag.offsetY
  );
  const card = getCharacterSheetCard();
  if (card) {
    card.style.left = `${characterSheetPosition.left}px`;
    card.style.top = `${characterSheetPosition.top}px`;
  }
}

function stopCharacterSheetDrag() {
  if (!characterSheetDrag) {
    return;
  }
  const card = getCharacterSheetCard();
  card?.releasePointerCapture?.(characterSheetDrag.pointerId);
  card?.classList.remove("is-dragging");
  characterSheetDrag = null;
}

function createSheetField(label, value, options = {}) {
  const field = document.createElement("div");
  field.className = "sheet-field";
  const fieldLabel = document.createElement("div");
  fieldLabel.className = "sheet-field-label";
  fieldLabel.textContent = label;
  const fieldValue = options.editable ? document.createElement("input") : document.createElement("div");
  fieldValue.className = "sheet-field-value";
  if (options.editable) {
    fieldValue.type = "number";
    fieldValue.min = options.min ?? "0";
    fieldValue.max = options.max ?? "99";
    fieldValue.value = `${value ?? ""}`;
    fieldValue.addEventListener("change", () => {
      if (typeof options.onChange === "function") {
        options.onChange(fieldValue);
      }
    });
  } else {
    fieldValue.textContent = `${value ?? ""}`;
  }
  field.append(fieldLabel, fieldValue);
  return field;
}

function readBaseClassesOnlyPreference() {
  try {
    const storedValue = window.localStorage.getItem(BASE_CLASSES_ONLY_STORAGE_KEY);
    return storedValue === null ? true : storedValue === "true";
  } catch {
    return true;
  }
}

function writeBaseClassesOnlyPreference(isEnabled) {
  try {
    window.localStorage.setItem(BASE_CLASSES_ONLY_STORAGE_KEY, isEnabled ? "true" : "false");
  } catch {
    // Ignore storage failures in private browsing or locked-down environments.
  }
}

function syncBaseClassesOnlyToggleState(isEnabled) {
  if (!ui.baseClassesOnlyToggle) {
    return;
  }
  ui.baseClassesOnlyToggle.checked = Boolean(isEnabled);
  writeBaseClassesOnlyPreference(Boolean(isEnabled));
}

function getBaseClassesOnlyToggleState() {
  return Boolean(ui.baseClassesOnlyToggle?.checked);
}

async function setShadowdarklingsSourceSwitches(page, enabled) {
  for (const label of SHADOWDARKLINGS_SOURCE_SWITCHES) {
    const switchControl = page.getByRole("switch", { name: label });
    try {
      await switchControl.setChecked(enabled);
    } catch (error) {
      console.warn(`Unable to set ShadowDarklings source switch "${label}" to ${enabled ? "on" : "off"}.`, error);
    }
  }
}

async function importShadowdarklingsCharacterOneClick() {
  if (!state) {
    ui.charactersEmpty.hidden = false;
    ui.charactersEmpty.textContent = "Generate a dungeon first, then import characters.";
    return;
  }

  const livingCount = state.characters.filter((character) => character.dead !== true && character.slain !== true).length;
  const availableSlots = Math.max(0, MAX_SESSION_CHARACTERS - livingCount);
  if (!availableSlots) {
    ui.charactersEmpty.hidden = false;
    ui.charactersEmpty.textContent = "Maximum of 16 active characters reached.";
    return;
  }

  const importButton = ui.importCharacterBtn;
  const previousLabel = importButton?.textContent || "Import from ShadowDarklings";
  if (importButton) {
    importButton.disabled = true;
    importButton.textContent = "Importing...";
  }

  ui.charactersEmpty.hidden = false;
  ui.charactersEmpty.textContent = "A new character from ShadowDarklings enters the dungeon.";

  try {
    const characterJson = await importShadowdarklingsCharacter({
      baseClassesOnly: getBaseClassesOnlyToggleState()
    });
    const characters = extractShadowdarkCharacters(characterJson);
    if (!characters.length) {
      throw new Error("ShadowDarklings did not return usable character JSON.");
    }

    const importedCharacters = characters.slice(0, availableSlots);
    state.characters.push(...importedCharacters);
    normalizeCharacterState(state);
    ensureCharacterPresentation();
    state.run.dirty = true;
    markUserActivity();
    updatePanels();
    render();

    ui.charactersEmpty.hidden = state.characters.length > 0;
    ui.charactersEmpty.textContent = state.characters.length > 0 ? "" : "No characters imported yet.";
    setStatus(`Imported ${importedCharacters.length} character${importedCharacters.length === 1 ? "" : "s"} from ShadowDarklings.`);
  } catch (error) {
    ui.charactersEmpty.hidden = false;
    ui.charactersEmpty.textContent = error?.message || "ShadowDarklings import failed.";
    setStatus(ui.charactersEmpty.textContent);
  } finally {
    if (importButton) {
      importButton.disabled = false;
      importButton.textContent = previousLabel;
    }
  }
}

function findSpellRecord(name) {
  return spellLookup.get(normalizeSpellLookupKey(name)) || null;
}

function getSpellKey(spellOrName) {
  return normalizeSpellLookupKey(typeof spellOrName === "string" ? spellOrName : spellOrName?.name);
}

function ensureFailedSpellKeys(character) {
  if (!character) {
    return [];
  }
  if (!Array.isArray(character.failedSpellKeys)) {
    character.failedSpellKeys = [];
  }
  return character.failedSpellKeys;
}

function isCharacterSpellFailed(character, spellOrName) {
  const key = getSpellKey(spellOrName);
  return Boolean(key && ensureFailedSpellKeys(character).includes(key));
}

function markCharacterSpellFailed(character, spellOrName) {
  const key = getSpellKey(spellOrName);
  if (!key || !character) {
    return;
  }
  const failedSpellKeys = ensureFailedSpellKeys(character);
  if (!failedSpellKeys.includes(key)) {
    failedSpellKeys.push(key);
  }
}

function getSpellCastingAbility(character, spell) {
  const className = String(character?.className || "").toLowerCase();
  const spellClasses = Array.isArray(spell?.classes) ? spell.classes.map((entry) => String(entry).toLowerCase()) : [];
  if (className.includes("priest") || (spellClasses.includes("priest") && !className.includes("wizard"))) {
    return "WIS";
  }
  return "INT";
}

function getSpellCastingModifier(character, spell) {
  return abilityScoreModifier(character?.stats?.[getSpellCastingAbility(character, spell)]);
}

function getSpellCastingDc(spell) {
  return 10 + Math.max(0, Number(spell?.tier) || 0);
}

function characterHasSpellCastingAdvantage(character, spell) {
  const spellKey = getSpellKey(spell);
  if (!character || !spellKey) {
    return false;
  }
  if (spellKey === "magic missile") {
    return true;
  }
  const remappedMagicMissileAdvantage = getRemappedMagicMissileAdvantageSpell(character);
  if (remappedMagicMissileAdvantage && getSpellKey(remappedMagicMissileAdvantage) === spellKey) {
    const rawTalentText = JSON.stringify([
      character.levels || [],
      character.bonuses || [],
      character.raw?.levels || [],
      character.raw?.bonuses || []
    ]);
    if (/magic missile/i.test(rawTalentText) && /advantage|adv on cast|advoncastonespell/i.test(rawTalentText)) {
      return true;
    }
  }

  const advantageLines = buildTalentSpellLines(character).filter((line) => /gain advantage on casting/i.test(line));
  if (advantageLines.some((line) => normalizeSpellLookupKey(line).includes(spellKey))) {
    return true;
  }

  const rawTalentText = JSON.stringify([
    character.levels || [],
    character.bonuses || [],
    character.raw?.levels || [],
    character.raw?.bonuses || []
  ]);
  return /advantage|adv on cast/i.test(rawTalentText) && normalizeSpellLookupKey(rawTalentText).includes(spellKey);
}

function refreshOpenCharacterSheet(character) {
  updatePanels();
  if (!ui.characterSheetModal?.hidden && ui.characterSheetContent) {
    renderCharacterDetail(getCurrentCharacter(character), ui.characterSheetContent, { popout: true });
  }
}

function performSpellCast(character, spell) {
  const currentCharacter = getCurrentCharacter(character) || getActiveCharacter(state);
  if (!currentCharacter || !spell) {
    return;
  }

  const modifier = getSpellCastingModifier(currentCharacter, spell);
  const dc = getSpellCastingDc(spell);
  const hasAdvantage = characterHasSpellCastingAdvantage(currentCharacter, spell);
  const advantageLabel = hasAdvantage
    ? getSpellKey(spell) === "magic missile" ? "Magic Missile" : "Talent"
    : "";
  const result = rollCheck(modifier, { doubleRoll: hasAdvantage });
  const succeeded = result.total >= dc;
  const characterName = currentCharacter.name || "The caster";
  const message = succeeded
    ? `${characterName} casts ${spell.name}!`
    : `${characterName} fails to cast ${spell.name}!`;

  if (!succeeded) {
    markCharacterSpellFailed(currentCharacter, spell);
  } else if (getSpellKey(spell) === "light") {
    lightActiveCharacter("light-spell");
    recomputeVisibility(state);
  }

  markUserActivity();
  if (state?.run) {
    state.run.dirty = true;
  }
  setStatus(message);
  showCheckResult(result, "Spell", {
    headline: `${result.total} spell check`,
    message,
    context: {
      doubleRoll: hasAdvantage,
      advantageClass: advantageLabel
    }
  });
  refreshOpenCharacterSheet(currentCharacter);
  renderSpellDetail(spell, currentCharacter);
}

function setDamageDetailVisibility(visible) {
  if (!ui.damageDetail || !ui.damageExpandBtn) {
    return;
  }
  ui.damageDetail.hidden = !visible;
  ui.damageExpandBtn.textContent = visible ? "collapse" : "expand";
}

function formatSignedModifier(modifier) {
  const normalized = Number(modifier) || 0;
  return normalized >= 0 ? `+${normalized}` : `${normalized}`;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function formatTwoDigitInputValue(value) {
  const normalized = Number(value) || 0;
  const sign = normalized < 0 ? "-" : "";
  return `${sign}${String(Math.abs(normalized)).padStart(2, "0")}`;
}

function getDiceHistoryAgeLabel(index) {
  if (index === 0) {
    return "most recent";
  }
  if (index === 1) {
    return "1 roll ago";
  }
  return `${index} rolls ago`;
}

function renderDiceHistory() {
  if (!ui.diceHistory) {
    return;
  }
  if (ui.diceHistoryToggle) {
    ui.diceHistoryToggle.hidden = diceHistory.length === 0;
  }
  ui.diceHistory.innerHTML = "";
  diceHistory.forEach((entry, index) => {
    const item = document.createElement("li");
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `${getDiceHistoryAgeLabel(index)}: ${entry.label}`;
    const detail = document.createElement("div");
    detail.className = "dice-history-detail";
    detail.textContent = entry.detail || "";
    details.append(summary, detail);
    item.append(details);
    ui.diceHistory.append(item);
  });
}

function pushDiceHistory(label, detail) {
  diceHistory.unshift({ label, detail });
  diceHistory = diceHistory.slice(0, 100);
  renderDiceHistory();
}

function toggleDiceHistory() {
  if (!ui.diceHistory || !ui.diceHistoryToggle) {
    return;
  }
  const isOpening = ui.diceHistory.hidden;
  ui.diceHistory.hidden = !isOpening;
  ui.diceHistoryToggle.setAttribute("aria-expanded", `${isOpening}`);
  ui.diceHistoryToggle.textContent = isOpening ? "Hide Roll History" : "Roll History";
}

function rollManualDie(sides, count, modifier) {
  const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
  const diceTotal = rolls.reduce((sum, value) => sum + value, 0);
  return {
    kind: "manual",
    sides,
    count,
    modifier,
    rolls,
    total: diceTotal + modifier
  };
}

function applyManualDieRoll(button) {
  const sides = Number.parseInt(button.dataset.dieSides || "0", 10);
  if (!Number.isFinite(sides) || sides <= 0 || !ui.damageResult) {
    return;
  }
  const countInput = ui.manualDieCount;
  const modifierInput = ui.manualDieModifier;
  const count = clampNumber(countInput?.value, 1, 99, 1);
  const modifier = clampNumber(modifierInput?.value, -99, 99, 0);
  countInput.value = formatTwoDigitInputValue(count);
  modifierInput.value = formatTwoDigitInputValue(modifier);
  sizeControlField(countInput);
  sizeControlField(modifierInput);

  lastDamageRoll = rollManualDie(sides, count, modifier);
  const label = button.textContent.trim();
  ui.damageResult.textContent = `${lastDamageRoll.total}`;
  ui.damageContext.textContent = `${String(count).padStart(2, "0")} ${label} ${formatSignedModifier(modifier)}`;
  ui.damageExpandBtn.hidden = lastDamageRoll.rolls.length === 0;
  renderDamageDetail(lastDamageRoll);
  setDamageDetailVisibility(false);
  pushDiceHistory(`${lastDamageRoll.total}`, `${String(count).padStart(2, "0")} ${label} ${formatSignedModifier(modifier)}\n${lastDamageRoll.rolls.join(" + ")} = ${lastDamageRoll.total}`);
}

function resetManualDieControls() {
  if (ui.manualDieCount) {
    ui.manualDieCount.value = "01";
    sizeControlField(ui.manualDieCount);
  }
  if (ui.manualDieModifier) {
    ui.manualDieModifier.value = "00";
    sizeControlField(ui.manualDieModifier);
  }
}

function createCheckRollToken(value, kept = false) {
  const token = document.createElement(kept ? "strong" : "span");
  token.className = "damage-breakdown-term";
  if (value === 1) {
    token.classList.add("is-minimum");
  }
  if (value === 20) {
    token.classList.add("is-maximum");
  }
  token.textContent = `${value}`;
  return token;
}

function createStrongText(value) {
  const token = document.createElement("strong");
  token.textContent = value;
  return token;
}

function renderCheckDetail(roll) {
  const result = roll?.result;
  if (!result || !ui.damageDetail) {
    return;
  }

  const line = document.createElement("div");
  line.className = "damage-breakdown-line";
  const classNote = roll.advantageClass
    ? ` ${roll.advantageClass.charAt(0).toUpperCase()}${roll.advantageClass.slice(1)}`
    : "";
  const checkMode = result.checkMode === "disadvantage" ? "disadvantage" : result.secondaryRoll ? "advantage" : "";
  line.append(document.createTextNode(`${roll.actionLabel} check${checkMode ? ` at ${checkMode}${classNote}` : ""}: `));

  if (Number.isFinite(result.secondaryRoll)) {
    const kept = checkMode === "disadvantage"
      ? Math.min(result.firstRoll, result.secondaryRoll)
      : Math.max(result.firstRoll, result.secondaryRoll);
    line.append(createCheckRollToken(result.firstRoll, result.firstRoll === kept));
    line.append(document.createTextNode(", "));
    line.append(createCheckRollToken(result.secondaryRoll, result.secondaryRoll === kept));
  } else {
    line.append(createCheckRollToken(result.roll, true));
  }

  line.append(document.createTextNode(" "));
  line.append(createStrongText(formatSignedModifier(result.modifier)));
  line.append(document.createTextNode(" = "));
  line.append(createStrongText(`${result.total}`));
  ui.damageDetail.append(line);
}

function renderDamageDetail(roll) {
  if (!ui.damageDetail) {
    return;
  }
  ui.damageDetail.innerHTML = "";
  if (!roll) {
    ui.damageDetail.hidden = true;
    return;
  }
  if (roll.kind === "check") {
    renderCheckDetail(roll);
    return;
  }
  if (roll.kind === "manual") {
    const line = document.createElement("div");
    line.className = "damage-breakdown-line";
    roll.rolls.forEach((value, index) => {
      if (index > 0) {
        line.append(document.createTextNode(" + "));
      }
      const token = document.createElement("span");
      token.className = "damage-breakdown-term";
      if (value === 1) {
        token.classList.add("is-minimum");
      }
      if (value === roll.sides) {
        token.classList.add("is-maximum");
      }
      token.textContent = `${value}`;
      line.append(token);
    });
    if (roll.modifier !== 0) {
      line.append(document.createTextNode(roll.modifier > 0 ? ` + ${roll.modifier}` : ` - ${Math.abs(roll.modifier)}`));
    }
    line.append(document.createTextNode(` = ${roll.total}`));
    ui.damageDetail.append(line);
    return;
  }

  const line = document.createElement("div");
  line.className = "damage-breakdown-line";
  roll.terms.forEach((term, index) => {
    if (index > 0) {
      line.append(document.createTextNode(term.sign < 0 ? " - " : " + "));
    } else if (term.sign < 0) {
      line.append(document.createTextNode("-"));
    }

    if (term.type === "die") {
      const token = document.createElement("span");
      token.className = "damage-breakdown-term";
      if (term.isMinimum) {
        token.classList.add("is-minimum");
      }
      if (term.isMaximum) {
        token.classList.add("is-maximum");
      }
      token.textContent = `${term.label}: ${term.value}`;
      line.append(token);
      return;
    }

    line.append(document.createTextNode(String(term.value)));
  });

  if (roll.multiplier > 1) {
    line.append(document.createTextNode(`, then x ${roll.multiplier}`));
  }
  line.append(document.createTextNode(` = ${roll.total}`));
  ui.damageDetail.append(line);
}

function applyDamageRoll(reference, sourceLabel = "", options = {}) {
  const expression = normalizeDamageExpression(reference?.expression);
  if (!expression || !ui.damageResult) {
    return;
  }
  const roll = rollDamageExpression(expression);
  lastDamageRoll = {
    ...roll,
    display: reference?.display || expression,
    sourceLabel
  };
  ui.damageResult.textContent = `${roll.total} ${options.resultLabel || "Damage"}`;
  ui.damageContext.textContent = sourceLabel
    ? `${sourceLabel}: ${reference?.display || expression}`
    : (reference?.display || expression);
  ui.damageExpandBtn.hidden = roll.terms.length === 0;
  renderDamageDetail(lastDamageRoll);
  setDamageDetailVisibility(false);
  pushDiceHistory(`${roll.total} ${options.resultLabel || "Damage"}`, [sourceLabel, reference?.display || expression].filter(Boolean).join("\n"));
}

function parseSpellCheckModifier(expression, character, contextText) {
  const normalized = normalizeDamageExpression(expression);
  const modifierMatch = normalized.match(/^1d20([+\-]\d+)?$/i);
  if (modifierMatch) {
    return Number.parseInt(modifierMatch[1] || "0", 10) || 0;
  }
  if (/\bpriest\s+spell\b/i.test(contextText)) {
    return abilityScoreModifier(character?.stats?.WIS);
  }
  if (/\bwizard\s+spell\b/i.test(contextText)) {
    return abilityScoreModifier(character?.stats?.INT);
  }
  return 0;
}

function parseGenericSpellTier(contextText) {
  const tierMatch = String(contextText || "").match(/\bTier\s+(\d+)\b/i);
  return Math.max(1, Number.parseInt(tierMatch?.[1] || "1", 10) || 1);
}

function applyGenericSpellCheck(reference, options = {}) {
  if (!ui.damageResult) {
    return;
  }
  const contextText = String(options.contextText || reference?.context || "");
  const character = getCurrentCharacter(options.character) || getActiveCharacter(state);
  const tier = parseGenericSpellTier(contextText);
  const modifier = parseSpellCheckModifier(reference?.expression, character, contextText);
  const result = rollCheck(modifier);
  const characterName = character?.name || "The caster";
  const succeeded = result.total >= 10 + tier;
  const message = succeeded
    ? `${characterName} casts a Tier ${tier} spell!`
    : `${characterName} fails to cast a Tier ${tier} spell`;

  markUserActivity();
  setStatus(message);
  showCheckResult(result, "Spell", {
    headline: `${result.total} spell check:`,
    message
  });
}

function shouldTreatAsSpellCheck(reference, text, options = {}) {
  const expression = normalizeDamageExpression(reference?.expression);
  return (
    options.spellCheck === true ||
    (
      /^1d20(?:[+\-]\d+)?$/i.test(expression) &&
      /\b(?:wizard|priest)\s+spell\b/i.test(String(text || reference?.context || ""))
    )
  );
}

function createDamageButton(reference, options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "damage-token";
  button.textContent = options.label || reference.expression;
  button.title = `Roll ${reference.display || reference.expression}`;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (options.spellCheck) {
      applyGenericSpellCheck(reference, options);
      return;
    }
    applyDamageRoll(reference, options.sourceLabel || "", {
      resultLabel: "Damage"
    });
  });
  return button;
}

function appendDamageAwareText(target, text, options = {}) {
  const value = String(text || "");
  const references = Array.isArray(options.references) && options.references.length
    ? options.references
    : extractDamageReferences(value, { preferDeathLabel: options.preferDeathLabel === true });
  if (!references.length) {
    target.append(document.createTextNode(value));
    return;
  }

  const referenceMap = new Map();
  references.forEach((reference) => {
    const key = normalizeDamageExpression(reference.expression);
    if (key && !referenceMap.has(key)) {
      referenceMap.set(key, reference);
    }
  });

  let cursor = 0;
  for (const match of value.matchAll(/\b(?:\d+d\d+(?:\s*(?:\+\s*\d+|x\s*\d+|\*\s*\d+))*|d\d+)\b/gi)) {
    const matchText = match[0];
    const index = match.index ?? 0;
    if (index > cursor) {
      target.append(document.createTextNode(value.slice(cursor, index)));
    }
    const expression = normalizeDamageExpression(matchText);
    const reference = referenceMap.get(expression) || {
      expression,
      display: expression,
      context: value
    };
    const spellCheck = shouldTreatAsSpellCheck(reference, value, options);
    target.append(createDamageButton(reference, {
      label: matchText,
      sourceLabel: options.sourceLabel || "",
      spellCheck,
      contextText: value,
      character: options.character
    }));
    cursor = index + matchText.length;
  }

  if (cursor < value.length) {
    target.append(document.createTextNode(value.slice(cursor)));
  }
}

function createDamageAwareLine(text, options = {}) {
  const content = document.createElement("span");
  appendDamageAwareText(content, text, options);
  return content;
}

function renderSpellDetail(spell, character) {
  const currentCharacter = getCurrentCharacter(character) || getActiveCharacter(state);
  const failed = isCharacterSpellFailed(currentCharacter, spell);
  ui.spellDetailTitle.textContent = spell.name.toUpperCase();
  ui.spellDetailTitle.classList.toggle("is-spell-lost", failed);
  ui.spellDetailMeta.textContent = `Tier ${spell.tier}, ${spell.classes.join(", ")}`;
  ui.spellDetailDuration.textContent = spell.duration || "Unknown";
  ui.spellDetailRange.textContent = spell.range || "Unknown";
  ui.spellDetailBody.innerHTML = "";

  if (!failed && currentCharacter) {
    const castActions = document.createElement("div");
    castActions.className = "spell-detail-actions";
    const castButton = document.createElement("button");
    castButton.type = "button";
    castButton.className = "spell-cast-button";
    castButton.textContent = "Cast";
    castButton.title = `Cast ${spell.name} against DC ${getSpellCastingDc(spell)}`;
    castButton.addEventListener("click", () => performSpellCast(currentCharacter, spell));
    castActions.append(castButton);
    ui.spellDetailBody.append(castActions);
  }

  spell.paragraphs.forEach((paragraph) => {
    const item = document.createElement("p");
    appendDamageAwareText(item, paragraph, {
      references: (spell.damage || []).filter((reference) => paragraph.includes(reference.expression) || reference.context.includes(reference.expression)),
      preferDeathLabel: true,
      sourceLabel: spell.name
    });
    ui.spellDetailBody.append(item);
  });
  if (currentCharacter && characterHasSpellCastingAdvantage(currentCharacter, spell)) {
    const advantageNote = document.createElement("p");
    advantageNote.className = "spell-advantage-note";
    advantageNote.textContent = "You have advantage on casting this spell.";
    ui.spellDetailBody.append(advantageNote);
  }
  ui.spellDetailModal.hidden = false;
}

function createSpellButton(spellName, options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "spell-link-button";
  button.textContent = spellName;
  if (isCharacterSpellFailed(options.character, spellName)) {
    button.classList.add("is-spell-lost");
  }
  button.addEventListener("click", async () => {
    await ensureSpellLibraryLoaded();
    const spell = findSpellRecord(spellName);
    if (!spell) {
      setStatus(`No spell details found for ${spellName}.`);
      return;
    }
    renderSpellDetail(spell, options.character);
  });
  return button;
}

function createSpellSummaryLine(text, character) {
  const container = document.createElement("div");
  container.className = "sd-spell-summary-line";
  const prefix = document.createElement("strong");
  prefix.className = "sd-line-prefix";
  prefix.textContent = "Spells:";
  container.append(prefix, document.createTextNode(" "));

  const payload = String(text || "").replace(/^Spells:\s*/i, "").trim();
  if (!payload || /^none$/i.test(payload)) {
    container.append(document.createTextNode("None"));
    return container;
  }

  const groups = payload.split(/\s*;\s*/).filter(Boolean);
  groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) {
      container.append(document.createTextNode("; "));
    }
    const match = group.match(/^\(Tier\s+(\d+)\):\s*(.+)$/i);
    const tier = match?.[1] || "";
    const names = (match?.[2] || group)
      .split(/\s*,\s*/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (tier) {
      const tierLabel = document.createElement("span");
      tierLabel.className = "sd-spell-tier-label";
      tierLabel.textContent = `Tier ${tier}`;
      container.append(tierLabel, document.createTextNode(": "));
    }
    names.forEach((name, index) => {
      if (index > 0) {
        container.append(document.createTextNode(", "));
      }
      container.append(createSpellButton(name, { character, tier }));
    });
  });

  return container;
}

function createSdField(label, value, className = "") {
  const field = document.createElement("section");
  field.className = ["sd-sheet-field", className].filter(Boolean).join(" ");
  const heading = document.createElement("h3");
  heading.textContent = label;
  const content = document.createElement("div");
  content.className = "sd-sheet-value";
  content.textContent = `${value ?? ""}`;
  field.append(heading, content);
  return field;
}

function buildSheetLines(lines, minimumLines = 1) {
  const block = document.createElement("div");
  block.className = "sd-lined-block";
  const normalized = lines.filter((line) => {
    if (line instanceof Node) {
      return true;
    }
    return String(line || "").trim().length > 0;
  });
  while (normalized.length < minimumLines) {
    normalized.push("");
  }
  for (const line of normalized) {
    const row = document.createElement("div");
    if (line instanceof Node) {
      row.append(line);
    } else {
      row.textContent = line;
    }
    block.append(row);
  }
  return block;
}

function createSdPanel(title, content, className = "") {
  const panel = document.createElement("section");
  panel.className = ["sd-sheet-panel", className].filter(Boolean).join(" ");
  const heading = document.createElement("h3");
  heading.textContent = title;
  panel.append(heading, content);
  return panel;
}

function createSdGearPanel(character) {
  const panel = document.createElement("section");
  panel.className = "sd-sheet-panel sd-gear-panel";
  const headingRow = document.createElement("div");
  headingRow.className = "sd-gear-heading-row";
  const heading = document.createElement("h3");
  heading.textContent = "Gear";
  const coinFields = document.createElement("div");
  coinFields.className = "sd-coin-fields";

  const coinFieldConfigs = [
    ["GP", "gold"],
    ["SP", "silver"],
    ["CP", "copper"]
  ];
  for (const [label, key] of coinFieldConfigs) {
    const field = document.createElement("label");
    field.className = "sd-coin-field";
    const fieldLabel = document.createElement("span");
    fieldLabel.textContent = label;
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = `${getCharacterMoney(character, key)}`;
    input.step = "1";
    input.value = `${getCharacterMoney(character, key)}`;
    input.addEventListener("input", () => {
      const currentCharacter = getCurrentCharacter(character);
      if (!currentCharacter) {
        return;
      }
      const nextValue = updateCharacterMoneyField(currentCharacter, key, input.value);
      input.value = `${nextValue}`;
      input.max = `${nextValue}`;
    });
    field.append(fieldLabel, input);
    coinFields.append(field);
  }
  headingRow.append(heading, coinFields);

  const gearBody = document.createElement("div");
  gearBody.className = "sd-gear-body";

  const rows = document.createElement("div");
  rows.className = "sd-gear-lines";
  const { slots, freeCarry } = getCharacterGearSlots(character, {
    maxSlots: 20,
    excludeBackpack: true
  });
  let litGearMarkerRendered = false;
  rows.style.setProperty("--gear-row-count", `${Math.ceil(slots.length / 2)}`);
  slots.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = entry.available ? "" : "sd-gear-slot-unavailable";
    const item = Number.isInteger(entry.gearIndex) && Array.isArray(character.gear) ? character.gear[entry.gearIndex] : null;
    if (entry.text && entry.primary && Number.isInteger(entry.gearIndex)) {
      row.classList.add("sd-gear-row-has-drop");
      row.tabIndex = 0;
      row.title = "Click or hover to drop this gear.";
      row.addEventListener("click", (event) => {
        event.stopPropagation();
        rows.querySelectorAll(".is-drop-open").forEach((openRow) => {
          if (openRow !== row) {
            openRow.classList.remove("is-drop-open");
          }
        });
        row.classList.toggle("is-drop-open");
      });
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        row.classList.toggle("is-drop-open");
      });
    }
    const label = document.createElement("span");
    label.className = "sd-gear-line-label";
    if (item) {
      const hoverNote = getGearHoverNote(item);
      if (hoverNote) {
        label.title = hoverNote;
      }
      if (isShieldItem(item) && characterHasVersatileWeapon(character) && character.shieldReadied === false) {
        label.classList.add("is-gear-unreadied");
      }
    }
    label.append(document.createTextNode(`${index + 1}. ${entry.text || ""}`));
    if (
      entry.text &&
      entry.primary &&
      item &&
      Number(character.lightRadius) > 0 &&
      entry.gearIndex === getLitGearIndex(character) &&
      isLightGearItem(item, character.lightSource) &&
      litGearMarkerRendered === false
    ) {
      label.append(document.createTextNode(" "), createLightSourceMarker(character.lightSource));
      litGearMarkerRendered = true;
    }
    row.append(label);
    if (entry.text && entry.primary && item && isShieldItem(item) && characterHasVersatileWeapon(character)) {
      const shieldToggle = document.createElement("label");
      shieldToggle.className = "sd-gear-shield-toggle";
      shieldToggle.title = "Ready shield: adds shield AC and uses the smaller versatile weapon die.";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = character.shieldReadied !== false;
      checkbox.addEventListener("click", (event) => event.stopPropagation());
      checkbox.addEventListener("change", (event) => {
        event.stopPropagation();
        const currentCharacter = getCurrentCharacter(character);
        currentCharacter.shieldReadied = checkbox.checked;
        currentCharacter.raw = currentCharacter.raw || {};
        currentCharacter.raw.shieldReadied = checkbox.checked;
        syncCharacterEquipmentDerivedStats(currentCharacter);
        markUserActivity();
        setStatus(`${currentCharacter.name || "Character"} ${checkbox.checked ? "readies" : "slings"} their shield.`);
        refreshCharacterViews(currentCharacter);
        render();
        updatePanels();
      });
      shieldToggle.append(checkbox, document.createTextNode("ready"));
      row.append(shieldToggle);
    }
    if (entry.text && entry.primary && Number.isInteger(entry.gearIndex)) {
      const dropButton = document.createElement("button");
      dropButton.type = "button";
      dropButton.className = "sd-gear-drop-button";
      dropButton.textContent = "Drop";
      dropButton.addEventListener("click", (event) => {
        event.stopPropagation();
        const currentCharacter = getCurrentCharacter(character);
        const result = dropCharacterGear(currentCharacter, entry.gearIndex);
        markUserActivity();
        setStatus(result);
        refreshCharacterViews(currentCharacter);
        render();
        updatePanels();
      });
      row.append(dropButton);
    }
    rows.append(row);
  });
  const freeCarryPanel = document.createElement("div");
  freeCarryPanel.className = "sd-free-carry";
  const freeCarryHeading = document.createElement("h3");
  freeCarryHeading.textContent = "FREE TO CARRY";
  const freeCarryLines = document.createElement("div");
  freeCarryLines.className = "sd-free-carry-lines";
  const freeCarryDisplay = freeCarry;
  for (let index = 0; index < 10; index += 1) {
    const line = document.createElement("div");
    line.textContent = freeCarryDisplay[index] || "";
    freeCarryLines.append(line);
  }
  freeCarryPanel.append(freeCarryHeading, freeCarryLines);

  gearBody.append(rows, freeCarryPanel);
  panel.append(headingRow, gearBody);
  return panel;
}

function createStatBox(label, value) {
  const box = document.createElement("div");
  box.className = "stat-box";
  const heading = document.createElement("div");
  heading.className = "stat-box-label";
  heading.textContent = label;
  const statValue = document.createElement("div");
  statValue.className = "stat-box-value";
  statValue.textContent = `${value ?? ""}`;
  box.append(heading, statValue);
  return box;
}

function createSheetPanel(title, content) {
  const panel = document.createElement("section");
  panel.className = "sheet-panel";
  const heading = document.createElement("h3");
  heading.textContent = title;
  panel.append(heading, content);
  return panel;
}

function buildListBlock(items) {
  const list = document.createElement("div");
  list.className = "sheet-list-block";
  const filtered = items.filter((item) => Boolean(item && String(item).trim()));
  if (!filtered.length) {
    list.textContent = "None";
    return list;
  }
  for (const item of filtered) {
    const line = document.createElement("div");
    line.textContent = item;
    list.append(line);
  }
  return list;
}

function buildTextBlock(text) {
  const block = document.createElement("div");
  block.className = "sheet-text-block";
  block.textContent = text || "None";
  return block;
}

function createCompactInputField(label, value, max, onChange) {
  const field = document.createElement("label");
  field.className = "compact-input-field";
  const text = document.createElement("span");
  text.textContent = label;
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = `${max}`;
  input.value = `${value}`;
  input.addEventListener("change", () => onChange(input.value));
  field.append(text, input);
  return field;
}

function getLootCoinCount(loot) {
  return Math.max(0, Number(loot?.coinBreakdown?.gold || 0))
    + Math.max(0, Number(loot?.coinBreakdown?.silver || 0))
    + Math.max(0, Number(loot?.coinBreakdown?.copper || 0));
}

function formatRoomLootButtonText(loot) {
  const slotCount = Math.max(1, Number(loot?.slots || 1) || 1);
  const slotText = `${slotCount} slot${slotCount === 1 ? "" : "s"}`;
  if (loot?.coinBreakdown) {
    const label = loot.name || "coin bag";
    return getLootCoinCount(loot) > 100 ? `${label} (${slotText})` : label;
  }
  if (loot?.subtype === "dropped-equipment") {
    return `${loot.name || "equipment"} (${slotText})`;
  }
  return `Get: ${loot?.name || "treasure"} (${slotText})`;
}

function updateRoomLootPanel() {
  ui.roomLootPanel.innerHTML = "";
  const roomLoot = getRoomLoot(state);
  const treasureLoot = roomLoot.filter((loot) => loot.subtype !== "dropped-equipment");
  const roomFeatures = state.entities.filter((entity) => (
    entity.type === "feature" &&
    entity.worthlessLoot !== true &&
    entity.subtype !== "room-feature" &&
    entity.subtype !== "door" &&
    entity.visible !== false &&
    entity.roomId === state.player.roomId
  ));
  if (!state.player.roomId || (roomLoot.length === 0 && roomFeatures.length === 0)) {
    ui.roomLootPanel.textContent = "No revealed treasure or features in this room.";
    return;
  }

  if (treasureLoot.length > 1) {
    const lootAllButton = document.createElement("button");
    lootAllButton.type = "button";
    lootAllButton.textContent = "Get All";
    lootAllButton.addEventListener("click", () => {
      const result = collectRoomLoot(state);
      normalizeCharacterState(state);
      syncAllCharacterEquipmentDerivedStats();
      syncPlayerLightFromActiveCharacter();
      markUserActivity();
      setStatus(result.message || result);
      render();
      updatePanels();
      maybeShowFullyLooted();
    });
    ui.roomLootPanel.append(lootAllButton);
  }

  for (const loot of roomLoot) {
    const lootButton = document.createElement("button");
    lootButton.type = "button";
    const isDroppedEquipment = loot.subtype === "dropped-equipment";
    lootButton.textContent = formatRoomLootButtonText(loot);
    lootButton.addEventListener("click", () => {
      const activeCharacter = getActiveCharacter(state);
      const result = isDroppedEquipment
        ? pickupDroppedEquipment(loot)
        : collectLoot(state, loot.id);
      if (result.collected || result.message?.startsWith?.("Got:") || isDroppedEquipment) {
        normalizeCharacterState(state);
        syncAllCharacterEquipmentDerivedStats();
        syncPlayerLightFromActiveCharacter();
        if (activeCharacter) {
          refreshCharacterViews(activeCharacter);
        }
      }
      markUserActivity();
      setStatus(result.message || result);
      render();
      updatePanels();
      maybeShowFullyLooted();
    });
    ui.roomLootPanel.append(lootButton);
  }

  for (const feature of roomFeatures) {
    const card = document.createElement("article");
    card.className = "trap-card";
    const title = document.createElement("h3");
    title.textContent = feature.name || "Dungeon feature";
    card.append(title);
    ui.roomLootPanel.append(card);
  }
}

function createStatRow(term, value, options = {}) {
  const fragment = document.createDocumentFragment();
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  const displayValue = value || "unknown";
  if (options.damageAware) {
    appendDamageAwareText(dd, displayValue, {
      sourceLabel: options.sourceLabel || term,
      references: options.references
    });
  } else {
    dd.textContent = displayValue;
  }
  fragment.append(dt, dd);
  return fragment;
}

function createMonsterAttackStatRow(monster) {
  const fragment = document.createDocumentFragment();
  const dt = document.createElement("dt");
  dt.textContent = "ATK";
  const dd = document.createElement("dd");
  dd.append(createMonsterAttackContent(monster));
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
      createMonsterAttackStatRow(monster)
    );
    card.append(stats);

    const hpControls = document.createElement("div");
    hpControls.className = "monster-hp-controls";
    const hpLabel = document.createElement("span");
    hpLabel.textContent = "HP";
    const minusButton = document.createElement("button");
    minusButton.type = "button";
    minusButton.textContent = "-";
    const hpInput = document.createElement("input");
    hpInput.type = "number";
    hpInput.min = "0";
    hpInput.max = "999";
    hpInput.value = `${Math.max(0, Number(monster.hp) || 0)}`;
    hpInput.setAttribute("aria-label", `${monster.name || "Monster"} HP`);
    const plusButton = document.createElement("button");
    plusButton.type = "button";
    plusButton.textContent = "+";
    const applyMonsterHp = (nextHp) => {
      monster.hp = Math.max(0, Math.min(999, Number.parseInt(nextHp, 10) || 0));
      if (monster.hp <= 0) {
        const result = defeatMonster(state, monster);
        setStatus(result.message);
      } else {
        setStatus(`${monster.name || "Monster"} HP set to ${monster.hp}.`);
      }
      markUserActivity();
      markRunDirty();
      render();
      updatePanels();
    };
    minusButton.addEventListener("click", () => applyMonsterHp((Number(monster.hp) || 0) - 1));
    plusButton.addEventListener("click", () => applyMonsterHp((Number(monster.hp) || 0) + 1));
    hpInput.addEventListener("change", () => applyMonsterHp(hpInput.value));
    hpControls.append(hpLabel, minusButton, hpInput, plusButton);
    card.append(hpControls);

    const abilityEntries = Object.entries(monster.abilities || {});
    if (abilityEntries.length) {
      const abilities = document.createElement("ul");
      for (const [name, description] of abilityEntries) {
        const ability = document.createElement("li");
        appendDamageAwareText(ability, `${name.replaceAll("*", "")}: ${description}`, {
          sourceLabel: `${monster.name} ability`
        });
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
      createStatRow("Effect", trap.effect, {
        damageAware: true,
        sourceLabel: trap.name
      }),
      createStatRow("Trap DC", trap.dc),
      createStatRow("State", stateLabel)
    );
    card.append(stats);

    if (!trap.triggered && !trap.disarmed) {
      const disarmButton = document.createElement("button");
      disarmButton.type = "button";
      disarmButton.textContent = "Disarm?";
      disarmButton.addEventListener("click", () => {
        const context = getCharacterActionContext("disarm");
        const result = disarmTrap(state, trap.id, context.modifier, { doubleRoll: context.doubleRoll });
        const message = createDisarmResultMessage(result);
        markUserActivity();
        setStatus(message);
        showCheckResult(result, "Disarm", {
          headline: `Disarm ${result.total}`,
          message,
          context
        });
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
  updateCharactersUi();
  updateLightControlUi();
  updateRoomLootPanel();
  updateMonsterPanel();
  updateTrapPanel();
  updateTrapActionUi();
  renderMultiplayerUi();
}

function maybeShowFullyLooted() {
  if (state.lootLog.fullyLootedShown) {
    return;
  }
  const hasUncollectedTreasure = state.entities.some((entity) => {
    return entity.type === "treasure" && entity.subtype !== "dropped-equipment" && !entity.collected;
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
  if (!ui.searchModifierInput) {
    return 0;
  }
  const modifier = Math.max(
    MIN_SEARCH_MODIFIER,
    Math.min(MAX_SEARCH_MODIFIER, Number(ui.searchModifierInput.value || 0))
  );
  ui.searchModifierInput.value = `${modifier}`;
  sizeControlField(ui.searchModifierInput);
  return modifier;
}

function formatRollTooltip(result, action) {
  return `roll ${formatRollText(result)} = ${result.total} for ${action}`;
}

function showCheckResult(result, action = "check", options = {}) {
  if (!result || !ui.damageResult) {
    return;
  }
  const actionLabel = options.actionLabel || action;
  ui.damageResult.textContent = options.headline || `${actionLabel} ${result.total}`;
  ui.damageContext.textContent = options.message || result.message || actionLabel;
  lastDamageRoll = {
    kind: "check",
    actionLabel,
    result,
    advantageClass: options.context?.doubleRoll ? options.context?.advantageClass : ""
  };
  if (ui.damageExpandBtn) {
    ui.damageExpandBtn.hidden = !Number.isFinite(result.roll) || result.roll <= 0;
  }
  renderDamageDetail(lastDamageRoll);
  pushDiceHistory(`${actionLabel} ${result.total}`, options.message || result.message || formatRollText(result));
  setDamageDetailVisibility(false);
}

function getCharacterDisplayName(character) {
  return character?.name || "The selected character";
}

function getFoundEntityType(entity) {
  if (!entity) {
    return "nothing";
  }
  if (entity.type === "treasure") {
    return "treasure";
  }
  if (entity.type === "trap") {
    return "trap";
  }
  return entity.type || "something";
}

function createDisarmResultMessage(result) {
  if (result.disarmed) {
    return `Disarm: ${result.total}. You disarm the trap!`;
  }
  if (result.triggered) {
    return `Disarm ${result.total} you have set off the trap!`;
  }
  return `Disarm ${result.total} you fail to disarm the trap, but it doesn't go off.`;
}

function applyTorchAdvance(result) {
  if (result.crossedWanderingChecks) {
    processWanderingChecks(result.crossedWanderingChecks);
  }
  if (result.expired) {
    setStatus(expireActiveLightFromTimer());
  }
}

function performSearch() {
  if (!state) {
    return;
  }
  const context = getCharacterActionContext("search");
  const result = searchForTraps(state, context.modifier, { doubleRoll: context.doubleRoll });
  const characterName = getCharacterDisplayName(context.character);
  const foundTypes = [...new Set((result.found || []).map(getFoundEntityType))];
  const foundTypeText = foundTypes.length ? foundTypes.join(" and ") : "nothing";
  const message = result.darknessMessage
    ? result.darknessMessage
    : result.found?.length
      ? `Search ${result.total}. ${characterName} finds ${foundTypeText}!`
      : `Search ${result.total}. ${characterName} finds nothing.`;
  markUserActivity();
  setStatus(message);
  showCheckResult(result, "Search", {
    headline: `Search ${result.total}`,
    message,
    context
  });
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
  const result = loot
    ? loot.subtype === "dropped-equipment"
      ? pickupDroppedEquipment(loot)
      : collectLoot(state, loot.id)
    : { message: "No revealed treasure to get." };
  if (loot && loot.subtype !== "dropped-equipment") {
    normalizeCharacterState(state);
    syncAllCharacterEquipmentDerivedStats();
    syncPlayerLightFromActiveCharacter();
  }
  markUserActivity();
  setStatus(result.message || result);
  render();
  updatePanels();
  maybeShowFullyLooted();
}

function performLeave() {
  if (!state) {
    return;
  }
  const character = getActiveCharacter(state);
  const treasureIndex = Array.isArray(character?.gear)
    ? character.gear.findIndex((item) => item?.treasureItem === true)
    : -1;
  const gearIndex = treasureIndex >= 0 ? treasureIndex : 0;
  const result = character && gearIndex >= 0 && Array.isArray(character.gear) && character.gear[gearIndex]
    ? dropCharacterGear(character, gearIndex)
    : { message: "No carried treasure to leave." };
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
  const context = getCharacterActionContext("disarm");
  const result = disarmTrap(state, trap.id, context.modifier, { doubleRoll: context.doubleRoll });
  const message = createDisarmResultMessage(result);
  markUserActivity();
  setStatus(message);
  showCheckResult(result, "Disarm", {
    headline: `Disarm ${result.total}`,
    message,
    context
  });
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

function formatSavedCharacterName(character) {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const date = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${String(now.getFullYear()).slice(-2)}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}`;
  return `${character?.name || "Character"}_${date}_${time}`;
}

async function saveCharacterSnapshot(character) {
  const currentCharacter = getCurrentCharacter(character);
  if (!currentCharacter) {
    return;
  }
  const saveButton = ui.characterSheetContent?.querySelector(".sd-save-character-button");
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = "SAVING...";
  }
  try {
    const result = await createSavedCharacter(formatSavedCharacterName(currentCharacter), currentCharacter);
    setStatus(`Saved character ${result.name || currentCharacter.name}.`);
  } catch (error) {
    setStatus(error.message);
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = `SAVE CHARACTER`;
    }
  }
}

async function refreshSavedCharacters() {
  ui.saveLoadStatus.textContent = "Loading saved characters...";
  ui.savedRunsList.innerHTML = "";
  try {
    saveDialog.characters = await listSavedCharacters();
    ui.saveLoadStatus.textContent = saveDialog.characters.length ? "" : "No saved characters yet.";
  } catch (error) {
    saveDialog.characters = [];
    ui.saveLoadStatus.textContent = error.message;
  }
  renderSavedCharactersList();
}

function renderSavedCharactersList() {
  ui.savedRunsList.innerHTML = "";
  for (const character of saveDialog.characters || []) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "saved-run-button";
    const label = document.createElement("span");
    label.textContent = character.name || "Saved character";
    const meta = document.createElement("span");
    meta.className = "saved-run-meta";
    meta.textContent = character.updated_at ? new Date(character.updated_at).toLocaleString() : "";
    button.append(label, meta);
    button.addEventListener("click", () => loadSelectedCharacter(character));
    ui.savedRunsList.append(button);
  }
}

async function loadSelectedCharacter(savedCharacter) {
  ui.saveLoadStatus.textContent = "Loading character...";
  try {
    const loaded = savedCharacter.character_json ? savedCharacter : await loadSavedCharacter(savedCharacter.id);
    const [character] = extractShadowdarkCharacters(JSON.stringify(loaded.character_json));
    if (!character) {
      throw new Error("Saved character did not include usable character data.");
    }
    state.characters.push(character);
    state.activeCharacterId = character.id;
    normalizeCharacterState(state);
    applyCharacterAmmoOverrides();
    syncAllCharacterEquipmentDerivedStats();
    applyCharacterColorOverrides();
    ensureCharacterPresentation();
    syncPlayerLightFromActiveCharacter();
    recomputeVisibility(state);
    markUserActivity();
    updateCharactersUi();
    render();
    updatePanels();
    closeSaveLoadModal();
    setStatus(`Loaded character ${character.name || "saved character"}.`);
  } catch (error) {
    ui.saveLoadStatus.textContent = error.message;
  }
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
    characters: [],
    pendingRun: null
  };
  ui.saveLoadTitle.textContent = mode === "save"
    ? "Save Run"
    : mode === "load-character"
      ? "Load Character"
      : "Load Run";
  ui.saveNameRow.hidden = mode !== "save";
  ui.saveModalSubmit.hidden = mode !== "save";
  ui.saveNameInput.value = normalizeSaveName(state.run?.name || "");
  ui.overwriteConfirmation.hidden = true;
  ui.replaceConfirmation.hidden = true;
  ui.saveLoadModal.hidden = false;
  if (mode === "load-character") {
    await refreshSavedCharacters();
  } else {
    await refreshSavedRuns();
  }
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

function normalizeMultiplayerSession(raw = {}, fallback = {}) {
  const inviteCode = raw.invite_code || raw.code || raw.session_code || fallback.inviteCode || "";
  return {
    inviteCode,
    inviteUrl: raw.invite_url || fallback.inviteUrl || (inviteCode ? `${window.location.origin}${window.location.pathname}?session=${encodeURIComponent(inviteCode)}` : ""),
    role: raw.role || fallback.role || "",
    currentPlayerId: raw.current_player_id ?? raw.currentPlayerId ?? fallback.currentPlayerId ?? null,
    players: Array.isArray(raw.players) ? raw.players : fallback.players || [],
    assignments: Array.isArray(raw.assignments) ? raw.assignments : fallback.assignments || [],
    stateJson: raw.state_json || raw.stateJson || fallback.stateJson || null
  };
}

function getAssignedCharacterIdForCurrentPlayer() {
  const currentPlayerId = String(multiplayerSession.currentPlayerId ?? "");
  if (!currentPlayerId) {
    return "";
  }
  const assignment = multiplayerSession.assignments.find((entry) => {
    return String(entry?.player_id ?? entry?.playerId ?? "") === currentPlayerId;
  });
  return String(assignment?.character_id ?? assignment?.characterId ?? "");
}

function getCharacterNameById(characterId) {
  if (!characterId) {
    return "";
  }
  return state?.characters?.find((character) => character.id === characterId)?.name || "";
}

function redrawFromHydratedState(message = "") {
  if (!state) {
    return;
  }
  recomputeVisibility(state);
  setupCanvasLayers(state);
  updatePanels();
  updateWanderingUi();
  render();
  if (message) {
    setStatus(message);
  }
}

function applyMultiplayerSessionState(sessionPayload, options = {}) {
  const normalized = normalizeMultiplayerSession(sessionPayload, multiplayerSession);
  multiplayerSession = normalized;
  if (normalized.role !== "player" || !normalized.stateJson) {
    renderMultiplayerUi();
    return;
  }
  const assignedCharacterId = getAssignedCharacterIdForCurrentPlayer();
  const nextState = hydrateDungeonState(normalized.stateJson);
  if (assignedCharacterId && nextState.characters?.some((character) => character.id === assignedCharacterId)) {
    nextState.activeCharacterId = assignedCharacterId;
  }
  state = nextState;
  redrawFromHydratedState(options.message || "");
}

function setMultiplayerStatus(message, tone = "") {
  if (!ui.multiplayerStatus) {
    return;
  }
  ui.multiplayerStatus.textContent = message || "";
  ui.multiplayerStatus.dataset.tone = tone;
}

function renderMultiplayerUi() {
  if (!ui.multiplayerPresenceList) {
    return;
  }

  const hasInvite = Boolean(multiplayerSession.inviteCode || multiplayerSession.inviteUrl);
  ui.multiplayerInviteRow.hidden = !hasInvite;
  ui.multiplayerInviteLink.value = multiplayerSession.inviteUrl || "";

  const players = multiplayerSession.players.length
    ? multiplayerSession.players
    : hasInvite
      ? [{ id: "host", display_name: "Host", role: multiplayerSession.role || "host" }]
      : [];

  ui.multiplayerPresenceList.innerHTML = "";
  if (!players.length) {
    ui.multiplayerPresenceList.textContent = "No connected players yet.";
  } else {
    for (const player of players) {
      const row = document.createElement("div");
      row.className = "multiplayer-presence-row";
      const name = document.createElement("span");
      name.textContent = player.display_name || player.username || player.name || `Player ${player.id}`;
      const meta = document.createElement("span");
      meta.className = "multiplayer-presence-meta";
      const assignedName = getCharacterNameById(player.assigned_character_id || player.assignedCharacterId);
      const roleText = player.role === "host" || player.is_host ? "host" : "player";
      meta.textContent = assignedName ? `${roleText} - ${assignedName}` : roleText;
      row.append(name, meta);
      ui.multiplayerPresenceList.append(row);
    }
  }

  ui.multiplayerPlayerSelect.innerHTML = "";
  for (const player of players) {
    const option = document.createElement("option");
    option.value = player.id || player.user_id || "";
    option.textContent = player.display_name || player.username || player.name || "Player";
    ui.multiplayerPlayerSelect.append(option);
  }

  ui.multiplayerCharacterSelect.innerHTML = "";
  const characters = Array.isArray(state?.characters) ? state.characters : [];
  for (const character of characters) {
    const option = document.createElement("option");
    option.value = character.id;
    option.textContent = character.name || "Unnamed dot";
    ui.multiplayerCharacterSelect.append(option);
  }

  const canAssign = Boolean(
    hasInvite &&
    multiplayerSession.role === "host" &&
    ui.multiplayerPlayerSelect.value &&
    ui.multiplayerCharacterSelect.value
  );
  ui.multiplayerAssignBtn.disabled = !canAssign;
  ui.multiplayerRefreshBtn.disabled = !hasInvite;
  ensureMultiplayerRefreshLoop();
}

function setMultiplayerInviteMode(isInviteJoinMode) {
  if (ui.multiplayerTitle) {
    ui.multiplayerTitle.textContent = isInviteJoinMode ? "Join Game" : "Invite Players";
  }
  if (ui.multiplayerBtn) {
    ui.multiplayerBtn.textContent = isInviteJoinMode && multiplayerSession.role !== "host" ? "Join Game" : "Invite Players";
  }
  if (ui.multiplayerHostSection) {
    ui.multiplayerHostSection.hidden = Boolean(isInviteJoinMode && multiplayerSession.role !== "host");
  }
  if (ui.multiplayerJoinBtn) {
    ui.multiplayerJoinBtn.textContent = isInviteJoinMode ? "Join Game" : "Join Host";
  }
}

function openMultiplayerModal() {
  ui.multiplayerModal.hidden = false;
  const codeFromUrl = normalizeSessionCode(new URL(window.location.href).searchParams.get("session") || "");
  setMultiplayerInviteMode(Boolean(codeFromUrl));
  if (codeFromUrl && !multiplayerSession.inviteCode) {
    ui.multiplayerJoinCode.value = codeFromUrl;
    setMultiplayerStatus("Invite link found. Joining game...", "info");
  } else if (!multiplayerSession.inviteCode) {
    setMultiplayerStatus("Create a host link, or paste a friend's code to join their dungeon.");
  }
  renderMultiplayerUi();
}

function closeMultiplayerModal() {
  ui.multiplayerModal.hidden = true;
}

function ensureMultiplayerRefreshLoop() {
  const shouldPoll = Boolean(multiplayerSession.inviteCode && multiplayerSession.role);
  if (!shouldPoll) {
    if (multiplayerRefreshTimer) {
      window.clearInterval(multiplayerRefreshTimer);
      multiplayerRefreshTimer = null;
    }
    return;
  }
  if (multiplayerRefreshTimer) {
    return;
  }
  multiplayerRefreshTimer = window.setInterval(() => {
    if (document.visibilityState !== "visible") {
      return;
    }
    refreshMultiplayerSession({ silent: true });
  }, 5000);
}

function openInviteFromUrlIfPresent() {
  const codeFromUrl = normalizeSessionCode(new URL(window.location.href).searchParams.get("session") || "");
  if (!codeFromUrl) {
    return;
  }
  multiplayerSession = {
    ...multiplayerSession,
    inviteCode: codeFromUrl,
    inviteUrl: window.location.href
  };
  ui.multiplayerJoinCode.value = codeFromUrl;
  openMultiplayerModal();
  if (!multiplayerAutoJoinAttempted) {
    multiplayerAutoJoinAttempted = true;
    joinMultiplayerHost({ automatic: true });
  }
}

async function createMultiplayerHost() {
  if (!state) {
    setMultiplayerStatus("Generate a dungeon before creating a host link.", "error");
    return;
  }
  setMultiplayerStatus("Creating host link...");
  try {
    const activeCharacter = getActiveCharacter(state);
    const session = await createHostSession(state, {
      hostCharacterId: activeCharacter?.id || null
    });
    multiplayerSession = normalizeMultiplayerSession(session, { role: "host" });
    setMultiplayerStatus("Host link ready. Share it with your players.", "success");
    renderMultiplayerUi();
  } catch (error) {
    setMultiplayerStatus(error.message, "error");
    renderMultiplayerUi();
  }
}

async function joinMultiplayerHost(options = {}) {
  const inviteValue = ui.multiplayerJoinCode.value;
  setMultiplayerInviteMode(true);
  setMultiplayerStatus(options.automatic ? "Joining game from invite link..." : "Joining game...");
  try {
    const session = await joinHostSession(inviteValue);
    applyMultiplayerSessionState(session, { message: "Joined host dungeon." });
    const assignedCharacterId = getAssignedCharacterIdForCurrentPlayer();
    const assignedName = getCharacterNameById(assignedCharacterId);
    setMultiplayerStatus(assignedName ? `Joined game as ${assignedName}.` : "Joined game. Waiting for the host to assign a character.", "success");
    renderMultiplayerUi();
  } catch (error) {
    const message = options.automatic && /login|required|authentication/i.test(error.message)
      ? "Log in or register, then return to this invite link to join the game."
      : error.message;
    setMultiplayerStatus(message, "error");
    renderMultiplayerUi();
  }
}

async function refreshMultiplayerSession(options = {}) {
  if (!multiplayerSession.inviteCode) {
    if (!options.silent) {
      setMultiplayerStatus("No active host link to refresh.", "error");
    }
    return;
  }
  if (multiplayerRefreshInFlight) {
    return;
  }
  multiplayerRefreshInFlight = true;
  if (!options.silent) {
    setMultiplayerStatus("Refreshing session...");
  }
  try {
    const session = multiplayerSession.role === "host" && state
      ? await updateHostSessionState(multiplayerSession.inviteCode, state)
      : await getHostSession(multiplayerSession.inviteCode);
    if (multiplayerSession.role === "player") {
      applyMultiplayerSessionState(session);
    } else {
      multiplayerSession = normalizeMultiplayerSession(session, multiplayerSession);
      renderMultiplayerUi();
    }
    if (!options.silent) {
      setMultiplayerStatus("Session refreshed.", "success");
    }
  } catch (error) {
    if (!options.silent) {
      setMultiplayerStatus(error.message, "error");
    } else {
      console.warn("Multiplayer refresh failed.", error);
    }
    renderMultiplayerUi();
  } finally {
    multiplayerRefreshInFlight = false;
  }
}

async function assignMultiplayerDot() {
  setMultiplayerStatus("Assigning dot...");
  try {
    await assignSessionCharacter(
      multiplayerSession.inviteCode,
      ui.multiplayerPlayerSelect.value,
      ui.multiplayerCharacterSelect.value,
      { state }
    );
    await refreshMultiplayerSession();
  } catch (error) {
    setMultiplayerStatus(error.message, "error");
  }
}

async function copyMultiplayerInviteLink() {
  if (!multiplayerSession.inviteUrl) {
    setMultiplayerStatus("No invite link is ready yet.", "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(multiplayerSession.inviteUrl);
    setMultiplayerStatus("Invite link copied.", "success");
  } catch {
    ui.multiplayerInviteLink.select();
    setMultiplayerStatus("Copy blocked by the browser. The link is selected for manual copy.", "info");
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
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomMapBy(1.16);
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomMapBy(1 / 1.16);
      return;
    }
    if (event.key === "i" || event.key === "I") {
      if (ui.characterSheetModal && !ui.characterSheetModal.hidden) {
        event.preventDefault();
        closeCharacterSheet();
        return;
      }
      const active = getExplicitActiveCharacter(state);
      if (active) {
        event.preventDefault();
        openCharacterSheet(active);
      }
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
      syncPlayerToActiveCharacter();
      const result = movePlayer(state, delta[0], delta[1]);
      if (result.moved) {
        syncActiveCharacterToPlayer();
        recomputeVisibility(state);
      }
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
  });

  ui.generateBtn.addEventListener("click", () => {
    generateAndRender();
  });
  ui.dungeonTabBtn?.addEventListener("click", () => setActiveTab("dungeon"));
  ui.charactersTabBtn?.addEventListener("click", () => {
    setActiveTab("characters");
    if (state?.characters?.length) {
      openCharacterSheet(getActiveCharacter(state));
    }
  });
  syncBaseClassesOnlyToggleState(readBaseClassesOnlyPreference());
  ui.baseClassesOnlyToggle?.addEventListener("change", () => {
    syncBaseClassesOnlyToggleState(ui.baseClassesOnlyToggle.checked);
  });
  ui.importCharacterBtn.addEventListener("click", () => {
    importShadowdarklingsCharacterOneClick();
  });
  ui.manualDiceControls?.addEventListener("click", (event) => {
    const button = event.target.closest(".manual-die-button");
    if (button) {
      applyManualDieRoll(button);
    }
  });
  ui.manualDiceControls?.addEventListener("input", (event) => {
    if (event.target.matches("input[type='number']")) {
      sizeControlField(event.target);
    }
  });
  ui.manualDieReset?.addEventListener("click", resetManualDieControls);
  ui.diceHistoryToggle?.addEventListener("click", toggleDiceHistory);
  ui.damageExpandBtn?.addEventListener("click", () => {
    setDamageDetailVisibility(ui.damageDetail.hidden);
  });
  if (ui.characterSheetClose) {
    ui.characterSheetClose.addEventListener("click", closeCharacterSheet);
  }
  const characterSheetCard = getCharacterSheetCard();
  characterSheetCard?.addEventListener("pointerdown", startCharacterSheetDrag);
  characterSheetCard?.addEventListener("pointermove", dragCharacterSheet);
  characterSheetCard?.addEventListener("pointerup", stopCharacterSheetDrag);
  characterSheetCard?.addEventListener("pointercancel", stopCharacterSheetDrag);
  if (ui.characterSheetModal) {
    ui.characterSheetModal.addEventListener("click", (event) => {
      if (event.target === ui.characterSheetModal) {
        closeCharacterSheet();
      }
    });
  }
  ui.spellDetailClose?.addEventListener("click", () => {
    ui.spellDetailModal.hidden = true;
  });
  ui.spellDetailModal?.addEventListener("click", (event) => {
    if (event.target === ui.spellDetailModal) {
      ui.spellDetailModal.hidden = true;
    }
  });
  ui.levelInput.addEventListener("input", () => sizeControlField(ui.levelInput));

  ui.saveBtn.addEventListener("click", () => {
    openSaveLoadModal("save");
  });

  ui.loadBtn.addEventListener("click", () => {
    openSaveLoadModal("load");
  });

  ui.loadCharacterBtn?.addEventListener("click", () => {
    openSaveLoadModal("load-character");
  });

  ui.multiplayerBtn?.addEventListener("click", openMultiplayerModal);
  ui.multiplayerCreateHostBtn?.addEventListener("click", createMultiplayerHost);
  ui.multiplayerJoinBtn?.addEventListener("click", joinMultiplayerHost);
  ui.multiplayerRefreshBtn?.addEventListener("click", refreshMultiplayerSession);
  ui.multiplayerAssignBtn?.addEventListener("click", assignMultiplayerDot);
  ui.multiplayerCopyLinkBtn?.addEventListener("click", copyMultiplayerInviteLink);
  ui.multiplayerClose?.addEventListener("click", closeMultiplayerModal);
  ui.multiplayerModal?.addEventListener("click", (event) => {
    if (event.target === ui.multiplayerModal) {
      closeMultiplayerModal();
    }
  });

  ui.lightTorchBtn.addEventListener("click", () => {
    const active = getActiveCharacter(state);
    if (!canLightTorch(active)) {
      return;
    }
    if (active?.lightSource === "torch") {
      removeOneTorch(active);
    }
    lightActiveCharacter("torch");
    normalizeCharacterState(state);
    applyCharacterAmmoOverrides();
    syncAllCharacterEquipmentDerivedStats();
    applyCharacterColorOverrides();
    ensureCharacterPresentation();
    markUserActivity();
    recomputeVisibility(state);
    setStatus("New torch lit.");
    render();
    updatePanels();
  });

  ui.lightLanternBtn?.addEventListener("click", () => {
    const active = getActiveCharacter(state);
    if (!canLightLantern(active)) {
      return;
    }
    const wasHiddenLantern = active?.lightSource === "lantern" && active.lightHidden === true;
    if (!wasHiddenLantern) {
      removeOneOil(active);
    }
    lightActiveCharacter("lantern");
    normalizeCharacterState(state);
    applyCharacterAmmoOverrides();
    syncAllCharacterEquipmentDerivedStats();
    applyCharacterColorOverrides();
    ensureCharacterPresentation();
    markUserActivity();
    recomputeVisibility(state);
    setStatus(wasHiddenLantern ? "Lantern uncovered." : "Lantern is lit!");
    render();
    updatePanels();
  });

  ui.castLightBtn?.addEventListener("click", async () => {
    const active = getActiveCharacter(state);
    if (!canCastLightSpell(active)) {
      return;
    }
    await ensureSpellLibraryLoaded();
    const spell = findSpellRecord("Light") || { name: "Light", tier: 1 };
    performSpellCast(active, spell);
    render();
    updatePanels();
  });

  ui.torchOutBtn.addEventListener("click", () => {
    const active = getActiveCharacter(state);
    if (active?.lightSource === "lantern") {
      extinguishActiveLantern();
      setStatus("Lantern went out!");
    } else if (active?.lightSource === "torch") {
      snuffActiveTorch();
      setStatus("Torch snuffed!");
    } else {
      clearActiveCharacterLight();
      setStatus("Light went out!");
    }
    markUserActivity();
    recomputeVisibility(state);
    render();
    updatePanels();
  });

  ui.torchBtn.addEventListener("click", () => {
    const active = getActiveCharacter(state);
    if (active?.lightSource === "lantern" && Number(active.lightRadius) > 0) {
      hideActiveLantern();
      setStatus("Lantern hidden.");
    } else if (active?.lightSource === "lantern" && active.lightHidden === true) {
      revealActiveLantern();
      setStatus("Lantern revealed.");
    } else if (active?.lightSource === "light-spell" && Number(active.lightRadius) > 0) {
      clearActiveCharacterLight();
      recomputeVisibility(state);
      setStatus("Light hidden.");
    } else {
      return;
    }
    markUserActivity();
    render();
    updatePanels();
  });

  ui.searchModifierInput?.addEventListener("change", () => {
    normalizeSearchModifier();
  });
  ui.searchModifierInput?.addEventListener("input", () => {
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
    const context = getCharacterActionContext("pick");
    const result = attemptLockedDoor(state, "pick", context.modifier, { doubleRoll: context.doubleRoll });
    const message = result.opened
      ? `Pick Lock ${result.total}. Lock picked.`
      : `Pick Lock ${result.total}. The lock holds.`;
    markUserActivity();
    setStatus(result.trapSprung ? `${message} ${result.message}` : message);
    showCheckResult(result, "Pick Lock", {
      headline: `Pick Lock ${result.total}`,
      message,
      context
    });
    render();
    updatePanels();
  });

  ui.breakDoorBtn.addEventListener("click", () => {
    const context = getCharacterActionContext("break");
    const result = attemptLockedDoor(state, "break", context.modifier, { doubleRoll: context.doubleRoll });
    const message = result.opened ? "door destroyed." : "you can't budge the door.";
    markUserActivity();
    setStatus(result.trapSprung ? `${message} ${result.message}` : message);
    showCheckResult(result, "Smash", {
      headline: `Smash ${result.total}`,
      message,
      context
    });
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
    const clickedCharacter = getCharacterAtTile(x, y);
    if (clickedCharacter) {
      activateCharacter(clickedCharacter);
      markUserActivity();
      setStatus(`Selected ${clickedCharacter.name}.`);
      render();
      updatePanels();
      return;
    }
    const result = clickEntity(state, x, y);
    markUserActivity();
    setStatus(result);
    render();
    if (!/^No interactive token\b|^That tile is hidden by darkness\./.test(result.message || "")) {
      updatePanels();
    }
  };

  panel.addEventListener("wheel", (event) => {
    if (!state) {
      return;
    }
    event.preventDefault();
    const zoomStep = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    applyViewportScale(viewport.scale * zoomStep, pointerInMapView(panel, event.clientX, event.clientY));
  }, { passive: false });

  ui.zoomInBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    zoomMapBy(1.16);
  });

  ui.zoomOutBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    zoomMapBy(1 / 1.16);
  });

  panel.addEventListener("pointerdown", (event) => {
    if (event.target?.closest?.(".map-zoom-controls")) {
      return;
    }
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

  panel.addEventListener("contextmenu", (event) => {
    if (!state || !layers) {
      return;
    }
    event.preventDefault();
    const { x, y } = getTileFromPointer(event);
    const character = getCharacterAtTile(x, y);
    if (!character || character.id === state.activeCharacterId) {
      return;
    }
    character.guarding = !character.guarding;
    markUserActivity();
    setStatus(character.guarding ? `${character.name} is guarding.` : `${character.name} stops guarding.`);
    render();
    updatePanels();
  });

  window.addEventListener("resize", () => {
    if (state) {
      applyViewportScale(viewport.scale);
    }
    if (ui.characterSheetModal && !ui.characterSheetModal.hidden) {
      positionCharacterSheetModal();
    }
  });
}

async function generateAndRender() {
  const seed = Number(ui.seedInput.value || createRandomDungeonSeed());
  ui.seedInput.value = `${seed}`;
  const level = Number(ui.levelInput.value || 1);
  setStatus("Generating dungeon...");
  [shadowdarkContent, rulesData] = await Promise.all([loadShadowdarkContent(), loadRulesData(), ensureSpellLibraryLoaded()]);
  [trapTable, monsterTable] = await Promise.all([loadTrapTable(), loadMonsterTableForLevel(level)]);
  state = generateDungeon(seed, level, {
    monsterTable,
    trapTable,
    contentCatalog: shadowdarkContent,
    rulesData
  });
  normalizeCharacterState(state);
  normalizeWanderingChance(state, ui.wanderingNumerator.value, ui.wanderingDenominator.value);
  state.run.hasUserActivity = false;
  state.run.dirty = false;
  recomputeVisibility(state);
  setupCanvasLayers(state);
  updatePanels();
  setActiveTab(activeTab);
  render();
  setStatus(`Generated level ${level} map with seed ${seed}. Move with arrow keys.`);
}

function startClock() {
  window.setInterval(() => {
    if (!state) {
      return;
    }
    const result = syncElapsedTime(state);
    let changed = false;
    if (result.crossedWanderingChecks) {
      processWanderingChecks(result.crossedWanderingChecks);
      changed = true;
    }
    if (result.expired) {
      setStatus(expireActiveLightFromTimer());
      changed = true;
    }
    if (!changed) {
      return;
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
  ui.seedInput.value = `${createRandomDungeonSeed()}`;
  updateControlSizing();
  syncSidebarWidth();
  syncBaseClassesOnlyToggleState(readBaseClassesOnlyPreference());
  if (document.fonts?.ready) {
    document.fonts.ready.then(syncSidebarWidth);
  }
  window.addEventListener("resize", syncSidebarWidth);
  startClock();
  await generateAndRender();
  openInviteFromUrlIfPresent();
}

initialize();
