const ORGANIC_SIGNATURE_PATTERN = /(NW[ox]NE[ox]SE[ox]SW[ox]N[ox]E[ox]S[ox]W[ox])/i;

export const ORGANIC_SIDES = Object.freeze(["north", "east", "south", "west"]);
export const ORGANIC_OPPOSITE_SIDE = Object.freeze({
  north: "south",
  east: "west",
  south: "north",
  west: "east"
});

const SIDE_TO_VECTOR = Object.freeze({
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0]
});
const CORNER_TO_VECTOR = Object.freeze({
  nw: [-1, -1],
  ne: [1, -1],
  se: [1, 1],
  sw: [-1, 1]
});

function normalizeFilledValue(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (value === true || text === "o" || text === "filled" || text === "blocked" || text === "closed") {
    return "o";
  }
  return "x";
}

export function normalizeOrganicAssetName(asset) {
  if (!asset) {
    return "";
  }
  const fileName = String(asset || "").split(/[\\/]/).pop();
  return fileName.endsWith(".png") ? fileName : `${fileName}.png`;
}

export function parseOrganicSignature(value) {
  const match = String(value || "").match(ORGANIC_SIGNATURE_PATTERN);
  if (!match) {
    return null;
  }
  const signature = match[1];
  const pairs = [...signature.matchAll(/(NW|NE|SE|SW|N|E|S|W)([ox])/gi)];
  const data = {
    signature,
    corners: {},
    sides: {}
  };
  for (const [, key, rawValue] of pairs) {
    const normalizedKey = key.toLowerCase();
    const filled = normalizeFilledValue(rawValue);
    if (normalizedKey === "n") data.sides.north = filled;
    if (normalizedKey === "e") data.sides.east = filled;
    if (normalizedKey === "s") data.sides.south = filled;
    if (normalizedKey === "w") data.sides.west = filled;
    if (normalizedKey.length === 2) data.corners[normalizedKey] = filled;
  }
  return data;
}

export function parseOrganicKind(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("org-blocks-")) return "blocks";
  if (text.includes("org-free-")) return "free";
  return null;
}

function vectorToSide(x, y) {
  if (x === 0 && y === -1) return "north";
  if (x === 1 && y === 0) return "east";
  if (x === 0 && y === 1) return "south";
  if (x === -1 && y === 0) return "west";
  return null;
}

function vectorToCorner(x, y) {
  if (x === -1 && y === -1) return "nw";
  if (x === 1 && y === -1) return "ne";
  if (x === 1 && y === 1) return "se";
  if (x === -1 && y === 1) return "sw";
  return null;
}

function transformVector(vector, rotationTurns = 0, flipX = false, flipY = false) {
  let [x, y] = vector;
  if (flipX) x = -x;
  if (flipY) y = -y;
  const turns = ((Number(rotationTurns) || 0) % 4 + 4) % 4;
  for (let index = 0; index < turns; index += 1) {
    [x, y] = [-y, x];
  }
  return [x, y];
}

export function transformOrganicSignature(signatureData, rotationTurns = 0, flipX = false, flipY = false) {
  if (!signatureData) {
    return null;
  }
  const transformed = {
    signature: signatureData.signature || null,
    corners: {},
    sides: {}
  };
  for (const [side, vector] of Object.entries(SIDE_TO_VECTOR)) {
    const [x, y] = transformVector(vector, rotationTurns, flipX, flipY);
    const target = vectorToSide(x, y);
    if (target) {
      transformed.sides[target] = normalizeFilledValue(signatureData.sides?.[side]);
    }
  }
  for (const [corner, vector] of Object.entries(CORNER_TO_VECTOR)) {
    const [x, y] = transformVector(vector, rotationTurns, flipX, flipY);
    const target = vectorToCorner(x, y);
    if (target) {
      transformed.corners[target] = normalizeFilledValue(signatureData.corners?.[corner]);
    }
  }
  return transformed;
}

function normalizeOrganicMeta(tile) {
  const raw = tile?.meta?.organic || tile?.organic || null;
  if (!raw) {
    return null;
  }
  if (typeof raw === "string") {
    return { asset: raw };
  }
  if (typeof raw === "object") {
    return raw;
  }
  return null;
}

function sidesFromMeta(meta) {
  const source = meta?.sides || meta?.edges || null;
  if (!source || typeof source !== "object") {
    return null;
  }
  return {
    north: normalizeFilledValue(source.north ?? source.n),
    east: normalizeFilledValue(source.east ?? source.e),
    south: normalizeFilledValue(source.south ?? source.s),
    west: normalizeFilledValue(source.west ?? source.w)
  };
}

function cornersFromMeta(meta) {
  const source = meta?.corners || null;
  if (!source || typeof source !== "object") {
    return null;
  }
  return {
    nw: normalizeFilledValue(source.nw ?? source.NW),
    ne: normalizeFilledValue(source.ne ?? source.NE),
    se: normalizeFilledValue(source.se ?? source.SE),
    sw: normalizeFilledValue(source.sw ?? source.SW)
  };
}

export function getOrganicTileData(tile) {
  const meta = normalizeOrganicMeta(tile);
  if (!meta) {
    return null;
  }
  const asset = meta.asset ? normalizeOrganicAssetName(meta.asset) : "";
  const kind = meta.kind || parseOrganicKind(asset) || parseOrganicKind(meta.signature);
  const directSides = sidesFromMeta(meta);
  const directCorners = cornersFromMeta(meta);
  const parsed = directSides
    ? { signature: meta.signature || null, corners: directCorners || {}, sides: directSides }
    : parseOrganicSignature(meta.signature || asset);
  if (!parsed) {
    return null;
  }
  const rotationTurns = Number(meta.rotationTurns ?? meta.rotation ?? 0) || 0;
  const flipX = meta.flipX === true || meta.flippedX === true;
  const flipY = meta.flipY === true || meta.flippedY === true;
  const transformed = directSides ? parsed : transformOrganicSignature(parsed, rotationTurns, flipX, flipY);
  return {
    kind,
    asset,
    rotationTurns,
    flipX,
    flipY,
    corners: transformed.corners,
    sides: transformed.sides
  };
}

export function createOrganicTileMeta(asset, options = {}) {
  const normalizedAsset = normalizeOrganicAssetName(asset);
  const signature = options.signature || parseOrganicSignature(normalizedAsset)?.signature || null;
  return {
    kind: options.kind || parseOrganicKind(normalizedAsset) || parseOrganicKind(signature),
    asset: normalizedAsset,
    signature,
    rotationTurns: Number(options.rotationTurns ?? options.rotation ?? 0) || 0,
    flipX: options.flipX === true || options.flippedX === true,
    flipY: options.flipY === true || options.flippedY === true,
    ...(options.sides || options.edges ? { sides: sidesFromMeta(options) } : {}),
    ...(options.corners ? { corners: cornersFromMeta(options) } : {})
  };
}

export function setOrganicTileMeta(tile, asset, options = {}) {
  if (!tile) {
    return null;
  }
  if (!tile.meta || typeof tile.meta !== "object") {
    tile.meta = {};
  }
  tile.meta.organic = createOrganicTileMeta(asset, options);
  return tile.meta.organic;
}

export function clearOrganicTileMeta(tile) {
  if (tile?.meta?.organic) {
    delete tile.meta.organic;
  }
}

export function isOrganicTile(tile) {
  return getOrganicTileData(tile) !== null;
}

export function isOrganicBlockingTile(tile) {
  return getOrganicTileData(tile)?.kind === "blocks";
}

export function isInvalidOrganicFreeTile(tile) {
  const data = getOrganicTileData(tile);
  return data?.kind === "free" && ORGANIC_SIDES.every((side) => data.sides?.[side] === "o");
}

export function isOrganicMovementBlockingTile(tile) {
  return isOrganicBlockingTile(tile) || isInvalidOrganicFreeTile(tile);
}

export function organicBlocksSide(tile, side) {
  const data = getOrganicTileData(tile);
  if (!data) {
    return false;
  }
  return data.sides?.[side] === "o";
}

export function getOrganicBlockedSides(tile) {
  return ORGANIC_SIDES.filter((side) => organicBlocksSide(tile, side));
}

export function directionToOrganicSide(dx, dy) {
  if (dx === 0 && dy === -1) return "north";
  if (dx === 1 && dy === 0) return "east";
  if (dx === 0 && dy === 1) return "south";
  if (dx === -1 && dy === 0) return "west";
  return null;
}

export function canCrossOrganicEdge(fromTile, toTile, dx, dy) {
  const side = directionToOrganicSide(dx, dy);
  if (!side) {
    return true;
  }
  const opposite = ORGANIC_OPPOSITE_SIDE[side];
  return !organicBlocksSide(fromTile, side) && !organicBlocksSide(toTile, opposite);
}
