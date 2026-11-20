import {
  CROP_CATALOG,
  GRID_MAX,
  GRID_MIN,
  STARTER_FREE_PLOTS,
  TILE_SIZE,
  TOOL_CATALOG,
  VOXELS_PER_PLOT,
  VOXELS_PER_SIDE,
  VOXEL_SIZE,
  createCropInventoryItem,
  createEmptyVoxels,
  createSeedInventoryItem,
  createToolInventoryItem,
  getLandSquarePrice,
  gridKey,
  isTownPlazaTile,
} from './catalog';
import type {
  CropId,
  InventoryItem,
  InventorySortKey,
  ItemRarity,
  LandSquare,
  PlayerProfile,
  VoxelCell,
} from './types';

export function worldToGrid(x: number, z: number): { gx: number; gz: number } {
  const gx = Math.floor(x / TILE_SIZE);
  const gz = Math.floor(z / TILE_SIZE);
  return { gx, gz };
}

export function gridToWorldCenter(gx: number, gz: number): { x: number; z: number } {
  return {
    x: (gx + 0.5) * TILE_SIZE,
    z: (gz + 0.5) * TILE_SIZE,
  };
}

export function worldToVoxel(x: number, z: number): {
  gx: number;
  gz: number;
  vx: number;
  vz: number;
  vIdx: number;
} {
  const { gx, gz } = worldToGrid(x, z);
  const localX = x - gx * TILE_SIZE;
  const localZ = z - gz * TILE_SIZE;
  const vx = Math.max(0, Math.min(VOXELS_PER_SIDE - 1, Math.floor(localX / VOXEL_SIZE)));
  const vz = Math.max(0, Math.min(VOXELS_PER_SIDE - 1, Math.floor(localZ / VOXEL_SIZE)));
  return { gx, gz, vx, vz, vIdx: vz * VOXELS_PER_SIDE + vx };
}

export function voxelToWorldCenter(gx: number, gz: number, vIdx: number): { x: number; z: number } {
  const vx = vIdx % VOXELS_PER_SIDE;
  const vz = Math.floor(vIdx / VOXELS_PER_SIDE);
  return {
    x: gx * TILE_SIZE + (vx + 0.5) * VOXEL_SIZE,
    z: gz * TILE_SIZE + (vz + 0.5) * VOXEL_SIZE,
  };
}

export function normalizePlot(plot: LandSquare): LandSquare {
  if (Array.isArray(plot.voxels) && plot.voxels.length === VOXELS_PER_PLOT) {
    return plot;
  }
  return {
    ...plot,
    voxels: createEmptyVoxels(),
  };
}

export function findFreeStarterCluster(
  plots: Record<string, LandSquare>,
  count = STARTER_FREE_PLOTS,
): LandSquare[] {
  // Search outward from center (0, 0) for a connected cluster of `count` unowned plots
  const allFree = Object.values(plots)
    .filter((p) => !p.ownerId && !isTownPlazaTile(p.gx, p.gz))
    .sort((a, b) => Math.abs(a.gx) + Math.abs(a.gz) - (Math.abs(b.gx) + Math.abs(b.gz)));

  for (const seed of allFree) {
    const picked: LandSquare[] = [seed];
    const pickedSet = new Set<string>([seed.key]);
    while (picked.length < count) {
      let added = false;
      for (const p of picked) {
        const dirs = [
          gridKey(p.gx + 1, p.gz),
          gridKey(p.gx - 1, p.gz),
          gridKey(p.gx, p.gz + 1),
          gridKey(p.gx, p.gz - 1),
        ];
        for (const nk of dirs) {
          const cand = plots[nk];
          if (cand && !cand.ownerId && !pickedSet.has(nk)) {
            picked.push(cand);
            pickedSet.add(nk);
            added = true;
            break;
          }
        }
        if (added) break;
      }
      if (!added) break;
    }
    if (picked.length === count) return picked;
  }
  return allFree.slice(0, count);
}

export function isPlotAdjacentToOwned(
  gx: number,
  gz: number,
  uid: string,
  plots: Record<string, LandSquare>,
): boolean {
  const owned = Object.values(plots).filter((p) => p.ownerId === uid);
  if (owned.length === 0) return true; // Very first plot can be picked anywhere unowned!
  const neighbors = [
    gridKey(gx + 1, gz),
    gridKey(gx - 1, gz),
    gridKey(gx, gz + 1),
    gridKey(gx, gz - 1),
  ];
  return neighbors.some((k) => plots[k]?.ownerId === uid);
}

export function getPurchasableAdjacentPlots(
  uid: string,
  plots: Record<string, LandSquare>,
): LandSquare[] {
  return Object.values(plots)
    .filter((p) => !p.ownerId && isPlotAdjacentToOwned(p.gx, p.gz, uid, plots))
    .sort((a, b) => Math.abs(a.gx) + Math.abs(a.gz) - (Math.abs(b.gx) + Math.abs(b.gz)));
}

export interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

export function purchaseLandSquare(
  player: PlayerProfile,
  targetKey: string,
  plots: Record<string, LandSquare>,
): ActionResult<{ player: PlayerProfile; plot: LandSquare; price: number; isFreeStarter: boolean }> {
  const plot = plots[targetKey];
  if (!plot) {
    return { ok: false, error: 'Цю ділянку не знайдено на карті.' };
  }
  if (plot.ownerId) {
    return {
      ok: false,
      error: `Ця земля вже належить гравцю ${plot.ownerName ?? 'іншому фермеру'}.`,
    };
  }
  const ownedCount = Object.values(plots).filter((p) => p.ownerId === player.uid).length;
  if (ownedCount > 0 && !isPlotAdjacentToOwned(plot.gx, plot.gz, player.uid, plots)) {
    return {
      ok: false,
      error:
        ownedCount < STARTER_FREE_PLOTS
          ? 'Стартові 4 ділянки мають бути по сусідству! Оберіть квадрат поруч із вашим.'
          : 'Купувати можна лише сусідній квадрат біля вашої ділянки.',
    };
  }

  const isFreeStarter = ownedCount < STARTER_FREE_PLOTS || player.freeClaimsRemaining > 0;
  const price = isFreeStarter ? 0 : getLandSquarePrice(ownedCount);
  if (player.coins < price) {
    return { ok: false, error: `Недостатньо монет! Потрібно ${price} монет.` };
  }

  const updatedPlot: LandSquare = {
    ...normalizePlot(plot),
    ownerId: player.uid,
    ownerName: player.nickname,
    ownerColor: player.color,
  };
  const nextFree = Math.max(0, player.freeClaimsRemaining - (isFreeStarter ? 1 : 0));
  const updatedPlayer: PlayerProfile = {
    ...player,
    coins: player.coins - price,
    ownedCount: ownedCount + 1,
    freeClaimsRemaining: nextFree,
  };
  return {
    ok: true,
    data: { player: updatedPlayer, plot: updatedPlot, price, isFreeStarter },
  };
}

export function buyShopItem(
  coins: number,
  inventory: InventoryItem[],
  itemId: string,
  quantity = 1,
): ActionResult<{ coins: number; inventory: InventoryItem[] }> {
  if (quantity <= 0) {
    return { ok: false, error: 'Кількість має бути більшою за 0.' };
  }

  const toolDef = TOOL_CATALOG[itemId];
  if (toolDef) {
    if (toolDef.buyPrice === null) {
      return { ok: false, error: 'Цей інструмент отримується лише покращенням.' };
    }
    const alreadyHasFamily = inventory.some(
      (i) => i.kind === 'tool' && i.toolFamily === toolDef.toolFamily,
    );
    if (alreadyHasFamily) {
      return { ok: false, error: 'У вас вже є інструмент цього типу. Покращуйте його в інвентарі!' };
    }
    if (coins < toolDef.buyPrice) {
      return { ok: false, error: `Потрібно ${toolDef.buyPrice} монет.` };
    }
    const nextInventory = [...inventory, createToolInventoryItem(itemId)];
    return { ok: true, data: { coins: coins - toolDef.buyPrice, inventory: nextInventory } };
  }

  const cropDef = Object.values(CROP_CATALOG).find((c) => c.seedItemId === itemId);
  if (cropDef) {
    const totalCost = cropDef.seedPrice * quantity;
    if (coins < totalCost) {
      return { ok: false, error: `Потрібно ${totalCost} монет.` };
    }
    const existingIdx = inventory.findIndex((i) => i.itemId === itemId);
    const nextInventory = inventory.map((item) => ({ ...item }));
    if (existingIdx >= 0) {
      nextInventory[existingIdx].quantity += quantity;
    } else {
      nextInventory.push(createSeedInventoryItem(cropDef.cropId, quantity));
    }
    return { ok: true, data: { coins: coins - totalCost, inventory: nextInventory } };
  }

  return { ok: false, error: 'Невідомий товар крамниці.' };
}

export function sellCropFromInventory(
  coins: number,
  inventory: InventoryItem[],
  itemId: string,
  quantity = 1,
): ActionResult<{ coins: number; inventory: InventoryItem[]; earned: number }> {
  const idx = inventory.findIndex((i) => i.itemId === itemId && i.kind === 'crop');
  if (idx < 0) {
    return { ok: false, error: 'Врожай не знайдено в інвентарі.' };
  }
  const item = inventory[idx];
  const sellQty = Math.min(quantity, item.quantity);
  if (sellQty <= 0) {
    return { ok: false, error: 'Немає плодів для продажу.' };
  }
  const earned = item.value * sellQty;
  const nextInventory = inventory
    .map((entry, i) => (i === idx ? { ...entry, quantity: entry.quantity - sellQty } : entry))
    .filter((entry) => entry.quantity > 0);
  return { ok: true, data: { coins: coins + earned, inventory: nextInventory, earned } };
}

export function upgradeToolInInventory(
  coins: number,
  inventory: InventoryItem[],
  itemId: string,
): ActionResult<{ coins: number; inventory: InventoryItem[]; newTool: InventoryItem }> {
  const idx = inventory.findIndex((i) => i.itemId === itemId && i.kind === 'tool');
  if (idx < 0) {
    return { ok: false, error: 'Інструмент не знайдено в інвентарі.' };
  }
  const def = TOOL_CATALOG[itemId];
  if (!def || !def.upgradeToId || def.upgradeCost === null) {
    return { ok: false, error: 'Цей інструмент вже максимального рівня!' };
  }
  if (coins < def.upgradeCost) {
    return { ok: false, error: `Для покращення потрібно ${def.upgradeCost} монет.` };
  }
  const upgraded = createToolInventoryItem(def.upgradeToId);
  const nextInventory = inventory.map((item, i) => (i === idx ? upgraded : item));
  return {
    ok: true,
    data: {
      coins: coins - def.upgradeCost,
      inventory: nextInventory,
      newTool: upgraded,
    },
  };
}

const RARITY_ORDER: Record<ItemRarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
};

const KIND_ORDER: Record<InventoryItem['kind'], number> = {
  tool: 1,
  seed: 2,
  crop: 3,
};

export function sortInventory(
  items: InventoryItem[],
  sortBy: InventorySortKey,
  direction: 'asc' | 'desc' = 'asc',
): InventoryItem[] {
  const copy = [...items];
  const mul = direction === 'asc' ? 1 : -1;
  copy.sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'type') {
      cmp = KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.tier - a.tier;
    } else if (sortBy === 'price') {
      cmp = a.value - b.value;
    } else if (sortBy === 'quantity') {
      cmp = a.quantity - b.quantity;
    } else if (sortBy === 'rarity') {
      cmp = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.tier - b.tier;
    } else {
      cmp = a.name.localeCompare(b.name, 'uk');
    }
    if (cmp === 0) {
      cmp = a.name.localeCompare(b.name, 'uk');
    }
    return cmp * mul;
  });
  return copy;
}

export function computeVoxelGrowth(
  cell: VoxelCell,
  nowMs: number,
): { stage: 0 | 1 | 2 | 3; progress: number; ready: boolean } {
  if (!cell.cropId || !cell.plantedAt) {
    return { stage: 0, progress: 0, ready: false };
  }
  const def = CROP_CATALOG[cell.cropId];
  const boost = Math.max(1, cell.growthBoost || 1);
  const elapsedSec = Math.max(0, (nowMs - cell.plantedAt) / 1000) * boost;
  const progress = Math.min(1, elapsedSec / def.growthSeconds);
  if (progress >= 1) return { stage: 3, progress: 1, ready: true };
  if (progress >= 0.62) return { stage: 2, progress, ready: false };
  if (progress >= 0.25) return { stage: 1, progress, ready: false };
  return { stage: 0, progress, ready: false };
}

export function summarizePlotVoxels(
  plot: LandSquare,
  nowMs: number,
): {
  grassCount: number;
  tilledCount: number;
  wateredCount: number;
  plantedCount: number;
  readyCount: number;
  maxProgress: number;
  sampleCropId: CropId | null;
} {
  const norm = normalizePlot(plot);
  let grassCount = 0;
  let tilledCount = 0;
  let wateredCount = 0;
  let plantedCount = 0;
  let readyCount = 0;
  let maxProgress = 0;
  let sampleCropId: CropId | null = null;

  for (const v of norm.voxels) {
    if (v.soil === 'grass') grassCount++;
    else if (v.soil === 'tilled') tilledCount++;
    else wateredCount++;
    if (v.cropId) {
      plantedCount++;
      sampleCropId = sampleCropId || v.cropId;
      const g = computeVoxelGrowth(v, nowMs);
      if (g.ready) readyCount++;
      if (g.progress > maxProgress) maxProgress = g.progress;
    }
  }
  return { grassCount, tilledCount, wateredCount, plantedCount, readyCount, maxProgress, sampleCropId };
}

function getVoxelOrderFromTarget(centerVIdx: number): number[] {
  const cx = centerVIdx % VOXELS_PER_SIDE;
  const cz = Math.floor(centerVIdx / VOXELS_PER_SIDE);
  const indices = Array.from({ length: VOXELS_PER_PLOT }, (_, i) => i);
  indices.sort((a, b) => {
    const ax = a % VOXELS_PER_SIDE;
    const az = Math.floor(a / VOXELS_PER_SIDE);
    const bx = b % VOXELS_PER_SIDE;
    const bz = Math.floor(b / VOXELS_PER_SIDE);
    const da = Math.abs(ax - cx) + Math.abs(az - cz);
    const db = Math.abs(bx - cx) + Math.abs(bz - cz);
    return da - db || a - b;
  });
  return indices;
}

export function tillVoxelsOnPlot(
  plot: LandSquare,
  uid: string,
  hoeItem: InventoryItem | undefined,
  centerVIdx = 4,
): ActionResult<{ plot: LandSquare; tilledCount: number }> {
  if (plot.ownerId !== uid) {
    return { ok: false, error: 'Можна обробляти лише власну землю!' };
  }
  if (!hoeItem || hoeItem.kind !== 'tool' || hoeItem.toolFamily !== 'hoe') {
    return { ok: false, error: 'Оберіть мотику в руках, щоб скопати вокселі землі.' };
  }
  const norm = normalizePlot(plot);
  const area = Math.max(1, hoeItem.stats.areaVoxels ?? 1);
  const order = getVoxelOrderFromTarget(centerVIdx);
  const nextVoxels = norm.voxels.map((v) => ({ ...v }));

  let tilledCount = 0;
  for (const idx of order) {
    if (nextVoxels[idx].soil === 'grass') {
      nextVoxels[idx].soil = 'tilled';
      tilledCount++;
      if (tilledCount >= area) break;
    }
  }
  if (tilledCount === 0) {
    return { ok: false, error: 'Усі 9 вокселів цієї ділянки вже скопані.' };
  }
  return {
    ok: true,
    data: {
      plot: { ...norm, voxels: nextVoxels },
      tilledCount,
    },
  };
}

export function waterVoxelsOnPlot(
  plot: LandSquare,
  uid: string,
  canItem: InventoryItem | undefined,
  centerVIdx: number,
  nowMs: number,
): ActionResult<{ plot: LandSquare; wateredCount: number }> {
  if (plot.ownerId !== uid) {
    return { ok: false, error: 'Це ділянка іншого гравця.' };
  }
  if (!canItem || canItem.kind !== 'tool' || canItem.toolFamily !== 'watering_can') {
    return { ok: false, error: 'Оберіть лійку, щоб полити грядку.' };
  }
  const norm = normalizePlot(plot);
  const area = Math.max(1, canItem.stats.areaVoxels ?? 1);
  const speed = canItem.stats.speedMultiplier ?? 1.35;
  const order = getVoxelOrderFromTarget(centerVIdx);
  const nextVoxels = norm.voxels.map((v) => ({ ...v }));

  let wateredCount = 0;
  for (const idx of order) {
    if (nextVoxels[idx].soil === 'tilled') {
      nextVoxels[idx].soil = 'watered';
      nextVoxels[idx].wateredAt = nowMs;
      nextVoxels[idx].growthBoost = Math.max(nextVoxels[idx].growthBoost || 1, speed);
      wateredCount++;
      if (wateredCount >= area) break;
    }
  }
  if (wateredCount === 0) {
    return { ok: false, error: 'Спочатку скопайте вокселі мотикою (або вже полито).' };
  }
  return {
    ok: true,
    data: {
      plot: { ...norm, voxels: nextVoxels },
      wateredCount,
    },
  };
}

export function plantVoxelOnPlot(
  plot: LandSquare,
  uid: string,
  inventory: InventoryItem[],
  cropId: CropId,
  centerVIdx: number,
  nowMs: number,
): ActionResult<{ plot: LandSquare; inventory: InventoryItem[]; plantedVIdx: number }> {
  if (plot.ownerId !== uid) {
    return { ok: false, error: 'Можна сіяти лише на власній ділянці!' };
  }
  const def = CROP_CATALOG[cropId];
  const seedIdx = inventory.findIndex((i) => i.itemId === def.seedItemId && i.quantity > 0);
  if (seedIdx < 0) {
    return { ok: false, error: `У вас закінчилося "${def.seedName}".` };
  }

  const norm = normalizePlot(plot);
  const order = getVoxelOrderFromTarget(centerVIdx);
  const targetIdx = order.find((idx) => norm.voxels[idx].soil !== 'grass' && !norm.voxels[idx].cropId);
  if (targetIdx === undefined) {
    const hasGrass = norm.voxels.some((v) => v.soil === 'grass');
    return {
      ok: false,
      error: hasGrass
        ? 'Спочатку скопайте вокселі мотикою!'
        : 'Усі 9 вокселів цієї ділянки вже засіяні.',
    };
  }

  const nextVoxels = norm.voxels.map((v, i) =>
    i === targetIdx ? { ...v, cropId, plantedAt: nowMs } : { ...v },
  );
  const nextInventory = inventory
    .map((item, idx) => (idx === seedIdx ? { ...item, quantity: item.quantity - 1 } : item))
    .filter((item) => item.quantity > 0);

  return {
    ok: true,
    data: {
      plot: { ...norm, voxels: nextVoxels },
      inventory: nextInventory,
      plantedVIdx: targetIdx,
    },
  };
}

export function harvestVoxelsOnPlot(
  plot: LandSquare,
  uid: string,
  inventory: InventoryItem[],
  hoeItem: InventoryItem | undefined,
  centerVIdx: number,
  nowMs: number,
  rngRoll = Math.random(),
): ActionResult<{
  plot: LandSquare;
  inventory: InventoryItem[];
  harvestedQty: number;
  harvestedVoxels: number;
  summaryText: string;
}> {
  if (plot.ownerId !== uid) {
    return { ok: false, error: 'Не можна збирати чужий врожай!' };
  }
  const norm = normalizePlot(plot);
  const area = Math.max(1, hoeItem?.stats.areaVoxels ?? 1);
  const order = getVoxelOrderFromTarget(centerVIdx);
  const nextVoxels = norm.voxels.map((v) => ({ ...v }));
  const bonusPct = hoeItem?.stats.yieldBonusPct ?? 0;

  let harvestedVoxels = 0;
  let totalQty = 0;
  const countsByCrop = new Map<CropId, number>();

  for (const idx of order) {
    const v = nextVoxels[idx];
    if (!v.cropId) continue;
    const g = computeVoxelGrowth(v, nowMs);
    if (!g.ready) continue;

    let qty = 1 + Math.floor(bonusPct / 100);
    const remPct = bonusPct % 100;
    if (remPct > 0 && rngRoll * 100 < remPct) qty += 1;

    countsByCrop.set(v.cropId, (countsByCrop.get(v.cropId) || 0) + qty);
    totalQty += qty;
    harvestedVoxels++;
    nextVoxels[idx] = {
      soil: 'tilled',
      cropId: null,
      plantedAt: null,
      wateredAt: null,
      growthBoost: 1,
    };
    if (harvestedVoxels >= area) break;
  }

  if (harvestedVoxels === 0) {
    const anyPlanted = norm.voxels.some((v) => v.cropId !== null);
    if (!anyPlanted) {
      return { ok: false, error: 'На цій ділянці немає посаджених культур.' };
    }
    return { ok: false, error: 'Культури на цій ділянці ще дозрівають!' };
  }

  const nextInventory = inventory.map((item) => ({ ...item }));
  const labelParts: string[] = [];
  for (const [cropId, qty] of countsByCrop.entries()) {
    const def = CROP_CATALOG[cropId];
    labelParts.push(`${def.cropName} ×${qty}`);
    const existingIdx = nextInventory.findIndex((i) => i.itemId === def.cropItemId);
    if (existingIdx >= 0) {
      nextInventory[existingIdx].quantity += qty;
    } else {
      nextInventory.push(createCropInventoryItem(cropId, qty));
    }
  }

  return {
    ok: true,
    data: {
      plot: { ...norm, voxels: nextVoxels },
      inventory: nextInventory,
      harvestedQty: totalQty,
      harvestedVoxels,
      summaryText: labelParts.join(', '),
    },
  };
}

export function resolvePlayerMovement(
  x: number,
  z: number,
  dx: number,
  dz: number,
  dt: number,
  speed = 6.8,
): { x: number; z: number; yaw: number; moved: boolean } {
  const len = Math.hypot(dx, dz);
  if (len < 0.001) {
    return { x, z, yaw: 0, moved: false };
  }
  const nx = dx / len;
  const nz = dz / len;
  const step = speed * dt;
  const minBound = GRID_MIN * TILE_SIZE + 0.5;
  const maxBound = (GRID_MAX + 1) * TILE_SIZE - 0.5;

  let nextX = Math.max(minBound, Math.min(maxBound, x + nx * step));
  let nextZ = Math.max(minBound, Math.min(maxBound, z + nz * step));

  // Town Hall solid footprint in NW plaza (-12..-9)
  const hallMinX = -11.5 * TILE_SIZE;
  const hallMaxX = -9.4 * TILE_SIZE;
  const hallMinZ = -11.5 * TILE_SIZE;
  const hallMaxZ = -9.7 * TILE_SIZE;

  if (nextX > hallMinX && nextX < hallMaxX && nextZ > hallMinZ && nextZ < hallMaxZ) {
    const penLeft = Math.abs(nextX - hallMinX);
    const penRight = Math.abs(hallMaxX - nextX);
    const penTop = Math.abs(nextZ - hallMinZ);
    const penBottom = Math.abs(hallMaxZ - nextZ);
    const minPen = Math.min(penLeft, penRight, penTop, penBottom);
    if (minPen === penLeft) nextX = hallMinX;
    else if (minPen === penRight) nextX = hallMaxX;
    else if (minPen === penTop) nextZ = hallMinZ;
    else nextZ = hallMaxZ;
  }

  return {
    x: nextX,
    z: nextZ,
    yaw: Math.atan2(nx, nz),
    moved: true,
  };
}
