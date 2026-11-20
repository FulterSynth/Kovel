import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STARTING_COINS,
  createSeededWorldPlots,
  getLandSquarePrice,
  gridKey,
} from './catalog';
import {
  buyShopItem,
  computeCropGrowth,
  findFreeStarterPlot,
  harvestPlot,
  plantSeedOnPlot,
  purchaseLandSquare,
  resolvePlayerMovement,
  sellCropFromInventory,
  sortInventory,
  tillPlot,
  upgradeToolInInventory,
  waterPlot,
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
    totalHarvested: 0,
    bestToolTier: 0,
    lastSeen: 1000,
    isOnline: true,
  };
}

test('first land square is free, subsequent city squares cost coins and require adjacency', () => {
  const now = 10_000;
  const plots = createSeededWorldPlots(now);
  let player = makePlayer('p1', STARTING_COINS);

  const starter = findFreeStarterPlot(plots);
  assert.ok(starter, 'Starter plot should exist');
  assert.equal(getLandSquarePrice(0), 0);

  const claimRes = purchaseLandSquare(player, starter.key, plots);
  assert.equal(claimRes.ok, true);
  player = claimRes.data!.player;
  plots[starter.key] = claimRes.data!.plot;

  assert.equal(player.coins, STARTING_COINS); // 1st plot is free!
  assert.equal(player.ownedCount, 1);

  // Far non-adjacent plot should fail
  const farKey = gridKey(7, 7);
  const farRes = purchaseLandSquare(player, farKey, plots);
  assert.equal(farRes.ok, false);

  // Adjacent plot costs 25 coins (15 + 1*10), so with 20 coins player needs more coins first
  const adjKey = gridKey(starter.gx + 1, starter.gz);
  const poorRes = purchaseLandSquare(player, adjKey, plots);
  assert.equal(poorRes.ok, false);

  // With 30 coins, player can buy adjacent plot for 25 coins
  player = { ...player, coins: 30 };
  const buyAdj = purchaseLandSquare(player, adjKey, plots);
  assert.equal(buyAdj.ok, true);
  assert.equal(buyAdj.data!.player.coins, 5);
  assert.equal(buyAdj.data!.player.ownedCount, 2);
});

test('starter 20 coins buys rusty hoe (10) + radish seeds (4x2), supports full farm-to-sell loop', () => {
  const now = 100_000;
  const plots = createSeededWorldPlots(now);
  let player = makePlayer('p1', STARTING_COINS);
  let inv: InventoryItem[] = [];

  // Claim 1 free plot
  const starter = findFreeStarterPlot(plots)!;
  const claim = purchaseLandSquare(player, starter.key, plots);
  player = claim.data!.player;
  plots[starter.key] = claim.data!.plot;

  // Buy rusty hoe for 10 coins
  const buyHoe = buyShopItem(player.coins, inv, 'rusty_hoe', 1);
  assert.equal(buyHoe.ok, true);
  player = { ...player, coins: buyHoe.data!.coins };
  inv = buyHoe.data!.inventory;
  assert.equal(player.coins, 10);

  // Buy 2 radish seeds (4 coins each = 8)
  const buySeeds = buyShopItem(player.coins, inv, 'seed_radish', 2);
  assert.equal(buySeeds.ok, true);
  player = { ...player, coins: buySeeds.data!.coins };
  inv = buySeeds.data!.inventory;
  assert.equal(player.coins, 2);

  // Till the plot
  const hoe = inv.find((i) => i.itemId === 'rusty_hoe');
  const tilled = tillPlot(plots[starter.key], player.uid, hoe);
  assert.equal(tilled.ok, true);
  plots[starter.key] = tilled.data!;

  // Plant radish
  const planted = plantSeedOnPlot(plots[starter.key], player.uid, inv, 'radish', now);
  assert.equal(planted.ok, true);
  plots[starter.key] = planted.data!.plot;
  inv = planted.data!.inventory;

  // Not ready at +2s
  assert.equal(computeCropGrowth(plots[starter.key], now + 2000).ready, false);

  // Ready at +8.5s
  assert.equal(computeCropGrowth(plots[starter.key], now + 8500).ready, true);

  // Harvest
  const harvested = harvestPlot(plots[starter.key], player.uid, inv, hoe, now + 8500, 0.5);
  assert.equal(harvested.ok, true);
  assert.equal(harvested.data!.harvestedQty, 1);
  inv = harvested.data!.inventory;

  // Sell radish for 9 coins
  const sold = sellCropFromInventory(player.coins, inv, 'crop_radish', 1);
  assert.equal(sold.ok, true);
  assert.equal(sold.data!.coins, 11);
});

test('tool upgrades boost speed & yield, and watering accelerates crop growth', () => {
  const now = 50_000;
  const plots = createSeededWorldPlots(now);
  const starter = findFreeStarterPlot(plots)!;
  plots[starter.key] = { ...starter, ownerId: 'p1', ownerName: 'Test', soil: 'tilled' };

  let coins = 50;
  let inv: InventoryItem[] = [];
  inv = buyShopItem(coins, inv, 'rusty_hoe', 1).data!.inventory;
  coins -= 10;

  // Upgrade rusty_hoe -> iron_hoe (25 coins)
  const upg = upgradeToolInInventory(coins, inv, 'rusty_hoe');
  assert.equal(upg.ok, true);
  assert.equal(upg.data!.newTool.itemId, 'iron_hoe');
  assert.equal(upg.data!.newTool.stats.yieldBonusPct, 25);
  assert.equal(upg.data!.coins, 15);

  // Watering can speeds growth
  const canBuy = buyShopItem(30, upg.data!.inventory, 'wooden_can', 1);
  assert.equal(canBuy.ok, true);
  const can = canBuy.data!.inventory.find((i) => i.itemId === 'wooden_can');
  const watered = waterPlot(plots[starter.key], 'p1', can, now);
  assert.equal(watered.ok, true);
  assert.equal(watered.data!.soil, 'watered');
  assert.ok(watered.data!.growthBoost > 1);
});

test('inventory sorting orders items deterministically by price, quantity, rarity, and type', () => {
  let inv: InventoryItem[] = [];
  inv = buyShopItem(200, inv, 'rusty_hoe', 1).data!.inventory;
  inv = buyShopItem(200, inv, 'seed_pumpkin', 2).data!.inventory;
  inv = buyShopItem(200, inv, 'seed_radish', 5).data!.inventory;

  const byPriceDesc = sortInventory(inv, 'price', 'desc');
  assert.equal(byPriceDesc[0].itemId, 'seed_pumpkin'); // value 22
  assert.equal(byPriceDesc[1].itemId, 'rusty_hoe'); // value 10
  assert.equal(byPriceDesc[2].itemId, 'seed_radish'); // value 4

  const byQtyDesc = sortInventory(inv, 'quantity', 'desc');
  assert.equal(byQtyDesc[0].itemId, 'seed_radish'); // qty 5

  const byTypeAsc = sortInventory(inv, 'type', 'asc');
  assert.equal(byTypeAsc[0].kind, 'tool');
});

test('player movement stays within shared world bounds and slides around Town Hall', () => {
  const res = resolvePlayerMovement(0, 0, 1, 0, 0.1, 6);
  assert.equal(res.moved, true);
  assert.ok(res.x > 0.5);

  // Pushing far outside world clamps cleanly
  const clamped = resolvePlayerMovement(100, 100, 1, 1, 1, 6);
  assert.ok(clamped.x < 25);
  assert.ok(clamped.z < 25);
});
