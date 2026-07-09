export function normalizeAngledWallAssetName(asset) {
  if (!asset) {
    return "";
  }
  const fileName = String(asset || "").split(/[\\/]/).pop();
  return fileName.endsWith(".png") ? fileName : `${fileName}.png`;
}

function normalizeAngledWallMeta(tile) {
  const raw = tile?.meta?.angledWall || tile?.angledWall || null;
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

export function createAngledWallTileMeta(asset, options = {}) {
  return {
    kind: options.kind || "corner",
    corner: options.corner || null,
    asset: normalizeAngledWallAssetName(asset),
    rotationTurns: Number(options.rotationTurns ?? options.rotation ?? 0) || 0,
    flipX: options.flipX === true || options.flippedX === true,
    flipY: options.flipY === true || options.flippedY === true,
    blocksMovement: options.blocksMovement === true,
    blocksLight: options.blocksLight === true
  };
}

export function setAngledWallTileMeta(tile, asset, options = {}) {
  if (!tile) {
    return null;
  }
  if (!tile.meta || typeof tile.meta !== "object") {
    tile.meta = {};
  }
  tile.meta.angledWall = createAngledWallTileMeta(asset, options);
  return tile.meta.angledWall;
}

export function clearAngledWallTileMeta(tile) {
  if (tile?.meta?.angledWall) {
    delete tile.meta.angledWall;
  }
}

export function getAngledWallTileData(tile) {
  const meta = normalizeAngledWallMeta(tile);
  if (!meta) {
    return null;
  }
  const asset = normalizeAngledWallAssetName(meta.asset);
  if (!asset) {
    return null;
  }
  return {
    kind: meta.kind || "corner",
    corner: meta.corner || null,
    asset,
    rotationTurns: Number(meta.rotationTurns ?? meta.rotation ?? 0) || 0,
    flipX: meta.flipX === true || meta.flippedX === true,
    flipY: meta.flipY === true || meta.flippedY === true,
    blocksMovement: meta.blocksMovement === true,
    blocksLight: meta.blocksLight === true
  };
}

export function isAngledWallMovementBlockingTile(tile) {
  return getAngledWallTileData(tile)?.blocksMovement === true;
}

export function isAngledWallLightBlockingTile(tile) {
  return getAngledWallTileData(tile)?.blocksLight === true;
}
