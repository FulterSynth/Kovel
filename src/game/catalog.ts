import type { CropDefinition, CropId, InventoryItem, LandSquare, PlayerProfile, ToolDefinition } from './types';

export const GRID_SIZE = 16; // 16x16 shared world grid (256 city squares)
export const GRID_MIN = -8;
export const GRID_MAX = 7;
export const TILE_SIZE = 2.6; // World units per land square

export const STARTING_COINS = 20;

export const TOWN_PLAZA_BOUNDS = {
  minGx: -8,
  maxGx: -5,
  minGz: -8,
  maxGz: -5,
};

export const PLAYER_PALETTE = [
  '#e06d44',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#ef4444',
];

export const TOOL_CATALOG: Record<string, ToolDefinition> = {
  rusty_hoe: {
    itemId: 'rusty_hoe',
    toolFamily: 'hoe',
    tier: 1,
    name: 'Ржава погана мотика',
    rarity: 'common',
    buyPrice: 10,
    upgradeToId: 'iron_hoe',
    upgradeCost: 25,
    speedMultiplier: 1.0,
    yieldBonusPct: 0,
    durabilityLabel: 'Зношена (100%)',
    description: 'Стара іржавіла мотика за 10 монет. Достатньо гостра, щоб скопати першу грядку та зібрати врожай.',
  },
  iron_hoe: {
    itemId: 'iron_hoe',
    toolFamily: 'hoe',
    tier: 2,
    name: 'Кована залізна мотика',
    rarity: 'uncommon',
    buyPrice: null,
    upgradeToId: 'steel_hoe',
    upgradeCost: 55,
    speedMultiplier: 1.4,
    yieldBonusPct: 25,
    durabilityLabel: 'Міцна загартована',
    description: 'Кована мотика ковельських майстрів. Працює на 40% швидше та дає +25% шанс додаткового врожаю.',
  },
  steel_hoe: {
    itemId: 'steel_hoe',
    toolFamily: 'hoe',
    tier: 3,
    name: 'Булатна фермерська мотика',
    rarity: 'rare',
    buyPrice: null,
    upgradeToId: 'golden_hoe',
    upgradeCost: 110,
    speedMultiplier: 1.85,
    yieldBonusPct: 60,
    durabilityLabel: 'Високовуглецева',
    description: 'Збалансована булатна мотика. Миттєво розпушує ґрунт та дає +60% бонусного врожаю.',
  },
  golden_hoe: {
    itemId: 'golden_hoe',
    toolFamily: 'hoe',
    tier: 4,
    name: 'Золота воксельна мотика',
    rarity: 'epic',
    buyPrice: null,
    upgradeToId: null,
    upgradeCost: null,
    speedMultiplier: 2.5,
    yieldBonusPct: 100,
    durabilityLabel: 'Легендарна (вічна)',
    description: 'Майстерна золота мотика. Гарантує подвійний врожай (+100%) та блискавичну обробку землі.',
  },
  wooden_can: {
    itemId: 'wooden_can',
    toolFamily: 'watering_can',
    tier: 1,
    name: "Дерев'яна лійка",
    rarity: 'common',
    buyPrice: 8,
    upgradeToId: 'copper_can',
    upgradeCost: 22,
    speedMultiplier: 1.35,
    yieldBonusPct: 0,
    durabilityLabel: 'Дубові клепки',
    description: 'Проста лійка для поливу засіяних грядок. Полив прискорює дозрівання культур на 35%.',
  },
  copper_can: {
    itemId: 'copper_can',
    toolFamily: 'watering_can',
    tier: 2,
    name: 'Мідна садова лійка',
    rarity: 'uncommon',
    buyPrice: null,
    upgradeToId: 'crystal_can',
    upgradeCost: 50,
    speedMultiplier: 1.65,
    yieldBonusPct: 15,
    durabilityLabel: 'Полірована мідь',
    description: 'Містка мідна лійка. Прискорює ріст на 65% і додає +15% до якості плодів.',
  },
  crystal_can: {
    itemId: 'crystal_can',
    toolFamily: 'watering_can',
    tier: 3,
    name: 'Кристалічна джерельна лійка',
    rarity: 'epic',
    buyPrice: null,
    upgradeToId: null,
    upgradeCost: null,
    speedMultiplier: 2.2,
    yieldBonusPct: 35,
    durabilityLabel: 'Магічний кварц',
    description: 'Насичує ґрунт життєвою вологою: ріст у 2.2 раза швидший та +35% бонус до врожайності.',
  },
};

export const CROP_CATALOG: Record<CropId, CropDefinition> = {
  radish: {
    cropId: 'radish',
    seedItemId: 'seed_radish',
    cropItemId: 'crop_radish',
    seedName: 'Насіння редиски',
    cropName: 'Стигла редиска',
    seedPrice: 4,
    sellPrice: 9,
    growthSeconds: 8,
    rarity: 'common',
    description: 'Швидка стартова культура. Дозріває за 8 секунд і чудово підходить для перших монет.',
    voxelColor: '#d94862',
    accentColor: '#4da852',
  },
  wheat: {
    cropId: 'wheat',
    seedItemId: 'seed_wheat',
    cropItemId: 'crop_wheat',
    seedName: 'Насіння пшениці',
    cropName: 'Золота пшениця',
    seedPrice: 5,
    sellPrice: 12,
    growthSeconds: 12,
    rarity: 'common',
    description: 'Традиційна волинська пшениця. Стабільний прибуток за 12 секунд росту.',
    voxelColor: '#eab308',
    accentColor: '#ca8a04',
  },
  carrot: {
    cropId: 'carrot',
    seedItemId: 'seed_carrot',
    cropItemId: 'crop_carrot',
    seedName: 'Насіння моркви',
    cropName: 'Солодка морква',
    seedPrice: 8,
    sellPrice: 19,
    growthSeconds: 16,
    rarity: 'uncommon',
    description: 'Хрустка солодка морква. Потребує більше часу, але цінується на міському ринку.',
    voxelColor: '#f97316',
    accentColor: '#22c55e',
  },
  sunflower: {
    cropId: 'sunflower',
    seedItemId: 'seed_sunflower',
    cropItemId: 'crop_sunflower',
    seedName: 'Насіння соняшника',
    cropName: 'Яскравий соняшник',
    seedPrice: 14,
    sellPrice: 34,
    growthSeconds: 22,
    rarity: 'rare',
    description: 'Висока сонячна квітка, що прикрашає ферму та дає щедрий виторг.',
    voxelColor: '#facc15',
    accentColor: '#713f12',
  },
  pumpkin: {
    cropId: 'pumpkin',
    seedItemId: 'seed_pumpkin',
    cropItemId: 'crop_pumpkin',
    seedName: 'Насіння гарбуза',
    cropName: 'Великий гарбуз',
    seedPrice: 22,
    sellPrice: 58,
    growthSeconds: 28,
    rarity: 'epic',
    description: 'Великий воксельний гарбуз. Найвища ціна на ринку Ковеля!',
    voxelColor: '#ea580c',
    accentColor: '#15803d',
  },
};

export const CROP_LIST: CropDefinition[] = Object.values(CROP_CATALOG);

export function getLandSquarePrice(ownedCount: number): number {
  if (ownedCount <= 0) return 0; // First square is free!
  return 15 + ownedCount * 10; // 2nd = 25, 3rd = 35, 4th = 45...
}

export function createToolInventoryItem(itemId: string): InventoryItem {
  const def = TOOL_CATALOG[itemId];
  return {
    id: `inv_${itemId}`,
    itemId: def.itemId,
    kind: 'tool',
    name: def.name,
    quantity: 1,
    tier: def.tier,
    rarity: def.rarity,
    value: def.buyPrice ?? (def.tier * 25),
    toolFamily: def.toolFamily,
    description: def.description,
    stats: {
      speedMultiplier: def.speedMultiplier,
      yieldBonusPct: def.yieldBonusPct,
      durabilityLabel: def.durabilityLabel,
    },
  };
}

export function createSeedInventoryItem(cropId: CropId, quantity = 1): InventoryItem {
  const def = CROP_CATALOG[cropId];
  return {
    id: `inv_${def.seedItemId}`,
    itemId: def.seedItemId,
    kind: 'seed',
    name: def.seedName,
    quantity,
    tier: 1,
    rarity: def.rarity,
    value: def.seedPrice,
    cropId,
    description: def.description,
    stats: {
      growthSeconds: def.growthSeconds,
      sellPrice: def.sellPrice,
    },
  };
}

export function createCropInventoryItem(cropId: CropId, quantity = 1): InventoryItem {
  const def = CROP_CATALOG[cropId];
  return {
    id: `inv_${def.cropItemId}`,
    itemId: def.cropItemId,
    kind: 'crop',
    name: def.cropName,
    quantity,
    tier: 1,
    rarity: def.rarity,
    value: def.sellPrice,
    cropId,
    description: `Зібраний урожай: ${def.cropName}. Продавайте на міському ринку за монети!`,
    stats: {
      sellPrice: def.sellPrice,
    },
  };
}

export function gridKey(gx: number, gz: number): string {
  return `${gx}_${gz}`;
}

export function isTownPlazaTile(gx: number, gz: number): boolean {
  return (
    gx >= TOWN_PLAZA_BOUNDS.minGx &&
    gx <= TOWN_PLAZA_BOUNDS.maxGx &&
    gz >= TOWN_PLAZA_BOUNDS.minGz &&
    gz <= TOWN_PLAZA_BOUNDS.maxGz
  );
}

export function createSeededWorldPlots(nowMs: number): Record<string, LandSquare> {
  const plots: Record<string, LandSquare> = {};
  for (let gx = GRID_MIN; gx <= GRID_MAX; gx++) {
    for (let gz = GRID_MIN; gz <= GRID_MAX; gz++) {
      if (isTownPlazaTile(gx, gz)) continue;
      const key = gridKey(gx, gz);
      plots[key] = {
        key,
        gx,
        gz,
        ownerId: null,
        ownerName: null,
        ownerColor: null,
        soil: 'grass',
        cropId: null,
        plantedAt: null,
        wateredAt: null,
        growthBoost: 1,
      };
    }
  }

  // Deterministic neighboring farmer plots so the shared land feels alive and explorable
  const neighborSeeds: Array<{
    gx: number;
    gz: number;
    ownerId: string;
    ownerName: string;
    ownerColor: string;
    soil: 'tilled' | 'watered';
    cropId: CropId | null;
    ageMs: number;
  }> = [
    // Олег_Агро farm cluster
    { gx: 3, gz: -2, ownerId: 'npc_oleg', ownerName: 'Олег_Агро', ownerColor: '#3b82f6', soil: 'watered', cropId: 'wheat', ageMs: 14000 },
    { gx: 4, gz: -2, ownerId: 'npc_oleg', ownerName: 'Олег_Агро', ownerColor: '#3b82f6', soil: 'tilled', cropId: 'sunflower', ageMs: 24000 },
    { gx: 3, gz: -1, ownerId: 'npc_oleg', ownerName: 'Олег_Агро', ownerColor: '#3b82f6', soil: 'watered', cropId: 'carrot', ageMs: 9000 },
    { gx: 4, gz: -1, ownerId: 'npc_oleg', ownerName: 'Олег_Агро', ownerColor: '#3b82f6', soil: 'tilled', cropId: 'wheat', ageMs: 6000 },
    // Марія_Сад farm cluster
    { gx: -3, gz: 3, ownerId: 'npc_maria', ownerName: 'Марія_Сад', ownerColor: '#ec4899', soil: 'watered', cropId: 'pumpkin', ageMs: 30000 },
    { gx: -2, gz: 3, ownerId: 'npc_maria', ownerName: 'Марія_Сад', ownerColor: '#ec4899', soil: 'watered', cropId: 'sunflower', ageMs: 18000 },
    { gx: -3, gz: 4, ownerId: 'npc_maria', ownerName: 'Марія_Сад', ownerColor: '#ec4899', soil: 'tilled', cropId: 'radish', ageMs: 9000 },
    // Тарас_Волинь farm cluster
    { gx: -6, gz: 0, ownerId: 'npc_taras', ownerName: 'Тарас_Волинь', ownerColor: '#f59e0b', soil: 'tilled', cropId: 'carrot', ageMs: 17000 },
    { gx: -5, gz: 0, ownerId: 'npc_taras', ownerName: 'Тарас_Волинь', ownerColor: '#f59e0b', soil: 'watered', cropId: 'radish', ageMs: 4000 },
  ];

  for (const s of neighborSeeds) {
    const key = gridKey(s.gx, s.gz);
    if (plots[key]) {
      plots[key] = {
        ...plots[key],
        ownerId: s.ownerId,
        ownerName: s.ownerName,
        ownerColor: s.ownerColor,
        soil: s.soil,
        cropId: s.cropId,
        plantedAt: s.cropId ? nowMs - s.ageMs : null,
        wateredAt: s.soil === 'watered' ? nowMs - 2000 : null,
        growthBoost: s.soil === 'watered' ? 1.35 : 1,
      };
    }
  }

  return plots;
}

export function createSeededNpcPlayers(nowMs: number): Record<string, PlayerProfile> {
  return {
    npc_oleg: {
      uid: 'npc_oleg',
      nickname: 'Олег_Агро',
      coins: 94,
      x: 3.5 * TILE_SIZE,
      z: -1.5 * TILE_SIZE,
      yaw: 0.6,
      color: '#3b82f6',
      isMoving: false,
      activeSlotItemId: 'iron_hoe',
      ownedCount: 4,
      totalHarvested: 28,
      bestToolTier: 2,
      lastSeen: nowMs,
      isOnline: true,
      isNpc: true,
    },
    npc_maria: {
      uid: 'npc_maria',
      nickname: 'Марія_Сад',
      coins: 148,
      x: -2.5 * TILE_SIZE,
      z: 3.5 * TILE_SIZE,
      yaw: -0.9,
      color: '#ec4899',
      isMoving: false,
      activeSlotItemId: 'steel_hoe',
      ownedCount: 3,
      totalHarvested: 42,
      bestToolTier: 3,
      lastSeen: nowMs,
      isOnline: true,
      isNpc: true,
    },
    npc_taras: {
      uid: 'npc_taras',
      nickname: 'Тарас_Волинь',
      coins: 52,
      x: -5.5 * TILE_SIZE,
      z: 0.5 * TILE_SIZE,
      yaw: 1.8,
      color: '#f59e0b',
      isMoving: false,
      activeSlotItemId: 'rusty_hoe',
      ownedCount: 2,
      totalHarvested: 11,
      bestToolTier: 1,
      lastSeen: nowMs,
      isOnline: true,
      isNpc: true,
    },
  };
}
