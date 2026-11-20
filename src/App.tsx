import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameHUD } from './components/GameHUD';
import { InventoryModal } from './components/InventoryModal';
import { NeighborsModal } from './components/NeighborsModal';
import { PauseModal } from './components/PauseModal';
import { ShopModal } from './components/ShopModal';
import { TitleAuthOverlay } from './components/TitleAuthOverlay';
import { soundEngine } from './game/audio';
import {
  STARTER_FREE_PLOTS,
  createSeededNpcPlayers,
  createSeededWorldPlots,
  getLandSquarePrice,
} from './game/catalog';
import {
  buyShopItem,
  findFreeStarterCluster,
  getPurchasableAdjacentPlots,
  gridToWorldCenter,
  harvestVoxelsOnPlot,
  isPlotAdjacentToOwned,
  normalizePlot,
  plantVoxelOnPlot,
  purchaseLandSquare,
  sellCropFromInventory,
  summarizePlotVoxels,
  tillVoxelsOnPlot,
  upgradeToolInInventory,
  voxelToWorldCenter,
  waterVoxelsOnPlot,
} from './game/rules';
import type {
  ChatMessage,
  DayTimeMode,
  GamePhase,
  InventoryItem,
  LandSquare,
  PlayerProfile,
} from './game/types';
import { WorldSceneController } from './game/WorldScene';
import {
  WorldSyncChannel,
  createDemoSession,
  hydrateFirebaseFarmer,
  loginFirebaseFarmer,
  mapFirebaseErrorToUkrainian,
  registerFirebaseFarmer,
  signOutFirebaseFarmer,
  subscribeFirebaseAuth,
  type SessionInitData,
} from './services/firebaseClient';

type ActiveModal = 'none' | 'inventory' | 'shop' | 'neighbors';

const DAY_MODE_ORDER: DayTimeMode[] = ['auto', 'dawn', 'day', 'sunset', 'night'];
const DAY_MODE_TOAST: Record<DayTimeMode, string> = {
  auto: 'Автоматична зміна дня і ночі',
  dawn: 'Освітлення: Світанок',
  day: 'Освітлення: Ясний день',
  sunset: 'Освітлення: Захід сонця',
  night: 'Освітлення: Зоряна ніч',
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const badgeLayerRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<WorldSceneController | null>(null);
  const syncRef = useRef<WorldSyncChannel | null>(null);

  const [phase, setPhase] = useState<GamePhase>('title');
  const [activeModal, setActiveModal] = useState<ActiveModal>('none');
  const [shopInitialTab, setShopInitialTab] = useState<'tools' | 'seeds' | 'land'>('tools');

  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [localPlayer, setLocalPlayer] = useState<PlayerProfile | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [players, setPlayers] = useState<Record<string, PlayerProfile>>(() =>
    createSeededNpcPlayers(Date.now()),
  );
  const [plots, setPlots] = useState<Record<string, LandSquare>>(() =>
    createSeededWorldPlots(Date.now()),
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome_1',
      uid: 'npc_oleg',
      nickname: 'Олег_Агро',
      text: 'Вітаю у Ковелі! Обери 4 сусідні ділянки (по 9 вокселів) і бери ржаву мотику за 10 монет!',
      timestamp: Date.now() - 30000,
      color: '#3b82f6',
    },
  ]);

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [hoveredVIdx, setHoveredVIdx] = useState<number>(4);
  const [standingKey, setStandingKey] = useState<string | null>(null);
  const [standingVIdx, setStandingVIdx] = useState<number>(4);
  const [dayTimeMode, setDayTimeMode] = useState<DayTimeMode>('auto');
  const [dayPhaseLabel, setDayPhaseLabel] = useState<string>('День');
  const [muted, setMuted] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number>(0);

  const stateRef = useRef({
    phase,
    localPlayer,
    inventory,
    plots,
    players,
    hoveredKey,
    hoveredVIdx,
    standingKey,
    standingVIdx,
  });
  stateRef.current = {
    phase,
    localPlayer,
    inventory,
    plots,
    players,
    hoveredKey,
    hoveredVIdx,
    standingKey,
    standingVIdx,
  };

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 3400);
  }, []);

  useEffect(() => {
    document.body.dataset.state = phase;
    worldRef.current?.setPhase(phase);
    if (phase !== 'playing') {
      worldRef.current?.clearInputs();
    }
  }, [phase]);

  useEffect(() => {
    if (!worldRef.current) return;
    const mergedPlayers = { ...players };
    if (localPlayer) {
      mergedPlayers[localPlayer.uid] = localPlayer;
    }
    worldRef.current.syncPlayers(mergedPlayers);
  }, [players, localPlayer]);

  useEffect(() => {
    worldRef.current?.syncPlots(plots);
  }, [plots]);

  const handleSquareActionRef = useRef<(key: string, vIdx: number) => void>(() => {});
  const handleCycleDayTimeRef = useRef<() => void>(() => {});

  const enterWorldSession = useCallback((session: SessionInitData) => {
    syncRef.current?.stop();
    const channel = new WorldSyncChannel(session.mode, session.profile.uid);
    syncRef.current = channel;

    worldRef.current?.setLocalUid(session.profile.uid);
    worldRef.current?.teleportLocalPlayer(session.profile.x, session.profile.z);

    setLocalPlayer(session.profile);
    setInventory(session.inventory);
    setPlots(session.plots);
    setPlayers((prev) => ({
      ...prev,
      [session.profile.uid]: session.profile,
    }));

    channel.start({
      onPlayers: (remotePlayers) => {
        setPlayers((prev) => {
          const next = { ...prev, ...remotePlayers };
          if (stateRef.current.localPlayer) {
            next[stateRef.current.localPlayer.uid] = stateRef.current.localPlayer;
          }
          return next;
        });
      },
      onPlots: (remotePlots) => {
        setPlots((prev) => {
          const next = { ...prev };
          for (const [k, rp] of Object.entries(remotePlots)) {
            if (rp) next[k] = normalizePlot(rp);
          }
          return next;
        });
      },
      onChat: (incoming) => {
        setChatMessages((prev) => {
          const map = new Map<string, ChatMessage>();
          prev.forEach((m) => map.set(m.id, m));
          incoming.forEach((m) => map.set(m.id, m));
          return Array.from(map.values())
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-50);
        });
      },
    });

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setActiveModal('none');
    setPhase('playing');
    document.body.dataset.state = 'playing';
  }, []);

  useEffect(() => {
    if (!canvasMountRef.current) return;
    const controller = new WorldSceneController(canvasMountRef.current, badgeLayerRef.current, {
      onHoverSquare: (key, vIdx) => {
        setHoveredKey(key);
        setHoveredVIdx(vIdx);
      },
      onSelectSquare: (key, vIdx) => handleSquareActionRef.current(key, vIdx),
      onStandingSquareChange: (key, vIdx) => {
        setStandingKey(key);
        setStandingVIdx(vIdx);
      },
      onDayPhaseLabelChange: (label) => setDayPhaseLabel(label),
      onLocalPlayerMove: (x, z, yaw, isMoving) => {
        const cur = stateRef.current.localPlayer;
        if (!cur) return;
        cur.x = x;
        cur.z = z;
        cur.yaw = yaw;
        cur.isMoving = isMoving;
        syncRef.current?.syncPosition(x, z, yaw, isMoving);
      },
    });
    worldRef.current = controller;
    controller.syncPlots(stateRef.current.plots);
    controller.syncPlayers(stateRef.current.players);

    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      const demo = createDemoSession('Коваль_Фермер');
      enterWorldSession(demo);
    }

    return () => {
      controller.dispose();
      worldRef.current = null;
      syncRef.current?.stop();
    };
  }, [enterWorldSession]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') return;

    const unsub = subscribeFirebaseAuth(async (user) => {
      if (user && !stateRef.current.localPlayer) {
        try {
          const session = await hydrateFirebaseFarmer(user);
          enterWorldSession(session);
        } catch {
          // Stay on title if hydration fails
        }
      }
    });
    return () => unsub();
  }, [enterWorldSession]);

  const persistProfileAndInventory = useCallback(
    (nextPlayer: PlayerProfile, nextInv: InventoryItem[]) => {
      setLocalPlayer(nextPlayer);
      setInventory(nextInv);
      setPlayers((prev) => ({ ...prev, [nextPlayer.uid]: nextPlayer }));
      syncRef.current?.syncPlayerProfile(nextPlayer, nextInv);
    },
    [],
  );

  const handleCycleDayTime = useCallback(() => {
    setDayTimeMode((prev) => {
      const idx = DAY_MODE_ORDER.indexOf(prev);
      const next = DAY_MODE_ORDER[(idx + 1) % DAY_MODE_ORDER.length];
      worldRef.current?.setDayTimeMode(next);
      if (worldRef.current) {
        setDayPhaseLabel(worldRef.current.getDayPhaseLabel());
      }
      showToast(DAY_MODE_TOAST[next]);
      return next;
    });
  }, [showToast]);

  handleCycleDayTimeRef.current = handleCycleDayTime;

  const handleAutoClaimStarter = useCallback(() => {
    const { localPlayer: p, inventory: inv, plots: allPlots } = stateRef.current;
    if (!p || p.freeClaimsRemaining <= 0) return;

    let currentPlayer = p;
    const currentPlots = { ...allPlots };
    let firstClaimed: LandSquare | null = null;

    if (currentPlayer.ownedCount === 0) {
      const cluster = findFreeStarterCluster(currentPlots, STARTER_FREE_PLOTS);
      for (const target of cluster) {
        const res = purchaseLandSquare(currentPlayer, target.key, currentPlots);
        if (res.ok && res.data) {
          currentPlayer = res.data.player;
          currentPlots[target.key] = res.data.plot;
          if (!firstClaimed) firstClaimed = res.data.plot;
          syncRef.current?.syncPlot(res.data.plot);
        }
      }
    } else {
      while (currentPlayer.freeClaimsRemaining > 0) {
        const adj = getPurchasableAdjacentPlots(currentPlayer.uid, currentPlots);
        if (adj.length === 0) break;
        const target = adj[0];
        const res = purchaseLandSquare(currentPlayer, target.key, currentPlots);
        if (!res.ok || !res.data) break;
        currentPlayer = res.data.player;
        currentPlots[target.key] = res.data.plot;
        if (!firstClaimed) firstClaimed = res.data.plot;
        syncRef.current?.syncPlot(res.data.plot);
      }
    }

    if (firstClaimed) {
      const c = gridToWorldCenter(firstClaimed.gx, firstClaimed.gz);
      currentPlayer = { ...currentPlayer, x: c.x, z: c.z };
      worldRef.current?.teleportLocalPlayer(c.x, c.z);
      worldRef.current?.spawnParticles(c.x, c.z, '#4ade80', 22);
    }

    setPlots(currentPlots);
    persistProfileAndInventory(currentPlayer, inv);
    soundEngine.playCoin();
    showToast(
      `Обрано ${currentPlayer.ownedCount} сусідні ділянки (${currentPlayer.ownedCount * 9} вокселів)! Купуйте мотику у Крамниці [B].`,
    );
  }, [persistProfileAndInventory, showToast]);

  // Core 9-voxel plot & land claiming handler
  const handleSquareAction = useCallback(
    (key: string, vIdx = 4) => {
      const { localPlayer: p, inventory: inv, plots: allPlots } = stateRef.current;
      if (!p) return;
      const rawPlot = allPlots[key];
      if (!rawPlot) return;
      const plot = normalizePlot(rawPlot);

      const center = gridToWorldCenter(plot.gx, plot.gz);
      const voxelCenter = voxelToWorldCenter(plot.gx, plot.gz, vIdx);
      const now = Date.now();
      const activeItem = inv.find((i) => i.itemId === p.activeSlotItemId);
      const bestHoe = inv
        .filter((i) => i.kind === 'tool' && i.toolFamily === 'hoe')
        .sort((a, b) => b.tier - a.tier)[0];
      const bestCan = inv
        .filter((i) => i.kind === 'tool' && i.toolFamily === 'watering_can')
        .sort((a, b) => b.tier - a.tier)[0];

      // 1. Unowned land -> free starter adjacent claim OR paid expansion
      if (!plot.ownerId) {
        if (!isPlotAdjacentToOwned(plot.gx, plot.gz, p.uid, allPlots)) {
          soundEngine.playError();
          showToast(
            p.freeClaimsRemaining > 0
              ? 'Стартові 4 ділянки мають бути по сусідству! Клікніть поруч із вашою.'
              : 'Можна купувати лише сусідню ділянку біля вашої ферми!',
          );
          return;
        }
        const buyRes = purchaseLandSquare(p, key, allPlots);
        if (!buyRes.ok || !buyRes.data) {
          soundEngine.playError();
          showToast(buyRes.error || 'Не вдалося зайняти ділянку.');
          return;
        }
        let nextPlayer = buyRes.data.player;
        if (buyRes.data.isFreeStarter && p.ownedCount === 0) {
          nextPlayer = { ...nextPlayer, x: center.x, z: center.z };
          worldRef.current?.teleportLocalPlayer(center.x, center.z);
        }
        setPlots((prev) => ({ ...prev, [key]: buyRes.data!.plot }));
        persistProfileAndInventory(nextPlayer, inv);
        syncRef.current?.syncPlot(buyRes.data.plot);
        soundEngine.playCoin();
        worldRef.current?.spawnParticles(center.x, center.z, '#4ade80', 18);

        if (buyRes.data.isFreeStarter) {
          if (nextPlayer.freeClaimsRemaining > 0) {
            showToast(
              `Ділянку зайнято (9 вокселів)! Оберіть ще ${nextPlayer.freeClaimsRemaining} по сусідству.`,
            );
          } else {
            showToast('Усі 4 стартові сусідні ділянки (36 вокселів) готові! Купіть мотику в Крамниці [B].');
          }
        } else {
          showToast(`Куплено нову ділянку (9 вокселів) за ${buyRes.data.price} монет!`);
        }
        return;
      }

      // 2. Neighbor's square -> inspect progress
      if (plot.ownerId !== p.uid) {
        const sum = summarizePlotVoxels(plot, now);
        if (sum.plantedCount > 0) {
          showToast(
            `Ферма ${plot.ownerName}: посіяно ${sum.plantedCount}/9 вокс. (${Math.round(sum.maxProgress * 100)}%)`,
          );
        } else {
          showToast(`Ділянка гравця ${plot.ownerName} (9 вокселів).`);
        }
        return;
      }

      // 3. Own square -> act across the 9 voxels!
      const sum = summarizePlotVoxels(plot, now);
      const targetedCell = plot.voxels[vIdx] ?? plot.voxels[4];

      // 3a. Ready crops to harvest?
      if (sum.readyCount > 0) {
        const harv = harvestVoxelsOnPlot(plot, p.uid, inv, bestHoe, vIdx, now);
        if (harv.ok && harv.data) {
          const updatedPlayer: PlayerProfile = {
            ...p,
            totalHarvested: p.totalHarvested + harv.data.harvestedQty,
          };
          setPlots((prev) => ({ ...prev, [key]: harv.data!.plot }));
          persistProfileAndInventory(updatedPlayer, harv.data.inventory);
          syncRef.current?.syncPlot(harv.data.plot);
          worldRef.current?.triggerToolSwing(p.uid);
          worldRef.current?.spawnParticles(voxelCenter.x, voxelCenter.z, '#facc15', 16);
          soundEngine.playHarvest();
          showToast(`Зібрано (${harv.data.harvestedVoxels} вокс.): ${harv.data.summaryText}!`);
          return;
        }
      }

      // 3b. Explicitly holding a Watering Can & there are tilled voxels
      if (activeItem?.toolFamily === 'watering_can' && sum.tilledCount > 0) {
        const wat = waterVoxelsOnPlot(plot, p.uid, activeItem, vIdx, now);
        if (wat.ok && wat.data) {
          setPlots((prev) => ({ ...prev, [key]: wat.data!.plot }));
          syncRef.current?.syncPlot(wat.data.plot);
          worldRef.current?.triggerToolSwing(p.uid);
          worldRef.current?.spawnParticles(voxelCenter.x, voxelCenter.z, '#38bdf8', 12);
          soundEngine.playWater();
          showToast(`Полито вокселів: ${wat.data.wateredCount}! Культура росте швидше.`);
          return;
        }
      }

      // 3c. Explicitly holding Seed & there is tilled/watered empty space
      if (activeItem?.kind === 'seed' && activeItem.cropId && sum.tilledCount + sum.wateredCount > sum.plantedCount) {
        const plantRes = plantVoxelOnPlot(plot, p.uid, inv, activeItem.cropId, vIdx, now);
        if (plantRes.ok && plantRes.data) {
          const vc = voxelToWorldCenter(plot.gx, plot.gz, plantRes.data.plantedVIdx);
          setPlots((prev) => ({ ...prev, [key]: plantRes.data!.plot }));
          persistProfileAndInventory(p, plantRes.data.inventory);
          syncRef.current?.syncPlot(plantRes.data.plot);
          worldRef.current?.triggerToolSwing(p.uid);
          worldRef.current?.spawnParticles(vc.x, vc.z, '#4ade80', 10);
          soundEngine.playPlant();
          showToast(`Посіяно ${activeItem.name} у воксель ${plantRes.data.plantedVIdx + 1}/9!`);
          return;
        }
      }

      // 3d. Till grass voxel(s) with Hoe if target voxel is grass OR hoe active with grass left
      if ((targetedCell.soil === 'grass' || (activeItem?.toolFamily === 'hoe' && sum.grassCount > 0)) && sum.grassCount > 0) {
        if (!bestHoe) {
          soundEngine.playError();
          showToast('Спочатку купіть ржаву погану мотику (10 монет) у Крамниці [B]!');
          return;
        }
        const tillRes = tillVoxelsOnPlot(plot, p.uid, bestHoe, vIdx);
        if (tillRes.ok && tillRes.data) {
          const updatedPlayer: PlayerProfile = {
            ...p,
            activeSlotItemId: activeItem?.kind === 'tool' ? activeItem.itemId : bestHoe.itemId,
          };
          setPlots((prev) => ({ ...prev, [key]: tillRes.data!.plot }));
          persistProfileAndInventory(updatedPlayer, inv);
          syncRef.current?.syncPlot(tillRes.data.plot);
          worldRef.current?.triggerToolSwing(p.uid);
          worldRef.current?.spawnParticles(voxelCenter.x, voxelCenter.z, '#92400e', 12);
          soundEngine.playTill();
          showToast(`Скопано вокселів: ${tillRes.data.tilledCount}! Оберіть насіння для посіву.`);
          return;
        }
      }

      // 3e. Any empty tilled/watered voxel -> try planting with first available seed
      if (sum.tilledCount + sum.wateredCount > sum.plantedCount) {
        const seedToPlant =
          activeItem?.kind === 'seed'
            ? activeItem
            : inv.find((i) => i.kind === 'seed' && i.quantity > 0);
        if (seedToPlant && seedToPlant.cropId) {
          const plantRes = plantVoxelOnPlot(plot, p.uid, inv, seedToPlant.cropId, vIdx, now);
          if (plantRes.ok && plantRes.data) {
            const vc = voxelToWorldCenter(plot.gx, plot.gz, plantRes.data.plantedVIdx);
            setPlots((prev) => ({ ...prev, [key]: plantRes.data!.plot }));
            persistProfileAndInventory(p, plantRes.data.inventory);
            syncRef.current?.syncPlot(plantRes.data.plot);
            worldRef.current?.triggerToolSwing(p.uid);
            worldRef.current?.spawnParticles(vc.x, vc.z, '#4ade80', 10);
            soundEngine.playPlant();
            showToast(`Посіяно ${seedToPlant.name}!`);
            return;
          }
        } else if (bestCan && sum.tilledCount > 0) {
          const wat = waterVoxelsOnPlot(plot, p.uid, bestCan, vIdx, now);
          if (wat.ok && wat.data) {
            setPlots((prev) => ({ ...prev, [key]: wat.data!.plot }));
            syncRef.current?.syncPlot(wat.data.plot);
            worldRef.current?.triggerToolSwing(p.uid);
            worldRef.current?.spawnParticles(voxelCenter.x, voxelCenter.z, '#38bdf8', 12);
            soundEngine.playWater();
            showToast(`Полито вокселів: ${wat.data.wateredCount}!`);
            return;
          }
        }
        soundEngine.playError();
        showToast('Купіть насіння у Крамниці [B], щоб засіяти скопані вокселі!');
        return;
      }

      // 3f. All planted, maybe water or show growth
      if (bestCan && sum.tilledCount > 0) {
        const wat = waterVoxelsOnPlot(plot, p.uid, bestCan, vIdx, now);
        if (wat.ok && wat.data) {
          setPlots((prev) => ({ ...prev, [key]: wat.data!.plot }));
          syncRef.current?.syncPlot(wat.data.plot);
          worldRef.current?.triggerToolSwing(p.uid);
          worldRef.current?.spawnParticles(voxelCenter.x, voxelCenter.z, '#38bdf8', 12);
          soundEngine.playWater();
          showToast(`Полито вокселів: ${wat.data.wateredCount}!`);
          return;
        }
      }

      if (sum.plantedCount > 0) {
        showToast(`Культури на цій ділянці ще ростуть (${Math.round(sum.maxProgress * 100)}%).`);
      }
    },
    [persistProfileAndInventory, showToast],
  );

  handleSquareActionRef.current = handleSquareAction;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (phase === 'title') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (activeModal !== 'none') {
          setActiveModal('none');
        } else {
          setPhase((prev) => (prev === 'playing' ? 'paused' : 'playing'));
        }
        return;
      }

      if (phase === 'paused') return;

      if (e.code === 'KeyI') {
        e.preventDefault();
        setActiveModal((m) => (m === 'inventory' ? 'none' : 'inventory'));
      } else if (e.code === 'KeyB') {
        e.preventDefault();
        setShopInitialTab('tools');
        setActiveModal((m) => (m === 'shop' ? 'none' : 'shop'));
      } else if (e.code === 'KeyN') {
        e.preventDefault();
        setActiveModal((m) => (m === 'neighbors' ? 'none' : 'neighbors'));
      } else if (e.code === 'KeyT') {
        e.preventDefault();
        handleCycleDayTimeRef.current();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        setMuted((prev) => {
          const next = !prev;
          soundEngine.setMuted(next);
          return next;
        });
      } else if (e.key >= '1' && e.key <= '6') {
        const idx = Number(e.key) - 1;
        const hotbar = inventory.filter((i) => i.kind === 'tool' || i.kind === 'seed');
        const chosen = hotbar[idx];
        if (chosen && localPlayer) {
          persistProfileAndInventory(
            { ...localPlayer, activeSlotItemId: chosen.itemId },
            inventory,
          );
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, activeModal, inventory, localPlayer, persistProfileAndInventory]);

  // Nickname + Password Auth handlers
  const handleLogin = async (nickname: string, password: string) => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const session = await loginFirebaseFarmer(nickname, password);
      enterWorldSession(session);
    } catch (err) {
      setAuthError(mapFirebaseErrorToUkrainian(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleRegister = async (nickname: string, password: string) => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const session = await registerFirebaseFarmer(nickname, password);
      enterWorldSession(session);
    } catch (err) {
      setAuthError(mapFirebaseErrorToUkrainian(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleStartDemo = (nickname: string) => {
    setAuthError(null);
    const session = createDemoSession(nickname);
    enterWorldSession(session);
  };

  const handleBuyItem = (itemId: string, qty: number) => {
    if (!localPlayer) return;
    const res = buyShopItem(localPlayer.coins, inventory, itemId, qty);
    if (!res.ok || !res.data) {
      soundEngine.playError();
      showToast(res.error || 'Недостатньо монет.');
      return;
    }
    const maxTier = res.data.inventory.reduce(
      (acc, i) => (i.kind === 'tool' ? Math.max(acc, i.tier) : acc),
      localPlayer.bestToolTier,
    );
    const updatedPlayer: PlayerProfile = {
      ...localPlayer,
      coins: res.data.coins,
      bestToolTier: maxTier,
      activeSlotItemId: localPlayer.activeSlotItemId || itemId,
    };
    persistProfileAndInventory(updatedPlayer, res.data.inventory);
    soundEngine.playCoin();
    showToast('Покупку успішно додано до інвентарю!');
  };

  const handleUpgradeTool = (itemId: string) => {
    if (!localPlayer) return;
    const res = upgradeToolInInventory(localPlayer.coins, inventory, itemId);
    if (!res.ok || !res.data) {
      soundEngine.playError();
      showToast(res.error || 'Не вдалося покращити.');
      return;
    }
    const updatedPlayer: PlayerProfile = {
      ...localPlayer,
      coins: res.data.coins,
      bestToolTier: Math.max(localPlayer.bestToolTier, res.data.newTool.tier),
      activeSlotItemId:
        localPlayer.activeSlotItemId === itemId
          ? res.data.newTool.itemId
          : localPlayer.activeSlotItemId,
    };
    persistProfileAndInventory(updatedPlayer, res.data.inventory);
    soundEngine.playUpgrade();
    worldRef.current?.spawnParticles(localPlayer.x, localPlayer.z, '#facc15', 20);
    showToast(`Покращено до «${res.data.newTool.name}»!`);
  };

  const handleSellCrop = (itemId: string, qty: number) => {
    if (!localPlayer) return;
    const res = sellCropFromInventory(localPlayer.coins, inventory, itemId, qty);
    if (!res.ok || !res.data) {
      soundEngine.playError();
      showToast(res.error || 'Немає врожаю.');
      return;
    }
    persistProfileAndInventory(
      { ...localPlayer, coins: res.data.coins },
      res.data.inventory,
    );
    soundEngine.playCoin();
    showToast(`Продано врожай за +${res.data.earned} монет!`);
  };

  const handleBuyLand = (plotKey: string) => {
    if (!localPlayer) return;
    const res = purchaseLandSquare(localPlayer, plotKey, plots);
    if (!res.ok || !res.data) {
      soundEngine.playError();
      showToast(res.error || 'Не вдалося розширити землю.');
      return;
    }
    setPlots((prev) => ({ ...prev, [plotKey]: res.data!.plot }));
    persistProfileAndInventory(res.data.player, inventory);
    syncRef.current?.syncPlot(res.data.plot);
    const center = gridToWorldCenter(res.data.plot.gx, res.data.plot.gz);
    worldRef.current?.spawnParticles(center.x, center.z, '#4ade80', 18);
    soundEngine.playCoin();
    showToast(
      res.data.isFreeStarter
        ? `Зайнято безкоштовну ділянку! Залишилось обрати: ${res.data.player.freeClaimsRemaining}`
        : `Землю розширено! Ділянок: ${res.data.player.ownedCount} (наступна: ${getLandSquarePrice(res.data.player.ownedCount)} 🪙)`,
    );
  };

  const handleVisitFarmer = (target: PlayerProfile) => {
    if (!localPlayer) return;
    const targetPlots = Object.values(plots).filter((p) => p.ownerId === target.uid);
    let destX = target.x;
    let destZ = target.z;
    if (targetPlots.length > 0) {
      const c = gridToWorldCenter(targetPlots[0].gx, targetPlots[0].gz);
      destX = c.x - 2.6;
      destZ = c.z;
    }
    worldRef.current?.teleportLocalPlayer(destX, destZ);
    setActiveModal('none');
    showToast(`Ви завітали на ферму гравця ${target.nickname}!`);
  };

  const handleSendChat = async (text: string) => {
    if (!localPlayer || !syncRef.current) return;
    const msg = await syncRef.current.sendChat({
      uid: localPlayer.uid,
      nickname: localPlayer.nickname,
      text,
      timestamp: Date.now(),
      color: localPlayer.color,
    });
    setChatMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg].slice(-50);
    });
  };

  const handleLogoutToTitle = async () => {
    const uid = localPlayer?.uid;
    syncRef.current?.stop();
    syncRef.current = null;
    await signOutFirebaseFarmer(uid);
    setLocalPlayer(null);
    setActiveModal('none');
    setPhase('title');
  };

  const focusedKey = hoveredKey || standingKey;
  const focusedVIdx = hoveredKey ? hoveredVIdx : standingVIdx;

  return (
    <main className="relative w-screen h-screen overflow-hidden">
      {/* Isolated WebGL Canvas Container */}
      <div
        ref={canvasMountRef}
        data-testid="voxel-canvas-mount"
        className="absolute inset-0 w-full h-full"
      />

      {/* Projected Overhead Nicknames Layer */}
      <div
        ref={badgeLayerRef}
        data-testid="overhead-nicknames"
        className="fixed inset-0 pointer-events-none overflow-hidden z-5"
      />

      {/* Title & Nickname+Password Auth Overlay */}
      {phase === 'title' && (
        <TitleAuthOverlay
          onLogin={handleLogin}
          onRegister={handleRegister}
          onStartDemo={handleStartDemo}
          authBusy={authBusy}
          authError={authError}
        />
      )}

      {/* Active Gameplay HUD */}
      {phase !== 'title' && localPlayer && (
        <GameHUD
          player={localPlayer}
          inventory={inventory}
          plots={plots}
          activeSlotItemId={localPlayer.activeSlotItemId}
          focusedSquareKey={focusedKey}
          focusedVoxelIdx={focusedVIdx}
          dayTimeMode={dayTimeMode}
          dayPhaseLabel={dayPhaseLabel}
          chatMessages={chatMessages}
          muted={muted}
          toastMessage={toastMessage}
          onSelectActiveSlot={(itemId) =>
            persistProfileAndInventory({ ...localPlayer, activeSlotItemId: itemId }, inventory)
          }
          onActionAtFocused={() => {
            if (focusedKey) handleSquareAction(focusedKey, focusedVIdx);
          }}
          onAutoClaimStarter={handleAutoClaimStarter}
          onCycleDayTime={handleCycleDayTime}
          onOpenShop={(tab = 'tools') => {
            setShopInitialTab(tab);
            setActiveModal('shop');
          }}
          onOpenInventory={() => setActiveModal('inventory')}
          onOpenNeighbors={() => setActiveModal('neighbors')}
          onRotateCamera={() => worldRef.current?.rotateCameraStep(1)}
          onToggleMute={() => {
            setMuted((prev) => {
              const next = !prev;
              soundEngine.setMuted(next);
              return next;
            });
          }}
          onPause={() => setPhase((p) => (p === 'playing' ? 'paused' : 'playing'))}
          onSendChat={handleSendChat}
        />
      )}

      {/* Modals */}
      {phase === 'playing' && localPlayer && activeModal === 'inventory' && (
        <InventoryModal
          coins={localPlayer.coins}
          inventory={inventory}
          activeSlotItemId={localPlayer.activeSlotItemId}
          onSelectActive={(itemId) =>
            persistProfileAndInventory({ ...localPlayer, activeSlotItemId: itemId }, inventory)
          }
          onUpgradeTool={handleUpgradeTool}
          onSellCrop={handleSellCrop}
          onClose={() => setActiveModal('none')}
        />
      )}

      {phase === 'playing' && localPlayer && activeModal === 'shop' && (
        <ShopModal
          player={localPlayer}
          inventory={inventory}
          plots={plots}
          initialTab={shopInitialTab}
          onBuyItem={handleBuyItem}
          onUpgradeTool={handleUpgradeTool}
          onSellCrop={handleSellCrop}
          onBuyLand={handleBuyLand}
          onClose={() => setActiveModal('none')}
        />
      )}

      {phase === 'playing' && localPlayer && activeModal === 'neighbors' && (
        <NeighborsModal
          localUid={localPlayer.uid}
          players={players}
          plots={plots}
          onVisitFarmer={handleVisitFarmer}
          onClose={() => setActiveModal('none')}
        />
      )}

      {phase === 'paused' && localPlayer && (
        <PauseModal
          player={localPlayer}
          muted={muted}
          onResume={() => setPhase('playing')}
          onToggleMute={() => {
            setMuted((prev) => {
              const next = !prev;
              soundEngine.setMuted(next);
              return next;
            });
          }}
          onLogoutToTitle={handleLogoutToTitle}
        />
      )}
    </main>
  );
}
