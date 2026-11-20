import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameHUD } from './components/GameHUD';
import { InventoryModal } from './components/InventoryModal';
import { NeighborsModal } from './components/NeighborsModal';
import { PauseModal } from './components/PauseModal';
import { ShopModal } from './components/ShopModal';
import { TitleAuthOverlay } from './components/TitleAuthOverlay';
import { soundEngine } from './game/audio';
import { createSeededNpcPlayers, createSeededWorldPlots, getLandSquarePrice } from './game/catalog';
import {
  buyShopItem,
  computeCropGrowth,
  gridToWorldCenter,
  harvestPlot,
  isPlotAdjacentToOwned,
  plantSeedOnPlot,
  purchaseLandSquare,
  sellCropFromInventory,
  tillPlot,
  upgradeToolInInventory,
  waterPlot,
} from './game/rules';
import type { ChatMessage, GamePhase, InventoryItem, LandSquare, PlayerProfile } from './game/types';
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
      text: 'Вітаю у Ковелі! Бери ржаву мотику за 10 монет і засівай свій перший квадрат!',
      timestamp: Date.now() - 30000,
      color: '#3b82f6',
    },
  ]);

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [standingKey, setStandingKey] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number>(0);

  // Refs for latest state inside imperative Three.js callbacks
  const stateRef = useRef({
    phase,
    localPlayer,
    inventory,
    plots,
    players,
    hoveredKey,
    standingKey,
  });
  stateRef.current = {
    phase,
    localPlayer,
    inventory,
    plots,
    players,
    hoveredKey,
    standingKey,
  };

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 3200);
  }, []);

  // Mirror phase to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = phase;
    worldRef.current?.setPhase(phase);
    if (phase !== 'playing') {
      worldRef.current?.clearInputs();
    }
  }, [phase]);

  // Sync players & plots to Three.js scene whenever state updates
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

  const handleSquareActionRef = useRef<(key: string) => void>(() => {});

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
        setPlots((prev) => ({ ...prev, ...remotePlots }));
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

  // Mount Three.js WorldSceneController once
  useEffect(() => {
    if (!canvasMountRef.current) return;
    const controller = new WorldSceneController(canvasMountRef.current, badgeLayerRef.current, {
      onHoverSquare: (key) => setHoveredKey(key),
      onSelectSquare: (key) => handleSquareActionRef.current(key),
      onStandingSquareChange: (key) => setStandingKey(key),
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

    // Check ?autostart=1 for automated testability / instant entry
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

  // Listen to Firebase Auth state (only auto-enters if user was already logged in and not ?autostart=1)
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

  // Core plot interaction handler (till, plant, water, harvest, or buy city land)
  const handleSquareAction = useCallback(
    (key: string) => {
      const { localPlayer: p, inventory: inv, plots: allPlots } = stateRef.current;
      if (!p) return;
      const plot = allPlots[key];
      if (!plot) return;

      const center = gridToWorldCenter(plot.gx, plot.gz);
      const now = Date.now();
      const activeItem = inv.find((i) => i.itemId === p.activeSlotItemId);
      const bestHoe = inv
        .filter((i) => i.kind === 'tool' && i.toolFamily === 'hoe')
        .sort((a, b) => b.tier - a.tier)[0];
      const bestCan = inv
        .filter((i) => i.kind === 'tool' && i.toolFamily === 'watering_can')
        .sort((a, b) => b.tier - a.tier)[0];

      // 1. Unowned city square -> try buying if adjacent
      if (!plot.ownerId) {
        if (!isPlotAdjacentToOwned(plot.gx, plot.gz, p.uid, allPlots)) {
          soundEngine.playError();
          showToast('Можна купувати лише сусідній квадрат біля вашої ферми!');
          return;
        }
        const buyRes = purchaseLandSquare(p, key, allPlots);
        if (!buyRes.ok || !buyRes.data) {
          soundEngine.playError();
          showToast(buyRes.error || 'Не вистачає монет.');
          return;
        }
        const nextPlots = { ...allPlots, [key]: buyRes.data.plot };
        setPlots(nextPlots);
        persistProfileAndInventory(buyRes.data.player, inv);
        syncRef.current?.syncPlot(buyRes.data.plot);
        soundEngine.playCoin();
        worldRef.current?.spawnParticles(center.x, center.z, '#facc15', 16);
        showToast(`Куплено новий квадрат землі за ${buyRes.data.price} монет!`);
        return;
      }

      // 2. Neighbor's square -> inspect progress
      if (plot.ownerId !== p.uid) {
        if (plot.cropId) {
          const g = computeCropGrowth(plot, now);
          showToast(`Ферма ${plot.ownerName}: росте культура (${Math.round(g.progress * 100)}%)`);
        } else {
          showToast(`Ділянка гравця ${plot.ownerName}.`);
        }
        return;
      }

      // 3. Own square with crop -> harvest if ready, else water if watering can available
      if (plot.cropId) {
        const g = computeCropGrowth(plot, now);
        if (g.ready) {
          const harv = harvestPlot(plot, p.uid, inv, bestHoe, now);
          if (!harv.ok || !harv.data) {
            soundEngine.playError();
            showToast(harv.error || 'Не вдалося зібрати врожай.');
            return;
          }
          const updatedPlayer: PlayerProfile = {
            ...p,
            totalHarvested: p.totalHarvested + harv.data.harvestedQty,
          };
          setPlots((prev) => ({ ...prev, [key]: harv.data!.plot }));
          persistProfileAndInventory(updatedPlayer, harv.data.inventory);
          syncRef.current?.syncPlot(harv.data.plot);
          worldRef.current?.triggerToolSwing(p.uid);
          worldRef.current?.spawnParticles(center.x, center.z, '#facc15', 16);
          soundEngine.playHarvest();
          showToast(`Зібрано: ${harv.data.cropName} ×${harv.data.harvestedQty}!`);
          return;
        }

        if (plot.soil !== 'watered' && bestCan) {
          const wat = waterPlot(plot, p.uid, bestCan, now);
          if (wat.ok && wat.data) {
            setPlots((prev) => ({ ...prev, [key]: wat.data! }));
            syncRef.current?.syncPlot(wat.data);
            worldRef.current?.triggerToolSwing(p.uid);
            worldRef.current?.spawnParticles(center.x, center.z, '#38bdf8', 12);
            soundEngine.playWater();
            showToast('Грядку полито! Культура росте швидше.');
            return;
          }
        }
        showToast(`Культура ще росте (${Math.round(g.progress * 100)}%).`);
        return;
      }

      // 4. Own grass square -> till with hoe
      if (plot.soil === 'grass') {
        if (!bestHoe) {
          soundEngine.playError();
          showToast('Спочатку купіть ржаву погану мотику (10 монет) у Крамниці [B]!');
          return;
        }
        const res = tillPlot(plot, p.uid, bestHoe);
        if (!res.ok || !res.data) {
          soundEngine.playError();
          showToast(res.error || 'Не вдалося скопати.');
          return;
        }
        const updatedPlayer: PlayerProfile = {
          ...p,
          activeSlotItemId: activeItem?.kind === 'tool' ? activeItem.itemId : bestHoe.itemId,
        };
        setPlots((prev) => ({ ...prev, [key]: res.data! }));
        persistProfileAndInventory(updatedPlayer, inv);
        syncRef.current?.syncPlot(res.data);
        worldRef.current?.triggerToolSwing(p.uid);
        worldRef.current?.spawnParticles(center.x, center.z, '#92400e', 12);
        soundEngine.playTill();
        showToast('Землю скопано! Оберіть насіння для посіву.');
        return;
      }

      // 5. Own tilled/watered empty square -> water if holding can, else plant seed
      if (activeItem?.toolFamily === 'watering_can' && plot.soil === 'tilled') {
        const wat = waterPlot(plot, p.uid, activeItem, now);
        if (wat.ok && wat.data) {
          setPlots((prev) => ({ ...prev, [key]: wat.data! }));
          syncRef.current?.syncPlot(wat.data);
          worldRef.current?.triggerToolSwing(p.uid);
          worldRef.current?.spawnParticles(center.x, center.z, '#38bdf8', 12);
          soundEngine.playWater();
          showToast('Грядку зволожено!');
          return;
        }
      }

      const seedToPlant =
        activeItem?.kind === 'seed'
          ? activeItem
          : inv.find((i) => i.kind === 'seed' && i.quantity > 0);
      if (!seedToPlant || !seedToPlant.cropId) {
        soundEngine.playError();
        showToast('У вас немає насіння. Купіть культури для посіву в Крамниці [B]!');
        return;
      }
      const plantRes = plantSeedOnPlot(plot, p.uid, inv, seedToPlant.cropId, now);
      if (!plantRes.ok || !plantRes.data) {
        soundEngine.playError();
        showToast(plantRes.error || 'Не вдалося посіяти.');
        return;
      }
      setPlots((prev) => ({ ...prev, [key]: plantRes.data!.plot }));
      persistProfileAndInventory(p, plantRes.data.inventory);
      syncRef.current?.syncPlot(plantRes.data.plot);
      worldRef.current?.triggerToolSwing(p.uid);
      worldRef.current?.spawnParticles(center.x, center.z, '#4ade80', 10);
      soundEngine.playPlant();
      showToast(`Посіяно ${seedToPlant.name}!`);
    },
    [persistProfileAndInventory, showToast],
  );

  handleSquareActionRef.current = handleSquareAction;

  // Global keyboard shortcuts for modals, hotbar, mute, pause
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

  // Auth handlers
  const handleLogin = async (email: string, password: string) => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const session = await loginFirebaseFarmer(email, password);
      enterWorldSession(session);
    } catch (err) {
      setAuthError(mapFirebaseErrorToUkrainian(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleRegister = async (nickname: string, email: string, password: string) => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const session = await registerFirebaseFarmer(nickname, email, password);
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

  // Economy handlers
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
      showToast(res.error || 'Не вдалося купити землю.');
      return;
    }
    setPlots((prev) => ({ ...prev, [plotKey]: res.data!.plot }));
    persistProfileAndInventory(res.data.player, inventory);
    syncRef.current?.syncPlot(res.data.plot);
    const center = gridToWorldCenter(res.data.plot.gx, res.data.plot.gz);
    worldRef.current?.spawnParticles(center.x, center.z, '#4ade80', 18);
    soundEngine.playCoin();
    showToast(`Землю розширено! Тепер у вас ${res.data.player.ownedCount} кв. (ціна наступного: ${getLandSquarePrice(res.data.player.ownedCount)} 🪙)`);
  };

  const handleVisitFarmer = (target: PlayerProfile) => {
    if (!localPlayer) return;
    const targetPlots = Object.values(plots).filter((p) => p.ownerId === target.uid);
    let destX = target.x;
    let destZ = target.z;
    if (targetPlots.length > 0) {
      const c = gridToWorldCenter(targetPlots[0].gx, targetPlots[0].gz);
      destX = c.x - 2.2;
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

      {/* Title & Login/Registration Overlay */}
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
          chatMessages={chatMessages}
          muted={muted}
          toastMessage={toastMessage}
          onSelectActiveSlot={(itemId) =>
            persistProfileAndInventory({ ...localPlayer, activeSlotItemId: itemId }, inventory)
          }
          onActionAtFocused={() => {
            if (focusedKey) handleSquareAction(focusedKey);
          }}
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
