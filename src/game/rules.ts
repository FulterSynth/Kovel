import {
  CROP_CATALOG,
  GRID_MAX,
  GRID_MIN,
  TILE_SIZE,
  TOOL_CATALOG,
  createCropInventoryItem,
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

export function findFreeStarterPlot(plots: Record<string, LandSquare>): LandSquare | null {
  // Prefer central ring near (0,0) -> spiral outward
  const candidates: LandSquare[] = Object.values(plots).filter(
    (p) => !p.ownerId && !isTownPlazaTile(p.gx, p.gz),
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const distA = Math.abs(a.gx) + Math.abs(a.gz);
    const distB = Math.abs(b.gx) + Math.abs(b.gz);
    return distA - distB;
  });
  return candidates[0];
}

export function isPlotAdjacentToOwned(
  gx: number,
  gz: number,
  uid: string,
  plots: Record<string, LandSquare>,
): boolean {
  const owned = Object.values(plots).filter((p) => p.ownerId === uid);
  if (owned.length === 0) return true; // First plot can be claimed anywhere unowned
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
    .sort((a, b) => {
      const da = Math.abs(a.gx) + Math.abs(a.gz);
      const db = Math.abs(b.gx) + Math.abs(b.gz);
      return da - db;
    });
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
): ActionResult<{ player: PlayerProfile; plot: LandSquare; price: number }> {
  const plot = plots[targetKey];
  if (!plot) {
    return { ok: false, error: 'Цю ділянку не знайдено на карті.' };
  }
  if (plot.ownerId) {
    return { ok: false, error: `Ця земля вже належить гравцю ${plot.ownerName ?? 'іншому фермеру'}.` };
  }
  const ownedCount = Object.values(plots).filter((p) => p.ownerId === player.uid).length;
  if (ownedCount > 0 && !isPlotAdjacentToOwned(plot.gx, plot.gz, player.uid, plots)) {
    return { ok: false, error: 'Купувати можна лише сусідній квадрат біля вашої ділянки.' };
  }
  const price = getLandSquarePrice(ownedCount);
  if (player.coins < price) {
    return { ok: false, error: `Недостатньо монет! Потрібно ${price} монет.` };
  }
  const updatedPlot: LandSquare = {
    ...plot,
    ownerId: player.uid,
    ownerName: player.nickname,
    ownerColor: player.color,
  };
  const updatedPlayer: PlayerProfile = {
    ...player,
    coins: player.coins - price,
    ownedCount: ownedCount + 1,
  };
  return { ok: true, data: { player: updatedPlayer, plot: updatedPlot, price } };
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

  // Tool purchase
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

  // Seed purchase
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

export function computeCropGrowth(
  plot: LandSquare,
  nowMs: number,
): { stage: 0 | 1 | 2 | 3; progress: number; ready: boolean } {
  if (!plot.cropId || !plot.plantedAt) {
    return { stage: 0, progress: 0, ready: false };
  }
  const def = CROP_CATALOG[plot.cropId];
  const boost = Math.max(1, plot.growthBoost || 1);
  const elapsedSec = Math.max(0, (nowMs - plot.plantedAt) / 1000) * boost;
  const progress = Math.min(1, elapsedSec / def.growthSeconds);
  if (progress >= 1) return { stage: 3, progress: 1, ready: true };
  if (progress >= 0.62) return { stage: 2, progress, ready: false };
  if (progress >= 0.25) return { stage: 1, progress, ready: false };
  return { stage: 0, progress, ready: false };
}

export function tillPlot(
  plot: LandSquare,
  uid: string,
  hoeItem: InventoryItem | undefined,
): ActionResult<LandSquare> {
  if (plot.ownerId !== uid) {
    return { ok: false, error: 'Можна обробляти лише власну землю!' };
  }
  if (!hoeItem || hoeItem.kind !== 'tool' || hoeItem.toolFamily !== 'hoe') {
    return { ok: false, error: 'Оберіть мотику в руках, щоб скопати землю.' };
  }
  if (plot.soil !== 'grass') {
    return { ok: false, error: 'Цей квадрат землі вже скопаний.' };
  }
  return {
    ok: true,
    data: {
      ...plot,
      soil: 'tilled',
    },
  };
}

export function waterPlot(
  plot: LandSquare,
  uid: string,
  canItem: InventoryItem | undefined,
  nowMs: number,
): ActionResult<LandSquare> {
  if (plot.ownerId !== uid) {
    return { ok: false, error: 'Це ділянка іншого гравця.' };
  }
  if (!canItem || canItem.kind !== 'tool' || canItem.toolFamily !== 'watering_can') {
    return { ok: false, error: 'Оберіть лійку, щоб полити грядку.' };
  }
  if (plot.soil === 'grass') {
    return { ok: false, error: 'Спочатку скопайте землю мотикою.' };
  }
  const speed = canItem.stats.speedMultiplier ?? 1.35;
  return {
    ok: true,
    data: {
      ...plot,
      soil: 'watered',
      wateredAt: nowMs,
      growthBoost: Math.max(plot.growthBoost || 1, speed),
    },
  };
}

export function plantSeedOnPlot(
  plot: LandSquare,
  uid: string,
  inventory: InventoryItem[],
  cropId: CropId,
  nowMs: number,
): ActionResult<{ plot: LandSquare; inventory: InventoryItem[] }> {
  if (plot.ownerId !== uid) {
    return { ok: false, error: 'Можна сіяти лише на власній ділянці!' };
  }
  if (plot.soil === 'grass') {
    return { ok: false, error: 'Земля не оброблена! Скопайте її мотикою.' };
  }
  if (plot.cropId) {
    return { ok: false, error: 'Тут вже росте культура.' };
  }
  const def = CROP_CATALOG[cropId];
  const seedIdx = inventory.findIndex((i) => i.itemId === def.seedItemId && i.quantity > 0);
  if (seedIdx < 0) {
    return { ok: false, error: `У вас закінчилося "${def.seedName}".` };
  }
  const nextInventory = inventory
    .map((item, idx) => (idx === seedIdx ? { ...item, quantity: item.quantity - 1 } : item))
    .filter((item) => item.quantity > 0);
  return {
    ok: true,
    data: {
      plot: {
        ...plot,
        cropId,
        plantedAt: nowMs,
      },
      inventory: nextInventory,
    },
  };
}

export function harvestPlot(
  plot: LandSquare,
  uid: string,
  inventory: InventoryItem[],
  hoeItem: InventoryItem | undefined,
  nowMs: number,
  rngRoll = Math.random(),
): ActionResult<{ plot: LandSquare; inventory: InventoryItem[]; harvestedQty: number; cropName: string }> {
  if (plot.ownerId !== uid) {
    return { ok: false, error: 'Не можна збирати чужий врожай!' };
  }
  if (!plot.cropId) {
    return { ok: false, error: 'На цій ділянці нічого не посаджено.' };
  }
  const growth = computeCropGrowth(plot, nowMs);
  if (!growth.ready) {
    return { ok: false, error: `Культура ще росте (${Math.round(growth.progress * 100)}%).` };
  }

  const def = CROP_CATALOG[plot.cropId];
  const bonusPct = hoeItem?.stats.yieldBonusPct ?? 0;
  let qty = 1 + Math.floor(bonusPct / 100);
  const remPct = bonusPct % 100;
  if (remPct > 0 && rngRoll * 100 < remPct) {
    qty += 1;
  }

  const existingIdx = inventory.findIndex((i) => i.itemId === def.cropItemId);
  const nextInventory = inventory.map((item) => ({ ...item }));
  if (existingIdx >= 0) {
    nextInventory[existingIdx].quantity += qty;
  } else {
    nextInventory.push(createCropInventoryItem(plot.cropId, qty));
  }

  return {
    ok: true,
    data: {
      plot: {
        ...plot,
        soil: 'tilled',
        cropId: null,
        plantedAt: null,
        wateredAt: null,
        growthBoost: 1,
      },
      inventory: nextInventory,
      harvestedQty: qty,
      cropName: def.cropName,
    },
  };
}

export function resolvePlayerMovement(
  x: number,
  z: number,
  dx: number,
  dz: number,
  dt: number,
  speed = 6.2,
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

  // Town Hall solid footprint collision box in the NW plaza corner
  const hallMinX = -7.6 * TILE_SIZE;
  const hallMaxX = -5.4 * TILE_SIZE;
  const hallMinZ = -7.6 * TILE_SIZE;
  const hallMaxZ = -5.8 * TILE_SIZE;

  if (nextX > hallMinX && nextX < hallMaxX && nextZ > hallMinZ && nextZ < hallMaxZ) {
    // Push out along shallower penetration axis so movement slides cleanly
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
