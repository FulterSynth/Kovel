import React, { useMemo, useState } from 'react';
import { ArrowUpDown, X, Sparkles, Check } from 'lucide-react';
import { CROP_CATALOG, TOOL_CATALOG } from '../game/catalog';
import { sortInventory } from '../game/rules';
import type { InventoryItem, InventorySortKey, ItemRarity } from '../game/types';
import { CoinSvg, HoeSvg, SeedSvg, WaterCanSvg } from './VoxelIcons';

interface InventoryModalProps {
  coins: number;
  inventory: InventoryItem[];
  activeSlotItemId: string | null;
  onSelectActive: (itemId: string) => void;
  onUpgradeTool: (itemId: string) => void;
  onSellCrop: (itemId: string, qty: number) => void;
  onClose: () => void;
}

const RARITY_LABELS: Record<ItemRarity, { label: string; badge: string }> = {
  common: { label: 'Звичайний', badge: 'bg-stone-700 text-stone-200 border-stone-500' },
  uncommon: { label: 'Добротний', badge: 'bg-emerald-900 text-emerald-200 border-emerald-500' },
  rare: { label: 'Рідкісний', badge: 'bg-sky-900 text-sky-200 border-sky-400' },
  epic: { label: 'Легендарний', badge: 'bg-amber-900 text-amber-200 border-amber-400' },
};

const SORT_LABELS: Record<InventorySortKey, string> = {
  type: 'За типом',
  price: 'За ціною',
  name: 'За назвою',
  quantity: 'За кількістю',
  rarity: 'За рідкістю',
};

function renderItemIcon(item: InventoryItem, sizeClass = 'w-7 h-7') {
  if (item.kind === 'tool') {
    if (item.toolFamily === 'watering_can') {
      const col = item.tier >= 3 ? '#38bdf8' : item.tier === 2 ? '#ea580c' : '#a16207';
      return <WaterCanSvg color={col} className={sizeClass} />;
    }
    const col =
      item.tier >= 4
        ? '#facc15'
        : item.tier === 3
          ? '#e2e8f0'
          : item.tier === 2
            ? '#94a3b8'
            : '#9a5b32';
    return <HoeSvg color={col} className={sizeClass} />;
  }
  const cropDef = item.cropId ? CROP_CATALOG[item.cropId] : null;
  if (item.kind === 'seed') {
    return <SeedSvg color={cropDef?.voxelColor || '#eab308'} className={sizeClass} />;
  }
  return (
    <span
      className={`inline-block rounded-md border-2 border-stone-900 ${sizeClass}`}
      style={{ backgroundColor: cropDef?.voxelColor || '#f59e0b' }}
      aria-hidden="true"
    />
  );
}

export function InventoryModal({
  coins,
  inventory,
  activeSlotItemId,
  onSelectActive,
  onUpgradeTool,
  onSellCrop,
  onClose,
}: InventoryModalProps) {
  const [sortBy, setSortBy] = useState<InventorySortKey>('type');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    inventory[0]?.itemId ?? null,
  );

  const sortedItems = useMemo(
    () => sortInventory(inventory, sortBy, sortDir),
    [inventory, sortBy, sortDir],
  );

  const selectedItem =
    sortedItems.find((i) => i.itemId === selectedItemId) ?? sortedItems[0] ?? null;

  const toolDef = selectedItem?.kind === 'tool' ? TOOL_CATALOG[selectedItem.itemId] : null;
  const nextUpgradeDef = toolDef?.upgradeToId ? TOOL_CATALOG[toolDef.upgradeToId] : null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(12, 16, 14, 0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Інвентар фермера"
    >
      <div
        className="w-full max-w-3xl rounded-2xl border-2 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        style={{
          backgroundColor: '#1c1917',
          borderColor: '#d97706',
          color: '#fef3c7',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-700 bg-stone-900">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-extrabold tracking-wide text-amber-200">
              Інвентар та Характеристики
            </h2>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-800 border border-amber-600/50 text-sm font-bold tabular-nums">
              <CoinSvg className="w-4 h-4" />
              {coins}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити інвентар"
            className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-amber-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sort Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 bg-stone-950/60 border-b border-stone-800">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-400 mr-1">
              Сортування:
            </span>
            {(Object.keys(SORT_LABELS) as InventorySortKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSortBy(key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  sortBy === key
                    ? 'bg-amber-500 text-stone-950'
                    : 'bg-stone-800 text-amber-100 hover:bg-stone-700'
                }`}
              >
                {SORT_LABELS[key]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            aria-label="Змінити напрямок сортування"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs font-bold text-amber-200 cursor-pointer"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            {sortDir === 'asc' ? 'Зростання' : 'Спадання'}
          </button>
        </div>

        {/* Body: Grid + Inspector */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-4 p-5">
          {/* Left: Item Grid */}
          <div className="md:col-span-7">
            {sortedItems.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-stone-700 text-center text-stone-400 text-sm">
                Ваш інвентар порожній. Відкрийте <strong>Крамницю [B]</strong>, щоб купити ржаву погану мотику (10 монет) та перше насіння!
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {sortedItems.map((item) => {
                  const isSelected = selectedItem?.itemId === item.itemId;
                  const isEquipped = activeSlotItemId === item.itemId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedItemId(item.itemId)}
                      className={`relative flex flex-col items-start gap-1.5 p-3 rounded-xl border-2 text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-amber-950/50 border-amber-400'
                          : 'bg-stone-900 border-stone-700 hover:border-stone-500'
                      }`}
                    >
                      <div className="w-full flex items-center justify-between">
                        {renderItemIcon(item, 'w-7 h-7')}
                        <span className="px-1.5 py-0.5 rounded bg-stone-800 text-xs font-extrabold tabular-nums text-amber-200">
                          ×{item.quantity}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-amber-50 line-clamp-2 leading-tight">
                        {item.name}
                      </div>
                      <div className="flex items-center justify-between w-full mt-auto pt-1 text-[11px] text-stone-400">
                        <span className="tabular-nums flex items-center gap-1">
                          <CoinSvg className="w-3 h-3" />
                          {item.value}
                        </span>
                        {isEquipped && (
                          <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> У руках
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Detailed Item Stats & Upgrade Inspector */}
          <div className="md:col-span-5">
            {selectedItem ? (
              <div className="rounded-xl border border-stone-700 bg-stone-900 p-4 space-y-3.5">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-stone-800 border border-stone-700">
                    {renderItemIcon(selectedItem, 'w-9 h-9')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-extrabold text-amber-100 leading-snug">
                      {selectedItem.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                          RARITY_LABELS[selectedItem.rarity].badge
                        }`}
                      >
                        {RARITY_LABELS[selectedItem.rarity].label}
                      </span>
                      {selectedItem.kind === 'tool' && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-stone-800 text-amber-300 border border-stone-600">
                          Рівень {selectedItem.tier}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-stone-300 leading-relaxed">{selectedItem.description}</p>

                {/* Characteristics Table */}
                <div className="rounded-lg bg-stone-950/70 border border-stone-800 p-3 space-y-1.5 text-xs">
                  <div className="font-bold uppercase tracking-wider text-stone-400 text-[10px] mb-1">
                    Характеристики предмета
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-400">Категорія:</span>
                    <span className="font-bold text-amber-100">
                      {selectedItem.kind === 'tool'
                        ? 'Інструмент'
                        : selectedItem.kind === 'seed'
                          ? 'Насіння для посіву'
                          : 'Зібраний врожай'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-400">Оціночна вартість:</span>
                    <span className="font-bold text-amber-300 tabular-nums">{selectedItem.value} монет</span>
                  </div>
                  {selectedItem.stats.speedMultiplier !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-stone-400">Швидкість / Ефективність:</span>
                      <span className="font-bold text-emerald-300 tabular-nums">
                        ×{selectedItem.stats.speedMultiplier.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {selectedItem.stats.yieldBonusPct !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-stone-400">Бонус до врожаю:</span>
                      <span className="font-bold text-emerald-300 tabular-nums">
                        +{selectedItem.stats.yieldBonusPct}%
                      </span>
                    </div>
                  )}
                  {selectedItem.stats.durabilityLabel && (
                    <div className="flex justify-between">
                      <span className="text-stone-400">Матеріал / Стан:</span>
                      <span className="font-bold text-amber-100">{selectedItem.stats.durabilityLabel}</span>
                    </div>
                  )}
                  {selectedItem.stats.growthSeconds !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-stone-400">Час дозрівання:</span>
                      <span className="font-bold text-sky-300 tabular-nums">
                        {selectedItem.stats.growthSeconds} сек
                      </span>
                    </div>
                  )}
                  {selectedItem.stats.sellPrice !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-stone-400">Ціна продажу плоду:</span>
                      <span className="font-bold text-amber-300 tabular-nums">
                        {selectedItem.stats.sellPrice} монет
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="space-y-2 pt-1">
                  {(selectedItem.kind === 'tool' || selectedItem.kind === 'seed') && (
                    <button
                      type="button"
                      onClick={() => onSelectActive(selectedItem.itemId)}
                      className="w-full py-2 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                    >
                      {activeSlotItemId === selectedItem.itemId
                        ? 'Вже вибрано в руках'
                        : 'Взяти в руки (Активний слот)'}
                    </button>
                  )}

                  {selectedItem.kind === 'tool' && toolDef?.upgradeToId && nextUpgradeDef && toolDef.upgradeCost !== null && (
                    <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-600/50 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-amber-300 flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          Покращити до:
                        </span>
                        <span className="font-extrabold text-amber-100">{nextUpgradeDef.name}</span>
                      </div>
                      <div className="text-[11px] text-emerald-300">
                        Нові характеристики: ×{nextUpgradeDef.speedMultiplier.toFixed(2)} швидкість · +{nextUpgradeDef.yieldBonusPct}% врожай
                      </div>
                      <button
                        type="button"
                        disabled={coins < toolDef.upgradeCost}
                        onClick={() => onUpgradeTool(selectedItem.itemId)}
                        className="w-full py-2 rounded-lg font-extrabold text-xs bg-amber-500 hover:bg-amber-400 text-stone-950 disabled:opacity-45 cursor-pointer"
                      >
                        Покращити за {toolDef.upgradeCost} монет
                      </button>
                    </div>
                  )}

                  {selectedItem.kind === 'crop' && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => onSellCrop(selectedItem.itemId, 1)}
                        className="py-2 rounded-xl font-bold text-xs bg-amber-600 hover:bg-amber-500 text-stone-950 cursor-pointer"
                      >
                        Продати 1 ({selectedItem.value} 🪙)
                      </button>
                      <button
                        type="button"
                        onClick={() => onSellCrop(selectedItem.itemId, selectedItem.quantity)}
                        className="py-2 rounded-xl font-bold text-xs bg-amber-500 hover:bg-amber-400 text-stone-950 cursor-pointer"
                      >
                        Все ({selectedItem.value * selectedItem.quantity} 🪙)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-stone-800 bg-stone-900 p-4 text-xs text-stone-400">
                Оберіть предмет зліва, щоб переглянути його характеристики.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
