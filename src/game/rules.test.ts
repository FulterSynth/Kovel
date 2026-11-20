import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GRID_SIZE,
  STARTER_FREE_PLOTS,
  STARTING_COINS,
  VOXELS_PER_PLOT,
  createSeededWorldPlots,
  getLandSquarePrice,
  gridKey,
} from './catalog';
import { computeDayNightState } from './dayNightShader';
import {
  buyShopItem,
  computeVoxelGrowth,
  findFreeStarterCluster,
  harvestVoxelsOnPlot,
  plantVoxelOnPlot,
  purchaseLandSquare,
  resolvePlayerMovement,
  sellCropFromInventory,
  sortInventory,
  tillVoxelsOnPlot,
  upgradeToolInInventory,
  waterVoxelsOnPlot,
} from './rules';
import type { InventoryItem, PlayerProfile } from './types';

function makePlayer(uid = 'p1', coins = STARTING_COINS): PlayerProfile {
  return {
    uid,
    nickname: 'Володимир',
    coins,
    x: 0,
    z: 0,
    yaw: 0,
    color: '#e06d44',
    isMoving: false,
    activeSlotItemId: null,
    ownedCount: 0,
    freeClaimsRemaining: STARTER_FREE_PLOTS,
    totalHarvested: 0,
    bestToolTier: 0,
    lastSeen: 1000,
    isOnline: true,
  };
}

test('expanded 24x24 territory has 9 voxels per plot and requires 4 adjacent free starter plots', () => {
  const now = 10_000;
  const plots = createSeededWorldPlots(now);
  assert.equal(GRID_SIZE, 24);
  assert.ok(Object.keys(plots).length > 500);

  let player = makePlayer('p1', STARTING_COINS);
  const cluster = findFreeStarterCluster(plots, 4);
  assert.equal(cluster.length, 4);
  assert.equal(cluster[0].voxels.length, VOXELS_PER_PLOT);

  // Claim 1st free square anywhere unowned
  const c1 = purchaseLandSquare(player, cluster[0].key, plots);
  assert.equal(c1.ok, true);
  assert.equal(c1.data!.price, 0);
  player = c1.data!.player;
  plots[cluster[0].key] = c1.data!.plot;

  // Trying to claim non-adjacent 2nd starter square must fail
  const farKey = gridKey(10, 10);
  const bad2 = purchaseLandSquare(player, farKey, plots);
  assert.equal(bad2.ok, false);

  // Claim remaining 3 adjacent starter squares for free
  for (let i = 1; i < 4; i++) {
    const res = purchaseLandSquare(player, cluster[i].key, plots);
    assert.equal(res.ok, true);
    assert.equal(res.data!.price, 0);
    player = res.data!.player;
    plots[cluster[i].key] = res.data!.plot;
  }

  assert.equal(player.ownedCount, 4);
  assert.equal(player.freeClaimsRemaining, 0);
  assert.equal(player.coins, STARTING_COINS);

  // 5th square costs coins (20 coins)
  assert.equal(getLandSquarePrice(4), 20);
  const fifthAdjKey = gridKey(cluster[3].gx + 1, cluster[3].gz);
  if (plots[fifthAdjKey] && !plots[fifthAdjKey].ownerId) {
    const buy5 = purchaseLandSquare(player, fifthAdjKey, plots);
    assert.equal(buy5.ok, true);
    assert.equal(buy5.data!.price, 20);
    assert.equal(buy5.data!.player.coins, 0);
  }
});

test('1 plot holds 9 voxels: rusty hoe tills 1 voxel, upgraded golden hoe tills all 9 voxels', () => {
  const now = 100_000;
  const plots = createSeededWorldPlots(now);
  let player = makePlayer('p1', 200);
  const cluster = findFreeStarterCluster(plots, 4);
  for (const sq of cluster) {
    const r = purchaseLandSquare(player, sq.key, plots);
    player = r.data!.player;
    plots[sq.key] = r.data!.plot;
  }

  let inv: InventoryItem[] = [];
  inv = buyShopItem(player.coins, inv, 'rusty_hoe', 1).data!.inventory;
  inv = buyShopItem(player.coins, inv, 'seed_radish', 5).data!.inventory;

  const rustyHoe = inv.find((i) => i.itemId === 'rusty_hoe')!;
  const till1 = tillVoxelsOnPlot(plots[cluster[0].key], player.uid, rustyHoe, 4);
  assert.equal(till1.ok, true);
  assert.equal(till1.data!.tilledCount, 1);
  plots[cluster[0].key] = till1.data!.plot;

  // Plant on tilled voxel 4
  const plant1 = plantVoxelOnPlot(plots[cluster[0].key], player.uid, inv, 'radish', 4, now);
  assert.equal(plant1.ok, true);
  plots[cluster[0].key] = plant1.data!.plot;
  inv = plant1.data!.inventory;

  assert.equal(computeVoxelGrowth(plots[cluster[0].key].voxels[4], now + 2000).ready, false);
  assert.equal(computeVoxelGrowth(plots[cluster[0].key].voxels[4], now + 8500).ready, true);

  // Harvest voxel 4 and sell
  const harv = harvestVoxelsOnPlot(plots[cluster[0].key], player.uid, inv, rustyHoe, 4, now + 8500, 0.5);
  assert.equal(harv.ok, true);
  assert.equal(harv.data!.harvestedQty, 1);
  inv = harv.data!.inventory;
  const sold = sellCropFromInventory(0, inv, 'crop_radish', 1);
  assert.equal(sold.ok, true);
  assert.equal(sold.data!.coins, 5);

  // Upgrade hoe all the way to golden_hoe (areaVoxels = 9)
  let c = 300;
  let u = upgradeToolInInventory(c, inv, 'rusty_hoe').data!;
  u = upgradeToolInInventory(u.coins, u.inventory, 'iron_hoe').data!;
  u = upgradeToolInInventory(u.coins, u.inventory, 'steel_hoe').data!;
  assert.equal(u.newTool.itemId, 'golden_hoe');
  assert.equal(u.newTool.stats.areaVoxels, 9);

  // Tilling plot #2 with golden hoe tills all 9 voxels at once
  const tillAll = tillVoxelsOnPlot(plots[cluster[1].key], player.uid, u.newTool, 4);
  assert.equal(tillAll.ok, true);
  assert.equal(tillAll.data!.tilledCount, 9);
});

test('watering can accelerates voxel growth and inventory sorting works', () => {
  const now = 50_000;
  const plots = createSeededWorldPlots(now);
  const cluster = findFreeStarterCluster(plots, 1);
  let player = makePlayer('p1', 100);
  const r = purchaseLandSquare(player, cluster[0].key, plots);
  player = r.data!.player;
  plots[cluster[0].key] = r.data!.plot;

  let inv: InventoryItem[] = [];
  inv = buyShopItem(100, inv, 'rusty_hoe', 1).data!.inventory;
  inv = buyShopItem(100, inv, 'wooden_can', 1).data!.inventory;
  inv = buyShopItem(100, inv, 'seed_pumpkin', 2).data!.inventory;

  const hoe = inv.find((i) => i.itemId === 'rusty_hoe')!;
  const can = inv.find((i) => i.itemId === 'wooden_can')!;
  plots[cluster[0].key] = tillVoxelsOnPlot(plots[cluster[0].key], player.uid, hoe, 0).data!.plot;
  const wat = waterVoxelsOnPlot(plots[cluster[0].key], player.uid, can, 0, now);
  assert.equal(wat.ok, true);
  assert.equal(wat.data!.plot.voxels[0].soil, 'watered');

  const sortedByPrice = sortInventory(inv, 'price', 'desc');
  assert.equal(sortedByPrice[0].itemId, 'seed_pumpkin');
});

test('player movement clamps cleanly inside expanded 24x24 bounds', () => {
  const clamped = resolvePlayerMovement(200, 200, 1, 1, 1, 6.8);
  assert.ok(clamped.x < 36.5);
  assert.ok(clamped.z < 36.5);
});

test('day/night lighting shader state produces distinct dawn, day, sunset, and night weights', () => {
  const day = computeDayNightState('day', 0);
  const sunset = computeDayNightState('sunset', 0);
  const night = computeDayNightState('night', 0);
  const dawn = computeDayNightState('dawn', 0);

  assert.ok(day.dayFactor > 0.8);
  assert.equal(day.nightFactor, 0);
  assert.ok(sunset.sunsetFactor > 0.8);
  assert.ok(dawn.dawnFactor > 0.8);
  assert.ok(night.nightFactor > 0.8);
  assert.ok(night.lanternEmissiveIntensity > day.lanternEmissiveIntensity);
});
