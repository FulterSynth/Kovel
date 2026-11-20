import type {
  CropDefinition,
  CropId,
  InventoryItem,
  LandSquare,
  PlayerProfile,
  SoilState,
  ToolDefinition,
  VoxelCell,
} from './types';

export const GRID_SIZE = 24; // 24x24 shared world grid (576 city squares, 5184 voxels)
export const GRID_MIN = -12;
export const GRID_MAX = 11;
export const VOXELS_PER_SIDE = 3; // 3x3 = 9 voxels per land square
export const VOXELS_PER_PLOT = 9;
export const VOXEL_SIZE = 1.0;
export const TILE_SIZE = VOXELS_PER_SIDE * VOXEL_SIZE; // 3.0 world units per land square

export const STARTER_FREE_PLOTS = 4;
export const STARTING_COINS = 20;

export const TOWN_PLAZA_BOUNDS = {
  minGx: -12,
  maxGx: -9,
  minGz: -12,
  maxGz: -9,
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
    areaVoxels: 1,
    durabilityLabel: 'Зношена (100%)',
    description: 'Стара іржавіла мотика за 10 монет. Обробляє 1 воксель за удар, ідеальна для старту.',
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
    areaVoxels: 3,
    durabilityLabel: 'Міцна загартована',
    description: 'Кована мотика ковельських майстрів. Обробляє 3 вокселі за раз та дає +25% бонусу врожаю.',
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
    areaVoxels: 6,
    durabilityLabel: 'Високовуглецева',
    description: 'Збалансована булатна мотика. Захоплює 6 вокселів за раз і дає +60% бонусного врожаю.',
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
    areaVoxels: 9,
    durabilityLabel: 'Легендарна (вічна)',
    description: 'Майстерна золота мотика. Миттєво обробляє всю ділянку (усі 9 вокселів) та подвоює врожай!',
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
    areaVoxels: 1,
    durabilityLabel: 'Дубові клепки',
    description: 'Проста лійка для поливу воксельних грядок. Полив прискорює дозрівання культур на 35%.',
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
    areaVoxels: 3,
    durabilityLabel: 'Полірована мідь',
    description: 'Містка мідна лійка. Поливає 3 вокселі одразу та прискорює ріст на 65%.',
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
    areaVoxels: 9,
    durabilityLabel: 'Магічний кварц',
    description: 'Живить усю ділянку з 9 вокселів за раз: ріст у 2.2 раза швидший та +35% бонус до врожаю.',
  },
};

export const CROP_CATALOG: Record<CropId, CropDefinition> = {
  radish: {
    cropId: 'radish',
    seedItemId: 'seed_radish',
    cropItemId: 'crop_radish',
    seedName: 'Насіння редиски',
    cropName: 'Стигла редиска',
    seedPrice: 2,
    sellPrice: 5,
    growthSeconds: 8,
    rarity: 'common',
    description: 'Швидка стартова культура. За 2 монети дає 5 монет виторгу вже за 8 секунд.',
    voxelColor: '#d94862',
    accentColor: '#4da852',
  },
  wheat: {
    cropId: 'wheat',
    seedItemId: 'seed_wheat',
    cropItemId: 'crop_wheat',
    seedName: 'Насіння пшениці',
    cropName: 'Золота пшениця',
    seedPrice: 3,
    sellPrice: 8,
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
    seedPrice: 5,
    sellPrice: 13,
    growthSeconds: 16,
    rarity: 'uncommon',
    description: 'Хрустка солодка морква. Потребує більше часу, але гарно цінується на міському ринку.',
    voxelColor: '#f97316',
    accentColor: '#22c55e',
  },
  sunflower: {
    cropId: 'sunflower',
    seedItemId: 'seed_sunflower',
    cropItemId: 'crop_sunflower',
    seedName: 'Насіння соняшника',
    cropName: 'Яскравий соняшник',
    seedPrice: 9,
    sellPrice: 24,
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
    seedPrice: 15,
    sellPrice: 42,
    growthSeconds: 28,
    rarity: 'epic',
    description: 'Великий воксельний гарбуз. Найвища ціна на ринку Ковеля!',
    voxelColor: '#ea580c',
    accentColor: '#15803d',
  },
};

export const CROP_LIST: CropDefinition[] = Object.values(CROP_CATALOG);

export function getLandSquarePrice(ownedCount: number): number {
  if (ownedCount < STARTER_FREE_PLOTS) return 0; // First 4 adjacent squares are FREE!
  return 20 + (ownedCount - STARTER_FREE_PLOTS) * 12; // 5th = 20, 6th = 32, 7th = 44...
}

export function createEmptyVoxels(): VoxelCell[] {
  return Array.from({ length: VOXELS_PER_PLOT }, () => ({
    soil: 'grass' as SoilState,
    cropId: null,
    plantedAt: null,
    wateredAt: null,
    growthBoost: 1,
  }));
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
    value: def.buyPrice ?? def.tier * 25,
    toolFamily: def.toolFamily,
    description: def.description,
    stats: {
      speedMultiplier: def.speedMultiplier,
      yieldBonusPct: def.yieldBonusPct,
      areaVoxels: def.areaVoxels,
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

function makeFilledVoxels(
  soil: SoilState,
  cropId: CropId | null,
  plantedAt: number | null,
  growthBoost: number,
  sparseCount = 9,
): VoxelCell[] {
  return Array.from({ length: VOXELS_PER_PLOT }, (_, idx) => {
    const hasCrop = cropId !== null && idx < sparseCount;
    return {
      soil,
      cropId: hasCrop ? cropId : null,
      plantedAt: hasCrop ? plantedAt : null,
      wateredAt: soil === 'watered' ? plantedAt : null,
      growthBoost,
    };
  });
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
        voxels: createEmptyVoxels(),
      };
    }
  }

  // Deterministic neighboring farmer clusters across the expanded 24x24 world
  const neighborSeeds: Array<{
    gx: number;
    gz: number;
    ownerId: string;
    ownerName: string;
    ownerColor: string;
    soil: SoilState;
    cropId: CropId | null;
    ageMs: number;
    voxelCount: number;
  }> = [
    // Олег_Агро (4 adjacent squares on East meadow)
    { gx: 4, gz: -3, ownerId: 'npc_oleg', ownerName: 'Олег_Агро', ownerColor: '#3b82f6', soil: 'watered', cropId: 'wheat', ageMs: 15000, voxelCount: 9 },
    { gx: 5, gz: -3, ownerId: 'npc_oleg', ownerName: 'Олег_Агро', ownerColor: '#3b82f6', soil: 'tilled', cropId: 'sunflower', ageMs: 25000, voxelCount: 7 },
    { gx: 4, gz: -2, ownerId: 'npc_oleg', ownerName: 'Олег_Агро', ownerColor: '#3b82f6', soil: 'watered', cropId: 'carrot', ageMs: 11000, voxelCount: 9 },
    { gx: 5, gz: -2, ownerId: 'npc_oleg', ownerName: 'Олег_Агро', ownerColor: '#3b82f6', soil: 'tilled', cropId: 'wheat', ageMs: 6000, voxelCount: 6 },
    // Марія_Сад (4 adjacent squares on South meadow)
    { gx: -4, gz: 4, ownerId: 'npc_maria', ownerName: 'Марія_Сад', ownerColor: '#ec4899', soil: 'watered', cropId: 'pumpkin', ageMs: 32000, voxelCount: 6 },
    { gx: -3, gz: 4, ownerId: 'npc_maria', ownerName: 'Марія_Сад', ownerColor: '#ec4899', soil: 'watered', cropId: 'sunflower', ageMs: 20000, voxelCount: 9 },
    { gx: -4, gz: 5, ownerId: 'npc_maria', ownerName: 'Марія_Сад', ownerColor: '#ec4899', soil: 'tilled', cropId: 'radish', ageMs: 10000, voxelCount: 9 },
    { gx: -3, gz: 5, ownerId: 'npc_maria', ownerName: 'Марія_Сад', ownerColor: '#ec4899', soil: 'tilled', cropId: 'carrot', ageMs: 14000, voxelCount: 8 },
    // Тарас_Волинь (4 adjacent squares near Town Plaza)
    { gx: -7, gz: -2, ownerId: 'npc_taras', ownerName: 'Тарас_Волинь', ownerColor: '#f59e0b', soil: 'tilled', cropId: 'carrot', ageMs: 18000, voxelCount: 9 },
    { gx: -6, gz: -2, ownerId: 'npc_taras', ownerName: 'Тарас_Волинь', ownerColor: '#f59e0b', soil: 'watered', cropId: 'radish', ageMs: 9500, voxelCount: 9 },
    { gx: -7, gz: -1, ownerId: 'npc_taras', ownerName: 'Тарас_Волинь', ownerColor: '#f59e0b', soil: 'tilled', cropId: 'wheat', ageMs: 7000, voxelCount: 5 },
    { gx: -6, gz: -1, ownerId: 'npc_taras', ownerName: 'Тарас_Волинь', ownerColor: '#f59e0b', soil: 'grass', cropId: null, ageMs: 0, voxelCount: 0 },
  ];

  for (const s of neighborSeeds) {
    const key = gridKey(s.gx, s.gz);
    if (plots[key]) {
      plots[key] = {
        ...plots[key],
        ownerId: s.ownerId,
        ownerName: s.ownerName,
        ownerColor: s.ownerColor,
        voxels: makeFilledVoxels(
          s.soil,
          s.cropId,
          s.cropId ? nowMs - s.ageMs : null,
          s.soil === 'watered' ? 1.35 : 1,
          s.voxelCount,
        ),
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
      coins: 112,
      x: 4.5 * TILE_SIZE,
      z: -2.2 * TILE_SIZE,
      yaw: 0.6,
      color: '#3b82f6',
      isMoving: false,
      activeSlotItemId: 'iron_hoe',
      ownedCount: 4,
      freeClaimsRemaining: 0,
      totalHarvested: 54,
      bestToolTier: 2,
      lastSeen: nowMs,
      isOnline: true,
      isNpc: true,
    },
    npc_maria: {
      uid: 'npc_maria',
      nickname: 'Марія_Сад',
      coins: 168,
      x: -3.5 * TILE_SIZE,
      z: 4.5 * TILE_SIZE,
      yaw: -0.9,
      color: '#ec4899',
      isMoving: false,
      activeSlotItemId: 'steel_hoe',
      ownedCount: 4,
      freeClaimsRemaining: 0,
      totalHarvested: 78,
      bestToolTier: 3,
      lastSeen: nowMs,
      isOnline: true,
      isNpc: true,
    },
    npc_taras: {
      uid: 'npc_taras',
      nickname: 'Тарас_Волинь',
      coins: 64,
      x: -6.5 * TILE_SIZE,
      z: -1.5 * TILE_SIZE,
      yaw: 1.8,
      color: '#f59e0b',
      isMoving: false,
      activeSlotItemId: 'rusty_hoe',
      ownedCount: 4,
      freeClaimsRemaining: 0,
      totalHarvested: 24,
      bestToolTier: 1,
      lastSeen: nowMs,
      isOnline: true,
      isNpc: true,
    },
  };
}
