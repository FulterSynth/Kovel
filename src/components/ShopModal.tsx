import React, { useState } from 'react';
import { X, Hammer, Sprout, Map } from 'lucide-react';
import {
  CROP_LIST,
  GRID_MAX,
  GRID_MIN,
  TOOL_CATALOG,
  getLandSquarePrice,
  gridKey,
  isTownPlazaTile,
} from '../game/catalog';
import { getPurchasableAdjacentPlots } from '../game/rules';
import type { InventoryItem, LandSquare, PlayerProfile } from '../game/types';
import { CoinSvg, HoeSvg, LandPlotSvg, SeedSvg, WaterCanSvg } from './VoxelIcons';

interface ShopModalProps {
  player: PlayerProfile;
  inventory: InventoryItem[];
  plots: Record<string, LandSquare>;
  initialTab?: 'tools' | 'seeds' | 'land';
  onBuyItem: (itemId: string, qty: number) => void;
  onUpgradeTool: (itemId: string) => void;
  onSellCrop: (itemId: string, qty: number) => void;
  onBuyLand: (plotKey: string) => void;
  onClose: () => void;
}

export function ShopModal({
  player,
  inventory,
  plots,
  initialTab = 'tools',
  onBuyItem,
  onUpgradeTool,
  onSellCrop,
  onBuyLand,
  onClose,
}: ShopModalProps) {
  const [tab, setTab] = useState<'tools' | 'seeds' | 'land'>(initialTab);

  const ownedHoe = inventory.find((i) => i.kind === 'tool' && i.toolFamily === 'hoe');
  const ownedCan = inventory.find((i) => i.kind === 'tool' && i.toolFamily === 'watering_can');
  const harvestedCrops = inventory.filter((i) => i.kind === 'crop');

  const purchasablePlots = getPurchasableAdjacentPlots(player.uid, plots);
  const purchasableSet = new Set(purchasablePlots.map((p) => p.key));
  const nextLandPrice = getLandSquarePrice(player.ownedCount);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(12, 16, 14, 0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Міська крамниця та ринок землі"
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
              Крамниця та Ратуша Ковеля
            </h2>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-800 border border-amber-600/50 text-sm font-bold tabular-nums">
              <CoinSvg className="w-4 h-4" />
              {player.coins} монет
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити крамницю"
            className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-amber-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-2 bg-stone-950/70 border-b border-stone-800">
          <button
            type="button"
            onClick={() => setTab('tools')}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs sm:text-sm font-bold cursor-pointer ${
              tab === 'tools' ? 'bg-amber-500 text-stone-950' : 'bg-stone-900 text-amber-100 hover:bg-stone-800'
            }`}
          >
            <Hammer className="w-4 h-4" /> Інструменти
          </button>
          <button
            type="button"
            onClick={() => setTab('seeds')}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs sm:text-sm font-bold cursor-pointer ${
              tab === 'seeds' ? 'bg-amber-500 text-stone-950' : 'bg-stone-900 text-amber-100 hover:bg-stone-800'
            }`}
          >
            <Sprout className="w-4 h-4" /> Насіння і Продаж
          </button>
          <button
            type="button"
            onClick={() => setTab('land')}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs sm:text-sm font-bold cursor-pointer ${
              tab === 'land' ? 'bg-amber-500 text-stone-950' : 'bg-stone-900 text-amber-100 hover:bg-stone-800'
            }`}
          >
            <Map className="w-4 h-4" /> Земля міста
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'tools' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Hoe Card */}
              {(() => {
                const baseHoe = TOOL_CATALOG.rusty_hoe;
                const currentDef = ownedHoe ? TOOL_CATALOG[ownedHoe.itemId] : null;
                const nextDef = currentDef?.upgradeToId ? TOOL_CATALOG[currentDef.upgradeToId] : null;
                return (
                  <div className="rounded-xl border border-stone-700 bg-stone-900 p-4 flex flex-col justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-stone-800 border border-stone-700">
                        <HoeSvg color={currentDef && currentDef.tier >= 4 ? '#facc15' : '#9a5b32'} className="w-9 h-9" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-amber-100">
                          {currentDef ? currentDef.name : baseHoe.name}
                        </h3>
                        <p className="text-xs text-stone-300 mt-1">
                          {currentDef ? currentDef.description : baseHoe.description}
                        </p>
                      </div>
                    </div>
                    {!ownedHoe ? (
                      <button
                        type="button"
                        disabled={player.coins < (baseHoe.buyPrice ?? 10)}
                        onClick={() => onBuyItem('rusty_hoe', 1)}
                        className="w-full py-2.5 rounded-xl font-extrabold text-xs bg-amber-500 hover:bg-amber-400 text-stone-950 disabled:opacity-45 cursor-pointer"
                      >
                        Купити за {baseHoe.buyPrice} монет
                      </button>
                    ) : nextDef && currentDef?.upgradeCost ? (
                      <button
                        type="button"
                        disabled={player.coins < currentDef.upgradeCost}
                        onClick={() => onUpgradeTool(ownedHoe.itemId)}
                        className="w-full py-2.5 rounded-xl font-extrabold text-xs bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-45 cursor-pointer"
                      >
                        Покращити до «{nextDef.name}» ({currentDef.upgradeCost} 🪙)
                      </button>
                    ) : (
                      <div className="py-2 text-center rounded-xl bg-amber-950/60 border border-amber-500/40 text-xs font-bold text-amber-300">
                        Максимальний рівень інструменту!
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Watering Can Card */}
              {(() => {
                const baseCan = TOOL_CATALOG.wooden_can;
                const currentDef = ownedCan ? TOOL_CATALOG[ownedCan.itemId] : null;
                const nextDef = currentDef?.upgradeToId ? TOOL_CATALOG[currentDef.upgradeToId] : null;
                return (
                  <div className="rounded-xl border border-stone-700 bg-stone-900 p-4 flex flex-col justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-stone-800 border border-stone-700">
                        <WaterCanSvg color={currentDef && currentDef.tier >= 3 ? '#38bdf8' : '#a16207'} className="w-9 h-9" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-amber-100">
                          {currentDef ? currentDef.name : baseCan.name}
                        </h3>
                        <p className="text-xs text-stone-300 mt-1">
                          {currentDef ? currentDef.description : baseCan.description}
                        </p>
                      </div>
                    </div>
                    {!ownedCan ? (
                      <button
                        type="button"
                        disabled={player.coins < (baseCan.buyPrice ?? 8)}
                        onClick={() => onBuyItem('wooden_can', 1)}
                        className="w-full py-2.5 rounded-xl font-extrabold text-xs bg-amber-500 hover:bg-amber-400 text-stone-950 disabled:opacity-45 cursor-pointer"
                      >
                        Купити за {baseCan.buyPrice} монет
                      </button>
                    ) : nextDef && currentDef?.upgradeCost ? (
                      <button
                        type="button"
                        disabled={player.coins < currentDef.upgradeCost}
                        onClick={() => onUpgradeTool(ownedCan.itemId)}
                        className="w-full py-2.5 rounded-xl font-extrabold text-xs bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-45 cursor-pointer"
                      >
                        Покращити до «{nextDef.name}» ({currentDef.upgradeCost} 🪙)
                      </button>
                    ) : (
                      <div className="py-2 text-center rounded-xl bg-sky-950/60 border border-sky-500/40 text-xs font-bold text-sky-300">
                        Максимальний рівень лійки!
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {tab === 'seeds' && (
            <div className="space-y-4">
              {/* Harvested crops quick sell */}
              {harvestedCrops.length > 0 && (
                <div className="rounded-xl border border-emerald-700/60 bg-emerald-950/30 p-3.5">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-300 mb-2">
                    Продати ваш зібраний врожай
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {harvestedCrops.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onSellCrop(c.itemId, c.quantity)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                      >
                        Продати {c.name} ×{c.quantity} (+{c.value * c.quantity} 🪙)
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CROP_LIST.map((crop) => (
                  <div
                    key={crop.cropId}
                    className="rounded-xl border border-stone-700 bg-stone-900 p-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-stone-800 border border-stone-700">
                        <SeedSvg color={crop.voxelColor} className="w-7 h-7" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-amber-100 truncate">
                          {crop.seedName}
                        </div>
                        <div className="text-[11px] text-stone-400">
                          Ріст: {crop.growthSeconds}с · Продаж: <span className="text-amber-300 font-bold">{crop.sellPrice} 🪙</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={player.coins < crop.seedPrice}
                        onClick={() => onBuyItem(crop.seedItemId, 1)}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-extrabold disabled:opacity-40 cursor-pointer"
                      >
                        +1 ({crop.seedPrice}🪙)
                      </button>
                      <button
                        type="button"
                        disabled={player.coins < crop.seedPrice * 3}
                        onClick={() => onBuyItem(crop.seedItemId, 3)}
                        className="px-2 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-amber-200 text-xs font-bold disabled:opacity-40 cursor-pointer"
                      >
                        ×3
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'land' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-700 bg-stone-900 p-4">
                <div className="flex items-center gap-3">
                  <LandPlotSvg className="w-8 h-8" />
                  <div>
                    <div className="text-sm font-extrabold text-amber-100">
                      Розширення землі (1 ділянка = 9 вокселів)
                    </div>
                    <div className="text-xs text-stone-300">
                      {player.freeClaimsRemaining > 0 ? (
                        <>
                          Залишилось <strong className="text-emerald-300">{player.freeClaimsRemaining}</strong> безкоштовних сусідніх ділянок на старт!
                        </>
                      ) : (
                        <>
                          У вас ділянок: <strong className="text-emerald-300">{player.ownedCount}</strong> ({player.ownedCount * 9} вокселів) · Наступна:{' '}
                          <strong className="text-amber-300">{nextLandPrice} монет</strong>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {purchasablePlots.length > 0 && (
                  <button
                    type="button"
                    disabled={player.coins < nextLandPrice}
                    onClick={() => onBuyLand(purchasablePlots[0].key)}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-extrabold disabled:opacity-45 cursor-pointer"
                  >
                    {player.freeClaimsRemaining > 0
                      ? 'Взяти безкоштовну сусідню (0 🪙)'
                      : `Купити сусідній квадрат (${nextLandPrice} 🪙)`}
                  </button>
                )}
              </div>

              {/* 24x24 Shared Land Map Grid */}
              <div className="rounded-xl border border-stone-700 bg-stone-950 p-3">
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-stone-300 mb-2.5">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> Ваша земля
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-amber-400 inline-block" /> Доступно по сусідству ({nextLandPrice} 🪙)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-sky-500 inline-block" /> Земля сусідів
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-stone-600 inline-block" /> Ратуша
                  </span>
                </div>
                <div
                  className="grid gap-[2px] max-w-[480px] mx-auto"
                  style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
                >
                  {Array.from({ length: 24 }).map((_, r) =>
                    Array.from({ length: 24 }).map((__, c) => {
                      const gz = GRID_MIN + r;
                      const gx = GRID_MIN + c;
                      if (isTownPlazaTile(gx, gz)) {
                        return (
                          <div
                            key={`${gx}_${gz}`}
                            title="Міська ратуша і площа"
                            className="aspect-square rounded-[2px] bg-stone-600"
                          />
                        );
                      }
                      const key = gridKey(gx, gz);
                      const plot = plots[key];
                      const isMine = plot?.ownerId === player.uid;
                      const isBuyable = purchasableSet.has(key);
                      const isOther = Boolean(plot?.ownerId && !isMine);

                      if (isBuyable) {
                        return (
                          <button
                            key={key}
                            type="button"
                            disabled={player.coins < nextLandPrice}
                            onClick={() => onBuyLand(key)}
                            title={
                              player.freeClaimsRemaining > 0
                                ? `Обрати безкоштовну ділянку (${gx}, ${gz})`
                                : `Купити квадрат (${gx}, ${gz}) за ${nextLandPrice} монет`
                            }
                            aria-label={`Ділянка ${gx} ${gz} за ${nextLandPrice} монет`}
                            className="aspect-square rounded-[2px] bg-amber-400 hover:bg-amber-300 disabled:opacity-60 cursor-pointer"
                          />
                        );
                      }

                      return (
                        <div
                          key={key}
                          title={
                            isMine
                              ? `Ваша ділянка (${gx}, ${gz})`
                              : isOther
                                ? `Ферма ${plot?.ownerName} (${gx}, ${gz})`
                                : `Вільна земля міста (${gx}, ${gz})`
                          }
                          className={`aspect-square rounded-[2px] ${
                            isMine
                              ? 'bg-emerald-500'
                              : isOther
                                ? 'bg-sky-500'
                                : 'bg-stone-800'
                          }`}
                          style={isOther && plot?.ownerColor ? { backgroundColor: plot.ownerColor } : undefined}
                        />
                      );
                    }),
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
