export function normalizeSpellLookupKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function loadSpellTier(tier) {
  try {
    const response = await fetch(`./spells/tier-${tier}.json`);
    if (!response.ok) {
      throw new Error(`Spell tier ${tier} request failed: ${response.status}`);
    }
    const payload = await response.json();
    return Array.isArray(payload) ? payload : [];
  } catch (error) {
    console.warn(`Using empty fallback for spell tier ${tier}.`, error);
    return [];
  }
}

export async function loadSpellLibrary() {
  const tiers = await Promise.all([1, 2, 3, 4, 5].map((tier) => loadSpellTier(tier)));
  const spells = tiers.flat();
  const lookup = new Map();
  spells.forEach((spell) => {
    const key = normalizeSpellLookupKey(spell?.name);
    if (key && !lookup.has(key)) {
      lookup.set(key, spell);
    }
  });
  return {
    spells,
    lookup
  };
}
