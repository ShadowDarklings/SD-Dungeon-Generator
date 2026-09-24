import { DEFAULT_LIGHT_RADIUS } from "./constants.js";

export function normalizeWeaponSpacing(value) {
  return String(value || "").toLowerCase()
    .replace(/\b(long|short|great|cross|war)\s+(sword|bow|axe|club|hammer)\b/g, "$1$2");
}

export function handItemKind(item) {
  const name = normalizeWeaponSpacing(item?.name);
  if (/\bshield\b/.test(name)) return "shield";
  if (/^torch\b/.test(name)) return "torch";
  if (/\blantern\b/.test(name)) return "lantern";
  if (String(item?.type || "").toLowerCase() === "weapon" ||
      /\b(sword|bastard sword|greatsword|longsword|shortsword|greataxe|battleaxe|axe|greatclub|club|polearm|halberd|warhammer|mace|dagger|staff|longbow|shortbow|crossbow|spear|javelin|sling)\b/.test(name)) return "weapon";
  return "";
}

export function isTwoHandedWeapon(item) {
  if (handItemKind(item) !== "weapon") return false;
  const text = normalizeWeaponSpacing([item.name, item.properties, item.traits, item.hands, item.description].map(value =>
    typeof value === "object" ? JSON.stringify(value) : String(value || "")).join(" "));
  return item.twoHanded === true || Number(item.hands) === 2 || /\b2h\b|two[ -]handed|\b(greatsword|greatclub|polearm|halberd|warhammer|staff|longbow|shortbow|crossbow)\b/i.test(text);
}

export function equipItem(character, index, equipped) {
  const gear = character.gear || [];
  const item = gear[index];
  const kind = handItemKind(item);
  if (!kind) return false;
  if (!equipped) {
    item.equipped = false;
    syncEquipmentLight(character);
    return true;
  }
  const light = value => ["torch", "lantern"].includes(handItemKind(value));
  for (const other of gear) {
    if (other === item || !other.equipped) continue;
    const otherKind = handItemKind(other);
    if (isTwoHandedWeapon(item) || isTwoHandedWeapon(other) ||
        (kind === "weapon" && otherKind === "weapon") ||
        (kind === "shield" && otherKind === "shield") || (light(item) && light(other))) {
      other.equipped = false;
    }
  }
  item.equipped = true;
  const heldWeapon = gear.find(value => value.equipped && handItemKind(value) === "weapon");
  const heldShield = gear.find(value => value.equipped && handItemKind(value) === "shield");
  const heldLight = gear.find(value => value.equipped && light(value));
  if (heldWeapon && heldShield && heldLight) {
    (light(item) ? heldWeapon : heldLight).equipped = false;
  }
  syncEquipmentLight(character);
  return true;
}

export function ensureEquipment(character, canEquip = () => true) {
  character.gear ||= [];
  // Each carried light needs its own burning/equipped state, even when imported as a stack.
  for (const item of [...character.gear]) {
    if (!["torch", "lantern"].includes(handItemKind(item))) continue;
    const units = Math.floor(Number(item.totalUnits ?? item.quantity ?? 1));
    if (!Number.isFinite(units) || units <= 1 || units > 1000) continue;
    item.quantity = 1;
    item.totalUnits = 1;
    for (let index = 1; index < units; index += 1) {
      const spare = { ...item, lit: false, equipped: false, covered: false };
      if (spare.instanceId) spare.instanceId = `${spare.instanceId}-${index}`;
      character.gear.push(spare);
    }
  }
  if (!character.equipmentInitialized) {
    const legacySource = character.lightSource;
    const legacyHidden = character.lightHidden;
    const legacyShield = character.shieldReadied;
    character.lightSpellLit = legacySource === "light-spell";
    for (const item of character.gear) {
      if (handItemKind(item)) item.equipped = false;
    }
    const weapon = character.gear.findIndex(item => handItemKind(item) === "weapon" && canEquip(item));
    const shield = character.gear.findIndex(item => handItemKind(item) === "shield" && canEquip(item));
    if (weapon >= 0) equipItem(character, weapon, true);
    if (shield >= 0 && legacyShield !== false && !isTwoHandedWeapon(character.gear[weapon])) equipItem(character, shield, true);
    const lamp = ["torch", "lantern"].includes(legacySource)
      ? character.gear.findIndex(item => handItemKind(item) === legacySource) : -1;
    if (lamp >= 0) {
      character.gear[lamp].lit = true;
      character.gear[lamp].covered = legacyHidden === true;
      equipItem(character, lamp, true);
    }
    character.equipmentInitialized = true;
  }
  const held = new Set();
  for (const item of character.gear) {
    const kind = handItemKind(item);
    const slot = ["torch", "lantern"].includes(kind) ? "light" : kind;
    if (!kind || !item.equipped) continue;
    if (held.has(slot) || !canEquip(item)) item.equipped = false;
    else held.add(slot);
  }
  const weapon = character.gear.find(item => item.equipped && handItemKind(item) === "weapon");
  for (const item of character.gear) {
    if ((isTwoHandedWeapon(weapon) && item !== weapon) ||
        (held.has("weapon") && held.has("shield") && ["torch", "lantern"].includes(handItemKind(item)))) item.equipped = false;
  }
  syncEquipmentLight(character);
}

export function syncEquipmentLight(character) {
  const light = (character.gear || []).find(item => item.equipped && item.lit &&
    ["torch", "lantern"].includes(handItemKind(item)));
  const source = light ? handItemKind(light) : character.lightSpellLit ? "light-spell" : "";
  character.lightSource = source;
  character.lightHidden = light?.covered === true;
  character.lightRadius = light && !light.covered ? (source === "lantern" ? 12 : DEFAULT_LIGHT_RADIUS)
    : character.lightSpellLit ? DEFAULT_LIGHT_RADIUS : 0;
  character.shieldReadied = (character.gear || []).some(item => item.equipped && handItemKind(item) === "shield");
  character.raw ||= {};
  for (const key of ["equipmentInitialized", "lightSpellLit", "lightSource", "lightHidden", "lightRadius", "shieldReadied"]) {
    character.raw[key] = character[key];
  }
}

export function hasOccupiedOffHand(character) {
  return (character.gear || []).some(item => item.equipped && ["shield", "torch", "lantern"].includes(handItemKind(item)));
}

export function equipImportLoadout(character, { needsLight, weapons, shieldAllowed, lanternFueled }) {
  const gear = character.gear || [];
  const dexPreferred = Number(character.stats?.DEX ?? 10) >= Number(character.stats?.STR ?? 10);
  const candidates = weapons.map(weapon => ({ ...weapon,
    kind: "weapon", hands: isTwoHandedWeapon(gear[weapon.index]) ? 2 : 1,
    priority: weapon.mastered ? 1
      : dexPreferred && weapon.ability === "DEX" ? (weapon.ranged ? 3 : 4)
      : !dexPreferred && weapon.ability === "STR" ? 5
      : weapon.ability === "DEX" ? (weapon.ranged ? 8 : 9) : (weapon.ranged ? 10 : 11)
  }));
  const compare = (a, b) => a.priority - b.priority || (b.maxDamage || 0) - (a.maxDamage || 0) || a.index - b.index;
  const preferredWeapon = [...candidates].sort(compare)[0];
  if (!needsLight && preferredWeapon?.hands === 2) preferredWeapon.priority = Math.min(preferredWeapon.priority, 1.5);
  gear.forEach((item, index) => {
    const kind = handItemKind(item);
    if (kind === "shield" && shieldAllowed) candidates.push({ index, kind, hands: 1, priority: 2 });
    if (kind === "torch" || (kind === "lantern" && (lanternFueled || item.lit))) {
      candidates.push({ index, kind: "light", hands: 1, priority: needsLight ? 0 : 6, maxDamage: kind === "lantern" ? 1 : 0 });
    }
    if (kind) item.equipped = false;
  });
  let freeHands = 2;
  const selectedKinds = new Set();
  // Lower-priority items never replace a higher-priority choice during import.
  for (const candidate of candidates.sort(compare)) {
    if (selectedKinds.has(candidate.kind) || candidate.hands > freeHands) continue;
    gear[candidate.index].equipped = true;
    selectedKinds.add(candidate.kind);
    freeHands -= candidate.hands;
  }
  syncEquipmentLight(character);
}
