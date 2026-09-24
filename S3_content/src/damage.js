const DAMAGE_PATTERN = /\b(?:\d+d\d+(?:\s*(?:\+\s*\d+|x\s*\d+|\*\s*\d+))*|d\d+)\b/gi;

export function rollUnarmedAttack(strengthModifier, random = Math.random) {
  const choice = Math.floor(random() * 20) + 1;
  return {
    name: choice <= 10 ? "Punch" : choice <= 18 ? "Kick" : choice === 19 ? "Headbutt" : "Body block",
    bonus: strengthModifier,
    damageExpression: "1",
    detail: "(1), close",
    unarmed: true
  };
}

export function normalizeDamageExpression(expression) {
  let compact = String(expression || "").trim().toLowerCase();
  if (!compact) {
    return "";
  }
  compact = compact.replace(/\s+/g, "");
  compact = compact.replace(/\*/g, "x");
  if (compact.startsWith("d")) {
    compact = `1${compact}`;
  }
  return compact;
}

export function getMaximumDamage(expression) {
  const normalized = normalizeDamageExpression(expression);
  if (normalized.length > 256 || !/^\d+(?:d\d+)?(?:[+-]\d+(?:d\d+)?)*(?:x\d+)*$/.test(normalized)) return 0;
  const [base, ...multipliers] = normalized.split("x");
  const maximum = (base.match(/[+-]?[^+-]+/g) || []).reduce((sum, term) => {
    const sign = term.startsWith("-") ? -1 : 1;
    const body = term.replace(/^[+-]/, "");
    const [count, sides] = body.split("d").map(Number);
    return sum + sign * (sides ? count * (sign > 0 ? sides : 1) : count);
  }, 0) * multipliers.reduce((product, value) => product * Number(value), 1);
  return Number.isFinite(maximum) ? Math.max(0, maximum) : 0;
}

export function extractDamageReferences(text, options = {}) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return [];
  }
  const sentenceParts = normalized.split(/(?<=[.!?])\s+/);
  const references = [];
  sentenceParts.forEach((sentence, index) => {
    const matches = Array.from(sentence.matchAll(DAMAGE_PATTERN));
    if (!matches.length) {
      return;
    }
    const previous = sentenceParts[index - 1]?.toLowerCase() || "";
    const current = sentence.toLowerCase();
    matches.forEach((match) => {
      const expression = normalizeDamageExpression(match[0]);
      const display = (
        options.preferDeathLabel &&
        current.includes("damage") &&
        (current.includes("instantly dies") || previous.includes("instantly dies"))
      )
        ? `Death / ${expression}`
        : expression;
      references.push({
        expression,
        display,
        context: sentence.trim()
      });
    });
  });
  const seen = new Set();
  return references.filter((reference) => {
    const key = JSON.stringify(reference);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function rollDamageExpression(expression, random = Math.random) {
  const normalized = normalizeDamageExpression(expression);
  if (!normalized) {
    throw new Error("No damage expression was provided.");
  }

  const multiplierParts = normalized.split("x");
  const basePart = multiplierParts.shift() || "";
  const multipliers = multiplierParts
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part) && part > 0);
  const tokens = basePart.match(/[+\-]?[^+\-]+/g) || [];
  const detailTerms = [];
  let subtotal = 0;

  tokens.forEach((token) => {
    const sign = token.startsWith("-") ? -1 : 1;
    const body = token.replace(/^[+\-]/, "");
    const diceMatch = body.match(/^(\d*)d(\d+)$/i);
    if (diceMatch) {
      const count = Number.parseInt(diceMatch[1] || "1", 10);
      const sides = Number.parseInt(diceMatch[2], 10);
      for (let index = 0; index < count; index += 1) {
        const roll = Math.floor(random() * sides) + 1;
        subtotal += roll * sign;
        detailTerms.push({
          type: "die",
          label: `1d${sides}`,
          value: roll,
          sign,
          isMinimum: roll === 1,
          isMaximum: roll === sides
        });
      }
      return;
    }

    const flat = Number.parseInt(body, 10);
    if (Number.isFinite(flat)) {
      subtotal += flat * sign;
      detailTerms.push({
        type: "flat",
        label: String(flat),
        value: flat,
        sign,
        isMinimum: false,
        isMaximum: false
      });
    }
  });

  const multiplier = multipliers.reduce((product, value) => product * value, 1);
  const total = subtotal * multiplier;

  return {
    expression: normalized,
    subtotal,
    total,
    multiplier,
    multipliers,
    terms: detailTerms
  };
}
