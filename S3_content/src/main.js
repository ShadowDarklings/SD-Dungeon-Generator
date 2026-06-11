import { DEFAULT_LIGHT_RADIUS, MAX_SEARCH_MODIFIER, MIN_SEARCH_MODIFIER, TILE_SIZE_PX } from "./constants.js";
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
  rollCheck,
  searchForTraps
} from "./interactions.js";
import {
  createRun,
  hydrateDungeonState,
  importShadowdarklingsCharacter,
  listRunsWithNames,
  loadRun,
  MAX_SAVE_NAME_LENGTH,
  normalizeSaveName,
  updateRun
} from "./persistence.js";
import {
  abilityScoreModifier,
  decrementCharacterDyingRounds,
  extractShadowdarkCharacters,
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
  normalizeSessionCode
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
  saveBtn: document.getElementById("save-btn"),
  loadBtn: document.getElementById("load-btn"),
  multiplayerBtn: document.getElementById("multiplayer-btn"),
  lightTorchBtn: document.getElementById("light-torch-btn"),
  lightLanternBtn: document.getElementById("light-lantern-btn"),
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
let spellLibraryPromise = null;
let spellLookup = new Map();
let lastDamageRoll = null;
let activeTab = "dungeon";
let saveDialog = {
  mode: "save",
  runs: [],
  pendingRun: null
};
let multiplayerSession = {
  inviteCode: "",
  inviteUrl: "",
  role: "",
  players: [],
  assignments: []
};

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
  maxScale: 1.5,
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
    forceBlackout: forceBlackoutWhenTorchOut && !state.player.torchLit
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
    const capacity = Number(inventory.baseSlots ?? 10) + Number(inventory.bonusSlots ?? 0);
    ui.inventorySlots.textContent = `${inventory.usedSlots || 0} / ${capacity} slots`;
  }
}

function getCharacterActionContext(action) {
  const character = getActiveCharacter(state);
  const situational = Number(ui.searchModifierInput.value || 0) || 0;
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
  button.textContent = `${attack.name}${attack.flag || ""}`;
  button.title = `Roll attack ${attack.bonusText ? attack.bonusText : formatModifier(attack.bonus || 0)}`;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    applyAttackRoll(character, attack);
  });
  return button;
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
  button.textContent = `${attack.name} Backstab x ${multiplier}`;
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
  if (attack.bonusText) {
    content.append(document.createTextNode(` ${attack.bonusText}`));
  }
  if (attack.detail) {
    content.append(document.createTextNode(", "));
    appendDamageAwareText(content, attack.detail, {
      sourceLabel: `${character?.name || "Character"} attack`,
      character
    });
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

function setCharacterLight(character, source) {
  if (!character) {
    return;
  }
  if (source === "light-spell") {
    character.lightSource = "light-spell";
    character.lightRadius = DEFAULT_LIGHT_RADIUS;
    return;
  }
  if (source === "lantern") {
    character.lightSource = "lantern";
    character.lightRadius = 12;
    return;
  }
  if (source === "torch") {
    character.lightSource = "torch";
    character.lightRadius = DEFAULT_LIGHT_RADIUS;
    return;
  }
  character.lightSource = "";
  character.lightRadius = 0;
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

function canLightLantern(character) {
  return characterHasLantern(character) && characterHasOil(character) && characterHasFlintAndSteel(character);
}

function canLightTorch(character) {
  return characterHasTorch(character) && characterHasFlintAndSteel(character);
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
  const active = getActiveCharacter(state);
  if (ui.lightTorchBtn) {
    ui.lightTorchBtn.hidden = !canLightTorch(active);
  }
  if (ui.lightLanternBtn) {
    ui.lightLanternBtn.hidden = !canLightLantern(active);
  }
  const lightSource = state.player.lightSource || (state.player.torchLit ? "torch" : "");
  if (ui.torchBtn) {
    ui.torchBtn.hidden = !state.player.torchLit && !canLightTorch(active);
  }
  ui.torchBtn.textContent = state.player.torchLit
    ? lightSource === "lantern" ? "Hide Lantern" : lightSource === "light-spell" ? "Hide Light" : "Hide Torch"
    : "Show Torch";
}

function formatTalentSpellTextForSheet(text) {
  return String(text || "")
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

function shouldSuppressTalentLine(line, allLines) {
  const normalized = String(line || "").trim();
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
  const strScore = clampInt(character?.stats?.STR, 10, 20, 10);
  const capacitySlots = Math.min(maxSlots, Math.max(10, strScore || 10));

  const maxUsedSlots = Number.isFinite(Number(maxSlots)) ? Number(maxSlots) : 20;
  const items = Array.isArray(character?.gear) ? character.gear : [];

  function lightweightGroupSize(name) {
    if (/arrows?|bolts?/i.test(name)) {
      return 20;
    }
    if (/rations?/i.test(name)) {
      return 3;
    }
    return 1;
  }

  function formatStackName(name, units, groupSize) {
    return groupSize > 1 && units > 1 ? `${name} x ${units}` : name;
  }

  for (const item of items) {
    const rawItemName = String(item?.name || "Gear").trim() || "Gear";
    const itemName = rawItemName;
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
    const groupSize = lightweightGroupSize(itemName);
    const slotsPerUnit = isTorch ? 1 : Math.max(1, Math.floor(Number(item?.slots) || 1));

    let remainingUnits = units;
    if (isBackpack && !backpackReserved && excludeBackpack !== false) {
      backpackReserved = true;
      if (units > 0) {
        freeCarry.push(itemName);
      }
      remainingUnits = Math.max(0, units - 1);
    }

    if (groupSize > 1) {
      const slotGroups = Math.max(1, Math.ceil(remainingUnits / groupSize));
      const displayName = formatStackName(itemName, remainingUnits, groupSize);
      lines.push({ text: displayName, available: totalSlots < capacitySlots });
      totalSlots += 1;
      for (let group = 1; group < slotGroups; group += 1) {
        lines.push({ text: `(${itemName})`, available: totalSlots < capacitySlots });
        totalSlots += 1;
      }
      continue;
    }

    const unitText = formatStackName(itemName, 1, groupSize);
    for (let unit = 0; unit < remainingUnits; unit += 1) {
      for (let slot = 0; slot < slotsPerUnit; slot += 1) {
        lines.push({ text: unitText, available: totalSlots < capacitySlots });
        totalSlots += 1;
      }
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
    freeCarry: freeCarry.slice(0, 1)
  };
}

function getCharacterMoney(character, key) {
  return Number(character?.[key] ?? character?.raw?.[key] ?? 0) || 0;
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

function ensureCharacterPresentation() {
  if (!state?.characters?.length) {
    return;
  }
  const usedColors = new Set();
  const occupied = new Set();

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

    if (!hasCharacterMapPosition(character) || occupied.has(`${character.x},${character.y}`) || isCharacterTileBlocked(Number(character.x), Number(character.y))) {
      const origin = getCharacterSpawnOrigin(character, index);
      const originX = origin.x;
      const originY = origin.y;
      const start = findOpenCharacterTile(originX, originY, occupied);
      character.x = start.x;
      character.y = start.y;
      character.roomId = start.roomId;
    }
    occupied.add(`${character.x},${character.y}`);
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
    createMiniInlineNumberField(character.hp, 99, (value) => {
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
  const talentRows = talentLines.filter((line) => !shouldSuppressTalentLine(line, talentLines)).map((line) => {
    const displayLine = formatTalentSpellTextForSheet(line);
    return /^Spells:/i.test(displayLine)
      ? createSpellSummaryLine(displayLine, character)
      : createDamageAwareLine(displayLine, {
        sourceLabel: `${character.name} talent`,
        spellCheck: isSpellCheckText(displayLine),
        character
      });
  });
  const attackRows = (character.attacks || [])
    .filter((attackText) => !isBackstabAttackText(attackText))
    .map((attackText) => createAttackAwareLine(formatAttackForSheet(attackText), character));
  const talents = createSdPanel("Talents / Spells", buildSheetLines(talentRows, 8), "sd-talents-panel");
  const attacks = createSdPanel("Attacks", buildSheetLines(attackRows, 8), "sd-attacks-panel");
  const gear = createSdGearPanel(character);
  const dismissal = popout ? createSdDismissPanel(character) : null;

  const statCluster = document.createElement("div");
  statCluster.className = "sd-stat-cluster";
  for (const key of ["STR", "INT", "DEX", "WIS", "CON", "CHA"]) {
    statCluster.append(createSdField(key, formatAbilityPair(character, key), "sd-stat-box"));
  }
  statCluster.append(createSdField("HP", `${character.hp} / ${character.maxHitPoints}`, "sd-vital-box"));
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
  buttonWrap.append(dismissButton);

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
  const attacks = (character.attacks || [])
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
  const ammoValue = ammoType ? getDisplayCharacterAmmo(character, ammoType) : undefined;
  const attackNode = document.createElement("span");
  attackNode.className = "character-mini-attack-entry";
  attackNode.append(createAttackButton(character, attack));
  if (attack.bonusText) {
    attackNode.append(document.createTextNode(` ${attack.bonusText}`));
  }
  if (ammoValue !== undefined) {
    attackNode.append(document.createTextNode(" "));
    attackNode.append(createMiniInlineNumberField(ammoValue, 99, (value) => {
      const currentCharacter = setDisplayCharacterAmmo(character, ammoType, value);
      refreshCharacterViews(currentCharacter);
    }));
  }
  if (attack.detail) {
    attackNode.append(document.createTextNode(", "));
    appendDamageAwareText(attackNode, attack.detail, {
      sourceLabel: `${character?.name || "Character"} attack`,
      character
    });
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
}

function closeCharacterSheet() {
  if (!ui.characterSheetModal) {
    return;
  }
  ui.characterSheetModal.hidden = true;
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
  ui.charactersEmpty.textContent = "Fetching one character from ShadowDarklings...";

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
  const heading = document.createElement("h3");
  heading.textContent = "Gear";

  const money = document.createElement("div");
  money.className = "sd-money-row";
  money.textContent = `GP ${getCharacterMoney(character, "gold")}   SP ${getCharacterMoney(character, "silver")}   CP ${getCharacterMoney(character, "copper")}`;

  const rows = document.createElement("div");
  rows.className = "sd-gear-lines";
  const { slots, freeCarry } = getCharacterGearSlots(character, {
    maxSlots: 20,
    excludeBackpack: true
  });
  slots.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = entry.available ? "" : "sd-gear-slot-unavailable";
    row.textContent = `${index + 1}. ${entry.text || ""}`;
    rows.append(row);
  });
  const freeCarryPanel = document.createElement("div");
  freeCarryPanel.className = "sd-free-carry";
  const freeCarryHeading = document.createElement("h3");
  freeCarryHeading.textContent = "FREE TO CARRY";
  const freeCarryLines = document.createElement("div");
  freeCarryLines.className = "sd-free-carry-lines";
  for (let index = 0; index < 10; index += 1) {
    const line = document.createElement("div");
    line.textContent = freeCarry[index] || "";
    freeCarryLines.append(line);
  }
  freeCarryPanel.append(freeCarryHeading, freeCarryLines);

  panel.append(heading, money, rows, freeCarryPanel);
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
      createStatRow("ATK", monster.attack, {
        damageAware: true,
        sourceLabel: monster.name,
        references: monster.damage
      })
    );
    card.append(stats);

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
  const roomFeatures = state.entities.filter((entity) => (
    entity.type === "feature" &&
    entity.subtype !== "door" &&
    entity.visible !== false &&
    entity.roomId === state.player.roomId
  ));
  if (!state.player.roomId || (traps.length === 0 && roomFeatures.length === 0)) {
    ui.trapPanel.textContent = "No revealed traps or features in this room.";
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

  for (const feature of roomFeatures) {
    const card = document.createElement("article");
    card.className = "trap-card";
    const title = document.createElement("h3");
    title.textContent = feature.name || "Dungeon feature";
    card.append(title);
    ui.trapPanel.append(card);
  }
}

function updatePanels() {
  updateLootUi();
  updateCharactersUi();
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
    const source = state.player.lightSource === "lantern" ? "Lantern" : "Torch";
    syncActiveCharacterLightFromPlayer();
    recomputeVisibility(state);
    setStatus(`${source} went out!`);
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

function normalizeMultiplayerSession(raw = {}, fallback = {}) {
  const inviteCode = raw.invite_code || raw.code || raw.session_code || fallback.inviteCode || "";
  return {
    inviteCode,
    inviteUrl: raw.invite_url || fallback.inviteUrl || (inviteCode ? `${window.location.origin}${window.location.pathname}?session=${encodeURIComponent(inviteCode)}` : ""),
    role: raw.role || fallback.role || "",
    players: Array.isArray(raw.players) ? raw.players : fallback.players || [],
    assignments: Array.isArray(raw.assignments) ? raw.assignments : fallback.assignments || []
  };
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
      meta.textContent = player.role === "host" || player.is_host ? "host" : "player";
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

  const canAssign = Boolean(hasInvite && ui.multiplayerPlayerSelect.value && ui.multiplayerCharacterSelect.value);
  ui.multiplayerAssignBtn.disabled = !canAssign;
  ui.multiplayerRefreshBtn.disabled = !hasInvite;
}

function openMultiplayerModal() {
  ui.multiplayerModal.hidden = false;
  const codeFromUrl = normalizeSessionCode(new URL(window.location.href).searchParams.get("session") || "");
  if (codeFromUrl && !multiplayerSession.inviteCode) {
    ui.multiplayerJoinCode.value = codeFromUrl;
    setMultiplayerStatus("Invite code found in the URL. Click Join Host when you're ready.", "info");
  } else if (!multiplayerSession.inviteCode) {
    setMultiplayerStatus("Create a host link, or paste a friend's code to join their dungeon.");
  }
  renderMultiplayerUi();
}

function closeMultiplayerModal() {
  ui.multiplayerModal.hidden = true;
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

async function joinMultiplayerHost() {
  const inviteValue = ui.multiplayerJoinCode.value;
  setMultiplayerStatus("Joining host...");
  try {
    const activeCharacter = getActiveCharacter(state);
    const session = await joinHostSession(inviteValue, {
      characterId: activeCharacter?.id || null
    });
    multiplayerSession = normalizeMultiplayerSession(session, { role: "player" });
    setMultiplayerStatus("Joined host session.", "success");
    renderMultiplayerUi();
  } catch (error) {
    setMultiplayerStatus(error.message, "error");
    renderMultiplayerUi();
  }
}

async function refreshMultiplayerSession() {
  if (!multiplayerSession.inviteCode) {
    setMultiplayerStatus("No active host link to refresh.", "error");
    return;
  }
  setMultiplayerStatus("Refreshing session...");
  try {
    const session = await getHostSession(multiplayerSession.inviteCode);
    multiplayerSession = normalizeMultiplayerSession(session, multiplayerSession);
    setMultiplayerStatus("Session refreshed.", "success");
    renderMultiplayerUi();
  } catch (error) {
    setMultiplayerStatus(error.message, "error");
    renderMultiplayerUi();
  }
}

async function assignMultiplayerDot() {
  setMultiplayerStatus("Assigning dot...");
  try {
    await assignSessionCharacter(
      multiplayerSession.inviteCode,
      ui.multiplayerPlayerSelect.value,
      ui.multiplayerCharacterSelect.value
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
  ui.damageExpandBtn?.addEventListener("click", () => {
    setDamageDetailVisibility(ui.damageDetail.hidden);
  });
  if (ui.characterSheetClose) {
    ui.characterSheetClose.addEventListener("click", closeCharacterSheet);
  }
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
    if (!canLightTorch(getActiveCharacter(state))) {
      return;
    }
    lightActiveCharacter("torch");
    markUserActivity();
    recomputeVisibility(state);
    setStatus("New torch lit.");
    render();
  });

  ui.lightLanternBtn?.addEventListener("click", () => {
    if (!canLightLantern(getActiveCharacter(state))) {
      return;
    }
    lightActiveCharacter("lantern");
    markUserActivity();
    recomputeVisibility(state);
    setStatus("Lantern is lit!");
    render();
  });

  ui.torchOutBtn.addEventListener("click", () => {
    const source = state.player.lightSource === "lantern" ? "Lantern" : "Torch";
    clearActiveCharacterLight();
    markUserActivity();
    recomputeVisibility(state);
    setStatus(`${source} went out!`);
    render();
  });

  ui.torchBtn.addEventListener("click", () => {
    if (state.player.torchLit) {
      const source = state.player.lightSource === "lantern" ? "Lantern" : "Torch";
      clearActiveCharacterLight();
      setStatus(`${source} extinguished.`);
    } else {
      if (!canLightTorch(getActiveCharacter(state))) {
        return;
      }
      lightActiveCharacter("torch");
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
  });
}

async function generateAndRender() {
  const seed = Number(ui.seedInput.value || Date.now());
  const level = Number(ui.levelInput.value || 1);
  setStatus("Generating dungeon...");
  [shadowdarkContent] = await Promise.all([loadShadowdarkContent(), ensureSpellLibraryLoaded()]);
  [trapTable, monsterTable] = await Promise.all([loadTrapTable(), loadMonsterTableForLevel(level)]);
  state = generateDungeon(seed, level, {
    monsterTable,
    trapTable,
    contentCatalog: shadowdarkContent
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
      recomputeVisibility(state);
      setStatus("Torch went out!");
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
