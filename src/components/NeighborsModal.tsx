import React from 'react';
import { X, Navigation, Sprout, Award } from 'lucide-react';
import type { LandSquare, PlayerProfile } from '../game/types';
import { CoinSvg, LandPlotSvg } from './VoxelIcons';

interface NeighborsModalProps {
  localUid: string;
  players: Record<string, PlayerProfile>;
  plots: Record<string, LandSquare>;
  onVisitFarmer: (player: PlayerProfile) => void;
  onClose: () => void;
}

export function NeighborsModal({
  localUid,
  players,
  plots,
  onVisitFarmer,
  onClose,
}: NeighborsModalProps) {
  const list = Object.values(players).sort((a, b) => {
    if (a.uid === localUid) return -1;
    if (b.uid === localUid) return 1;
    return b.ownedCount - a.ownedCount || b.totalHarvested - a.totalHarvested;
  });

  const countPlotsFor = (uid: string) =>
    Object.values(plots).filter((p) => p.ownerId === uid).length;

  const countActiveCropsFor = (uid: string) =>
    Object.values(plots).filter((p) => p.ownerId === uid && p.cropId !== null).length;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(12, 16, 14, 0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Фермери на єдиній землі"
    >
      <div
        className="w-full max-w-2xl rounded-2xl border-2 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        style={{
          backgroundColor: '#1c1917',
          borderColor: '#d97706',
          color: '#fef3c7',
        }}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-700 bg-stone-900">
          <div>
            <h2 className="text-lg font-extrabold text-amber-200">
              Сусіди та Прогрес Ферм
            </h2>
            <p className="text-xs text-stone-400">
              Усі ділянки на одному великому шматку землі — приходьте в гості до інших гравців!
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити список сусідів"
            className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-amber-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {list.map((farmer) => {
            const isMe = farmer.uid === localUid;
            const plotCount = Math.max(farmer.ownedCount, countPlotsFor(farmer.uid));
            const cropsCount = countActiveCropsFor(farmer.uid);

            return (
              <div
                key={farmer.uid}
                className="rounded-xl border border-stone-700 bg-stone-900 p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl border-2 border-stone-950 flex items-center justify-center font-black text-sm text-white"
                    style={{ backgroundColor: farmer.color }}
                  >
                    {farmer.nickname.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-amber-100">{farmer.nickname}</span>
                      {isMe && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-900 text-emerald-200 text-[10px] font-bold">
                          Ви
                        </span>
                      )}
                      {farmer.isOnline && !isMe && (
                        <span className="px-1.5 py-0.5 rounded bg-sky-900 text-sky-200 text-[10px] font-bold">
                          У мережі
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-stone-300 tabular-nums">
                      <span className="flex items-center gap-1">
                        <LandPlotSvg className="w-3.5 h-3.5" /> {plotCount} ділянок
                      </span>
                      <span className="flex items-center gap-1">
                        <Sprout className="w-3.5 h-3.5 text-emerald-400" /> {cropsCount} посіяно
                      </span>
                      <span className="flex items-center gap-1">
                        <Award className="w-3.5 h-3.5 text-amber-400" /> Зібрано: {farmer.totalHarvested}
                      </span>
                      <span className="flex items-center gap-1">
                        <CoinSvg className="w-3.5 h-3.5" /> {farmer.coins}
                      </span>
                    </div>
                  </div>
                </div>

                {!isMe && (
                  <button
                    type="button"
                    onClick={() => onVisitFarmer(farmer)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-extrabold cursor-pointer"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    Підійти до ферми
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
