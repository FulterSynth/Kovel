import React from 'react';
import { Play, LogOut, Volume2, VolumeX } from 'lucide-react';
import type { PlayerProfile } from '../game/types';
import { CoinSvg, LandPlotSvg } from './VoxelIcons';

interface PauseModalProps {
  player: PlayerProfile;
  muted: boolean;
  onResume: () => void;
  onToggleMute: () => void;
  onLogoutToTitle: () => void;
}

export function PauseModal({
  player,
  muted,
  onResume,
  onToggleMute,
  onLogoutToTitle,
}: PauseModalProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(10, 14, 12, 0.78)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Меню паузи"
    >
      <div
        className="w-full max-w-sm rounded-2xl border-2 p-6 shadow-2xl space-y-5"
        style={{
          backgroundColor: '#1c1917',
          borderColor: '#d97706',
          color: '#fef3c7',
        }}
      >
        <div className="text-center">
          <h2 className="text-xl font-black tracking-wide text-amber-200">Пауза — Ковель Ферма</h2>
          <p className="text-xs text-stone-400 mt-1">Фермер: {player.nickname}</p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 text-center">
          <div className="p-3 rounded-xl bg-stone-900 border border-stone-700">
            <div className="text-[11px] uppercase tracking-wider text-stone-400">Монети</div>
            <div className="mt-1 flex items-center justify-center gap-1.5 text-lg font-black text-amber-300 tabular-nums">
              <CoinSvg className="w-4 h-4" />
              {player.coins}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-stone-900 border border-stone-700">
            <div className="text-[11px] uppercase tracking-wider text-stone-400">Земля</div>
            <div className="mt-1 flex items-center justify-center gap-1.5 text-lg font-black text-emerald-300 tabular-nums">
              <LandPlotSvg className="w-4 h-4" />
              {player.ownedCount} кв.
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-extrabold cursor-pointer"
          >
            <Play className="w-4 h-4" /> Продовжити гру
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-100 text-sm font-bold cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
            {muted ? 'Увімкнути звук' : 'Вимкнути звук'}
          </button>
          <button
            type="button"
            onClick={onLogoutToTitle}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-stone-900 hover:bg-red-950 border border-stone-700 text-red-300 text-sm font-bold cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> Вийти на екран входу
          </button>
        </div>
      </div>
    </div>
  );
}
