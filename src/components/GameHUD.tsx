import React, { useEffect, useRef, useState } from 'react';
import {
  Backpack,
  MessageSquare,
  Pause,
  RotateCw,
  ShoppingBag,
  Users,
  Volume2,
  VolumeX,
  Send,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { CROP_CATALOG, getLandSquarePrice } from '../game/catalog';
import { computeCropGrowth, isPlotAdjacentToOwned } from '../game/rules';
import type { ChatMessage, InventoryItem, LandSquare, PlayerProfile } from '../game/types';
import { CoinSvg, HoeSvg, LandPlotSvg, SeedSvg, WaterCanSvg } from './VoxelIcons';

interface GameHUDProps {
  player: PlayerProfile;
  inventory: InventoryItem[];
  plots: Record<string, LandSquare>;
  activeSlotItemId: string | null;
  focusedSquareKey: string | null;
  chatMessages: ChatMessage[];
  muted: boolean;
  toastMessage: string | null;
  onSelectActiveSlot: (itemId: string) => void;
  onActionAtFocused: () => void;
  onOpenShop: (tab?: 'tools' | 'seeds' | 'land') => void;
  onOpenInventory: () => void;
  onOpenNeighbors: () => void;
  onRotateCamera: () => void;
  onToggleMute: () => void;
  onPause: () => void;
  onSendChat: (text: string) => void;
}

export function GameHUD({
  player,
  inventory,
  plots,
  activeSlotItemId,
  focusedSquareKey,
  chatMessages,
  muted,
  toastMessage,
  onSelectActiveSlot,
  onActionAtFocused,
  onOpenShop,
  onOpenInventory,
  onOpenNeighbors,
  onRotateCamera,
  onToggleMute,
  onPause,
  onSendChat,
}: GameHUDProps) {
  const [chatOpen, setChatOpen] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [nowTick, setNowTick] = useState(() => Date.now());
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);

  // Refresh crop progress readout at ~2Hz while HUD is mounted
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages.length, chatOpen]);

  // Press Enter to focus chat input when not already typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === 'Enter' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        setChatOpen(true);
        setTimeout(() => chatInputRef.current?.focus(), 20);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hotbarItems = inventory.filter((i) => i.kind === 'tool' || i.kind === 'seed').slice(0, 6);
  const focusedPlot = focusedSquareKey ? plots[focusedSquareKey] : null;
  const activeItem = inventory.find((i) => i.itemId === activeSlotItemId) ?? null;

  // Compute contextual hint for focused square
  let squareStatusText = '';
  let actionButtonLabel: string | null = null;
  if (focusedPlot) {
    if (focusedPlot.ownerId === player.uid) {
      if (focusedPlot.cropId) {
        const growth = computeCropGrowth(focusedPlot, nowTick);
        const def = CROP_CATALOG[focusedPlot.cropId];
        if (growth.ready) {
          squareStatusText = `Ваша ділянка · ${def.cropName} готова до збору!`;
          actionButtonLabel = '[E] Зібрати врожай';
        } else {
          squareStatusText = `Ваша ділянка · ${def.cropName} (${Math.round(growth.progress * 100)}%)`;
          if (activeItem?.toolFamily === 'watering_can' && focusedPlot.soil !== 'watered') {
            actionButtonLabel = '[E] Полити грядку';
          }
        }
      } else if (focusedPlot.soil === 'grass') {
        squareStatusText = 'Ваша вільна земля · Потрібно скопати мотикою';
        actionButtonLabel = '[E] Скопати землю';
      } else {
        squareStatusText =
          focusedPlot.soil === 'watered'
            ? 'Ваша полита грядка · Готова до посіву'
            : 'Ваша скопана грядка · Готова до посіву';
        actionButtonLabel =
          activeItem?.kind === 'seed' ? `[E] Посіяти ${activeItem.name}` : '[E] Посіяти / Полити';
      }
    } else if (focusedPlot.ownerId) {
      const ownerLabel = focusedPlot.ownerName || 'Сусід';
      if (focusedPlot.cropId) {
        const growth = computeCropGrowth(focusedPlot, nowTick);
        const def = CROP_CATALOG[focusedPlot.cropId];
        squareStatusText = `Ферма ${ownerLabel} · ${def.cropName} (${Math.round(growth.progress * 100)}%)`;
      } else {
        squareStatusText = `Ферма ${ownerLabel} · Ділянка (${focusedPlot.gx}, ${focusedPlot.gz})`;
      }
    } else {
      const adj = isPlotAdjacentToOwned(focusedPlot.gx, focusedPlot.gz, player.uid, plots);
      const price = getLandSquarePrice(player.ownedCount);
      if (adj) {
        squareStatusText = `Міська земля (${focusedPlot.gx}, ${focusedPlot.gz}) · Доступно за ${price} монет`;
        actionButtonLabel = `[E] Купити квадрат (${price} 🪙)`;
      } else {
        squareStatusText = `Міська земля (${focusedPlot.gx}, ${focusedPlot.gz}) · Купіть спершу сусідній квадрат`;
      }
    }
  }

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = chatInput.trim();
    if (!clean) return;
    onSendChat(clean);
    setChatInput('');
    chatInputRef.current?.blur();
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-4">
      {/* Top Perimeter Row */}
      <div className="flex items-start justify-between gap-3">
        {/* Top-Left: Farmer Status Cluster */}
        <div
          className="pointer-events-auto flex items-center gap-3 px-3.5 py-2 rounded-2xl border-2 shadow-lg"
          style={{
            backgroundColor: 'rgba(28, 25, 23, 0.92)',
            borderColor: '#d97706',
            color: '#fef3c7',
          }}
        >
          <div
            className="w-9 h-9 rounded-xl border-2 border-stone-950 flex items-center justify-center font-black text-xs text-white shrink-0"
            style={{ backgroundColor: player.color }}
          >
            {player.nickname.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="text-xs font-extrabold tracking-wide text-amber-100 leading-none">
              {player.nickname}
            </div>
            <div className="flex items-center gap-3 mt-1.5 tabular-nums">
              <span className="flex items-center gap-1 text-sm font-black text-amber-300 leading-none">
                <CoinSvg className="w-4 h-4" />
                <span data-testid="hud-coins">{player.coins}</span>
              </span>
              <span className="flex items-center gap-1 text-xs font-bold text-emerald-300 leading-none">
                <LandPlotSvg className="w-3.5 h-3.5" />
                <span data-testid="hud-plots">{player.ownedCount}</span> кв.
              </span>
            </div>
          </div>
        </div>

        {/* Top-Center: Focused Plot / Toast Banner */}
        <div className="hidden md:flex flex-col items-center gap-1.5 max-w-md">
          {squareStatusText && (
            <div
              className="px-4 py-1.5 rounded-xl border text-xs font-bold shadow-md text-center"
              style={{
                backgroundColor: 'rgba(28, 25, 23, 0.88)',
                borderColor: 'rgba(217, 119, 6, 0.55)',
                color: '#fef3c7',
              }}
            >
              {squareStatusText}
            </div>
          )}
          {toastMessage && (
            <div
              role="status"
              className="px-4 py-1.5 rounded-xl border text-xs font-extrabold shadow-md text-center"
              style={{
                backgroundColor: 'rgba(20, 83, 45, 0.94)',
                borderColor: '#4ade80',
                color: '#ecfccb',
              }}
            >
              {toastMessage}
            </div>
          )}
        </div>

        {/* Top-Right: Utility & Feature Buttons */}
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenShop('tools');
            }}
            aria-label="Крамниця [B]"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 text-xs font-extrabold cursor-pointer shadow-md bg-amber-500 hover:bg-amber-400 border-stone-900 text-stone-950"
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="hidden sm:inline">Крамниця</span>
            <span className="text-[10px] opacity-75">[B]</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenInventory();
            }}
            aria-label="Інвентар [I]"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 text-xs font-extrabold cursor-pointer shadow-md bg-stone-900 hover:bg-stone-800 border-amber-700/80 text-amber-100"
          >
            <Backpack className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Інвентар</span>
            <span className="text-[10px] opacity-75">[I]</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenNeighbors();
            }}
            aria-label="Сусіди [N]"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 text-xs font-extrabold cursor-pointer shadow-md bg-stone-900 hover:bg-stone-800 border-sky-700/80 text-sky-100"
          >
            <Users className="w-4 h-4 text-sky-400" />
            <span className="hidden sm:inline">Сусіди</span>
            <span className="text-[10px] opacity-75">[N]</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onRotateCamera();
            }}
            aria-label="Повернути камеру [E/Q]"
            title="Повернути камеру [Q]"
            className="p-2 rounded-xl border-2 bg-stone-900 hover:bg-stone-800 border-stone-700 text-amber-200 cursor-pointer shadow-md"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={muted ? 'Увімкнути звук [M]' : 'Вимкнути звук [M]'}
            className="p-2 rounded-xl border-2 bg-stone-900 hover:bg-stone-800 border-stone-700 text-amber-200 cursor-pointer shadow-md"
          >
            {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label="Меню паузи [Esc]"
            className="p-2 rounded-xl border-2 bg-stone-900 hover:bg-stone-800 border-stone-700 text-amber-200 cursor-pointer shadow-md"
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile toast fallback */}
      {toastMessage && (
        <div className="md:hidden self-center px-3 py-1 rounded-lg bg-emerald-900 border border-emerald-400 text-xs font-bold text-emerald-100">
          {toastMessage}
        </div>
      )}

      {/* Bottom Perimeter Row: Chat on Left, Hotbar in Center */}
      <div className="flex items-end justify-between gap-3">
        {/* Bottom-Left: Real-Time Chat Drawer */}
        <div
          className="pointer-events-auto w-[270px] sm:w-[310px] rounded-2xl border-2 overflow-hidden shadow-xl"
          style={{
            backgroundColor: 'rgba(24, 22, 20, 0.9)',
            borderColor: 'rgba(217, 119, 6, 0.55)',
            color: '#fef3c7',
          }}
        >
          <button
            type="button"
            onClick={() => setChatOpen((o) => !o)}
            className="w-full flex items-center justify-between px-3 py-1.5 bg-stone-900/90 text-xs font-extrabold text-amber-200 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
              Чат фермерів ({chatMessages.length})
            </span>
            {chatOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>

          {chatOpen && (
            <div>
              <div
                ref={chatScrollRef}
                className="h-28 overflow-y-auto px-3 py-2 space-y-1 text-xs"
              >
                {chatMessages.length === 0 ? (
                  <div className="text-stone-400 italic">Поки що тихо... Напишіть сусідам!</div>
                ) : (
                  chatMessages.map((msg) => (
                    <div key={msg.id} className="leading-snug break-words">
                      <span className="font-extrabold mr-1.5" style={{ color: msg.color }}>
                        {msg.nickname}:
                      </span>
                      <span className="text-stone-100">{msg.text}</span>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleChatSubmit} className="flex border-t border-stone-800">
                <label htmlFor="farm-chat-input" className="sr-only">
                  Повідомлення у чат
                </label>
                <input
                  id="farm-chat-input"
                  ref={chatInputRef}
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Написати в чат [Enter]..."
                  maxLength={140}
                  className="flex-1 bg-stone-950/90 px-2.5 py-1.5 text-xs text-amber-50 placeholder-stone-500 focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Надіслати повідомлення"
                  className="px-2.5 bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Bottom-Center: Action Prompt + Tool/Seed Hotbar */}
        <div className="pointer-events-auto flex flex-col items-center gap-2 mx-auto sm:mx-0">
          {actionButtonLabel && (
            <button
              type="button"
              onClick={onActionAtFocused}
              className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border-2 border-stone-950 text-xs font-extrabold shadow-lg cursor-pointer"
            >
              {actionButtonLabel}
            </button>
          )}

          <div
            className="flex items-center gap-1.5 p-1.5 rounded-2xl border-2 shadow-xl"
            style={{
              backgroundColor: 'rgba(28, 25, 23, 0.92)',
              borderColor: '#d97706',
            }}
          >
            {hotbarItems.length === 0 ? (
              <button
                type="button"
                onClick={() => onOpenShop('tools')}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-extrabold cursor-pointer"
              >
                Купити мотику (10 🪙) і насіння в Крамниці
              </button>
            ) : (
              hotbarItems.map((item, idx) => {
                const isActive = activeSlotItemId === item.itemId;
                const cropDef = item.cropId ? CROP_CATALOG[item.cropId] : null;
                return (
                  <button
                    key={item.id}
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onSelectActiveSlot(item.itemId);
                    }}
                    title={`${item.name} [${idx + 1}]`}
                    aria-label={`${item.name} слот ${idx + 1}`}
                    className={`relative w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-amber-900/80 border-amber-400'
                        : 'bg-stone-900 border-stone-700 hover:border-stone-500'
                    }`}
                  >
                    <span className="absolute top-0.5 left-1 text-[9px] font-bold text-stone-400">
                      {idx + 1}
                    </span>
                    {item.kind === 'tool' ? (
                      item.toolFamily === 'watering_can' ? (
                        <WaterCanSvg color={item.tier >= 3 ? '#38bdf8' : '#a16207'} className="w-6 h-6" />
                      ) : (
                        <HoeSvg
                          color={
                            item.tier >= 4
                              ? '#facc15'
                              : item.tier === 3
                                ? '#e2e8f0'
                                : item.tier === 2
                                  ? '#94a3b8'
                                  : '#9a5b32'
                          }
                          className="w-6 h-6"
                        />
                      )
                    ) : (
                      <SeedSvg color={cropDef?.voxelColor || '#eab308'} className="w-6 h-6" />
                    )}
                    {item.kind === 'seed' && (
                      <span className="absolute bottom-0.5 right-1 text-[10px] font-black text-amber-200 tabular-nums">
                        {item.quantity}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Spacer on desktop to balance bottom-left chat */}
        <div className="hidden lg:block w-[220px]" />
      </div>
    </div>
  );
}
