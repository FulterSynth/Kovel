export type GamePhase = 'title' | 'playing' | 'paused';

export type CropId = 'radish' | 'wheat' | 'carrot' | 'sunflower' | 'pumpkin';

export type ToolFamily = 'hoe' | 'watering_can';

export type ItemKind = 'tool' | 'seed' | 'crop';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic';

export type InventorySortKey = 'type' | 'price' | 'name' | 'quantity' | 'rarity';

export interface ItemStats {
  speedMultiplier?: number;
  yieldBonusPct?: number;
  waterRadius?: number;
  growthSeconds?: number;
  sellPrice?: number;
  durabilityLabel?: string;
}

export interface InventoryItem {
  id: string;
  itemId: string;
  kind: ItemKind;
  name: string;
  quantity: number;
  tier: number;
  rarity: ItemRarity;
  value: number;
  stats: ItemStats;
  description: string;
  toolFamily?: ToolFamily;
  cropId?: CropId;
}

export type SoilState = 'grass' | 'tilled' | 'watered';

export interface LandSquare {
  key: string;
  gx: number;
  gz: number;
  ownerId: string | null;
  ownerName: string | null;
  ownerColor: string | null;
  soil: SoilState;
  cropId: CropId | null;
  plantedAt: number | null;
  wateredAt: number | null;
  growthBoost: number;
}

export interface PlayerProfile {
  uid: string;
  nickname: string;
  coins: number;
  x: number;
  z: number;
  yaw: number;
  color: string;
  isMoving: boolean;
  activeSlotItemId: string | null;
  ownedCount: number;
  totalHarvested: number;
  bestToolTier: number;
  lastSeen: number;
  isOnline: boolean;
  isNpc?: boolean;
}

export interface ChatMessage {
  id: string;
  uid: string;
  nickname: string;
  text: string;
  timestamp: number;
  color: string;
}

export interface ToolDefinition {
  itemId: string;
  toolFamily: ToolFamily;
  tier: number;
  name: string;
  rarity: ItemRarity;
  buyPrice: number | null;
  upgradeToId: string | null;
  upgradeCost: number | null;
  speedMultiplier: number;
  yieldBonusPct: number;
  description: string;
  durabilityLabel: string;
}

export interface CropDefinition {
  cropId: CropId;
  seedItemId: string;
  cropItemId: string;
  seedName: string;
  cropName: string;
  seedPrice: number;
  sellPrice: number;
  growthSeconds: number;
  rarity: ItemRarity;
  description: string;
  voxelColor: string;
  accentColor: string;
}
