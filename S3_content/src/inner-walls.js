export function normalizeInnerWallAssetName(asset) {
  if (!asset) {
    return "";
  }
  const fileName = String(asset || "").split(/[\\/]/).pop();
  return fileName.endsWith(".png") ? fileName : `${fileName}.png`;
}

function normalizeInnerWallMeta(tile) {
  const raw = tile?.meta?.innerWall || tile?.innerWall || null;
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

export function createInnerWallTileMeta(asset, options = {}) {
  return {
    kind: options.kind || "run",
    asset: normalizeInnerWallAssetName(asset),
    rotationTurns: Number(options.rotationTurns ?? options.rotation ?? 0) || 0,
    flipX: options.flipX === true || options.flippedX === true,
    flipY: options.flipY === true || options.flippedY === true,
    blocksMovement: options.blocksMovement !== false
  };
}

export function setInnerWallTileMeta(tile, asset, options = {}) {
  if (!tile) {
    return null;
  }
  if (!tile.meta || typeof tile.meta !== "object") {
    tile.meta = {};
  }
  tile.meta.innerWall = createInnerWallTileMeta(asset, options);
  return tile.meta.innerWall;
}

export function clearInnerWallTileMeta(tile) {
  if (tile?.meta?.innerWall) {
    delete tile.meta.innerWall;
  }
}

export function getInnerWallTileData(tile) {
  const meta = normalizeInnerWallMeta(tile);
  if (!meta) {
    return null;
  }
  const asset = normalizeInnerWallAssetName(meta.asset);
  if (!asset) {
    return null;
  }
  return {
    kind: meta.kind || "run",
    asset,
    rotationTurns: Number(meta.rotationTurns ?? meta.rotation ?? 0) || 0,
    flipX: meta.flipX === true || meta.flippedX === true,
    flipY: meta.flipY === true || meta.flippedY === true,
    blocksMovement: meta.blocksMovement !== false
  };
}

function transformInnerWallSide(side, rotationTurns = 0, flipX = false, flipY = false) {
  const vectors = {
    north: { x: 0, y: -1 },
    east: { x: 1, y: 0 },
    south: { x: 0, y: 1 },
    west: { x: -1, y: 0 }
  };
  let vector = vectors[side] || vectors.north;
  if (flipX) {
    vector = { x: -vector.x, y: vector.y };
  }
  if (flipY) {
    vector = { x: vector.x, y: -vector.y };
  }
  let { x, y } = vector;
  for (let i = 0; i < ((rotationTurns % 4) + 4) % 4; i += 1) {
    const nextX = -y;
    const nextY = x;
    x = nextX;
    y = nextY;
  }
  if (x === 0 && y === -1) return "north";
  if (x === 1 && y === 0) return "east";
  if (x === 0 && y === 1) return "south";
  return "west";
}

function getDefaultInnerWallConnectedSides(kind) {
  if (kind === "cap") return ["south"];
  if (kind === "corner") return ["north", "west"];
  if (kind === "t") return ["south", "east", "west"];
  if (kind === "cross") return ["north", "east", "south", "west"];
  if (kind === "pillar") return [];
  return ["north", "south"];
}

export function getInnerWallConnectedSides(tileOrData) {
  const data = tileOrData?.asset ? tileOrData : getInnerWallTileData(tileOrData);
  if (!data) {
    return [];
  }
  return [...new Set(getDefaultInnerWallConnectedSides(data.kind || "run")
    .map((side) => transformInnerWallSide(side, data.rotationTurns, data.flipX, data.flipY)))];
}

export function isInnerWallBlockingTile(tile) {
  return getInnerWallTileData(tile)?.blocksMovement === true;
}
