import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  getDatabase,
  ref,
  set,
  update,
  push,
  onValue,
  onDisconnect,
  query,
  limitToLast,
  get,
  type Database,
} from 'firebase/database';
import {
  PLAYER_PALETTE,
  STARTER_FREE_PLOTS,
  STARTING_COINS,
  createSeededNpcPlayers,
  createSeededWorldPlots,
} from '../game/catalog';
import { normalizePlot } from '../game/rules';
import type { ChatMessage, InventoryItem, LandSquare, PlayerProfile } from '../game/types';

export const firebaseConfig = {
  apiKey: 'AIzaSyDrQeerlWPJ0d_gZ3acvW54FQmihdAQqK4',
  authDomain: 'kovel-game.firebaseapp.com',
  databaseURL: 'https://kovel-game-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'kovel-game',
  storageBucket: 'kovel-game.firebasestorage.app',
  messagingSenderId: '1028978690479',
  appId: '1:1028978690479:web:c37e96a9b07175d325c75a',
};

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Database | null = null;

export function getFirebaseServices(): { app: FirebaseApp; auth: Auth; db: Database } {
  if (!appInstance) {
    appInstance = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    authInstance = getAuth(appInstance);
    dbInstance = getDatabase(appInstance);
  }
  return {
    app: appInstance!,
    auth: authInstance!,
    db: dbInstance!,
  };
}

/**
 * Maps any Unicode/Cyrillic/Latin nickname deterministically to a valid ASCII Firebase Auth identifier
 * so players register & sign in strictly by Nickname + Password.
 */
export function nicknameToAuthEmail(nickname: string): string {
  const normalized = nickname.trim().toLowerCase();
  const bytes = new TextEncoder().encode(normalized);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return `u_${hex}@kovel.game`;
}

export function mapFirebaseErrorToUkrainian(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Некоректний нікнейм для входу.';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Неправильний нікнейм або пароль.';
    case 'auth/email-already-in-use':
      return 'Гравець із таким нікнеймом вже існує! Оберіть інший нік або увійдіть.';
    case 'auth/weak-password':
      return 'Пароль має містити щонайменше 6 символів.';
    case 'auth/too-many-requests':
      return 'Забагато спроб входу. Зачекайте хвилинку.';
    case 'auth/network-request-failed':
      return 'Немає зв’язку з сервером Firebase. Перевірте інтернет або оберіть Оглядовий режим.';
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found':
      return 'У Firebase Console ще не увімкнено Email/Password вхід. Можете зайти через Оглядовий режим.';
    default:
      return (err as Error)?.message || 'Помилка авторизації Firebase.';
  }
}

function pickColorForUid(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = (hash * 31 + uid.charCodeAt(i)) | 0;
  }
  return PLAYER_PALETTE[Math.abs(hash) % PLAYER_PALETTE.length];
}

export interface SessionInitData {
  profile: PlayerProfile;
  inventory: InventoryItem[];
  plots: Record<string, LandSquare>;
  mode: 'firebase' | 'demo';
}

function mergeNormalizedPlots(
  basePlots: Record<string, LandSquare>,
  remotePlots: Record<string, LandSquare>,
) {
  for (const [k, p] of Object.entries(remotePlots)) {
    if (p) basePlots[k] = normalizePlot(p);
  }
}

export async function registerFirebaseFarmer(
  nickname: string,
  password: string,
): Promise<SessionInitData> {
  const { auth, db } = getFirebaseServices();
  const internalEmail = nicknameToAuthEmail(nickname);
  const cred = await createUserWithEmailAndPassword(auth, internalEmail, password);
  await updateProfile(cred.user, { displayName: nickname.trim() });

  const now = Date.now();
  const uid = cred.user.uid;
  const basePlots = createSeededWorldPlots(now);

  try {
    const snap = await get(ref(db, 'plots'));
    if (snap.exists()) {
      mergeNormalizedPlots(basePlots, snap.val() as Record<string, LandSquare>);
    }
  } catch {
    // Fallback to seeded plots
  }

  const profile: PlayerProfile = {
    uid,
    nickname: nickname.trim(),
    coins: STARTING_COINS,
    x: 1.5,
    z: 1.5,
    yaw: 0.4,
    color: pickColorForUid(uid),
    isMoving: false,
    activeSlotItemId: null,
    ownedCount: 0,
    freeClaimsRemaining: STARTER_FREE_PLOTS,
    totalHarvested: 0,
    bestToolTier: 0,
    lastSeen: now,
    isOnline: true,
  };

  await set(ref(db, `players/${uid}`), profile).catch(() => {});
  await set(ref(db, `users/${uid}/inventory`), []).catch(() => {});

  return {
    profile,
    inventory: [],
    plots: basePlots,
    mode: 'firebase',
  };
}

export async function loginFirebaseFarmer(
  nickname: string,
  password: string,
): Promise<SessionInitData> {
  const { auth, db } = getFirebaseServices();
  const internalEmail = nicknameToAuthEmail(nickname);
  const cred = await signInWithEmailAndPassword(auth, internalEmail, password);
  return hydrateFirebaseFarmer(cred.user, db);
}

export async function hydrateFirebaseFarmer(
  user: User,
  dbInput?: Database,
): Promise<SessionInitData> {
  const db = dbInput ?? getFirebaseServices().db;
  const now = Date.now();
  const uid = user.uid;
  const basePlots = createSeededWorldPlots(now);

  try {
    const plotsSnap = await get(ref(db, 'plots'));
    if (plotsSnap.exists()) {
      mergeNormalizedPlots(basePlots, plotsSnap.val() as Record<string, LandSquare>);
    } else {
      const seededOnly: Record<string, LandSquare> = {};
      for (const [k, v] of Object.entries(basePlots)) {
        if (v.ownerId) seededOnly[k] = v;
      }
      await update(ref(db, 'plots'), seededOnly).catch(() => {});
    }
  } catch {
    // Keep basePlots
  }

  let profile: PlayerProfile | null = null;
  let inventory: InventoryItem[] = [];

  try {
    const pSnap = await get(ref(db, `players/${uid}`));
    if (pSnap.exists()) {
      const loaded = pSnap.val() as PlayerProfile;
      profile = {
        ...loaded,
        freeClaimsRemaining: loaded.freeClaimsRemaining ?? Math.max(0, STARTER_FREE_PLOTS - (loaded.ownedCount || 0)),
        isOnline: true,
        lastSeen: now,
      };
    }
    const iSnap = await get(ref(db, `users/${uid}/inventory`));
    if (iSnap.exists()) {
      const raw = iSnap.val();
      inventory = Array.isArray(raw) ? raw : Object.values(raw);
    }
  } catch {
    // Fallback
  }

  if (!profile) {
    profile = {
      uid,
      nickname: user.displayName || 'Фермер',
      coins: STARTING_COINS,
      x: 1.5,
      z: 1.5,
      yaw: 0.4,
      color: pickColorForUid(uid),
      isMoving: false,
      activeSlotItemId: null,
      ownedCount: 0,
      freeClaimsRemaining: STARTER_FREE_PLOTS,
      totalHarvested: 0,
      bestToolTier: 0,
      lastSeen: now,
      isOnline: true,
    };
    await set(ref(db, `players/${uid}`), profile).catch(() => {});
  }

  return {
    profile,
    inventory,
    plots: basePlots,
    mode: 'firebase',
  };
}

export function createDemoSession(nickname = 'Коваль_Фермер'): SessionInitData {
  const now = Date.now();
  const basePlots = createSeededWorldPlots(now);
  const uid = 'demo_local_player';
  const profile: PlayerProfile = {
    uid,
    nickname: nickname.trim() || 'Коваль_Фермер',
    coins: STARTING_COINS,
    x: 1.5,
    z: 1.5,
    yaw: 0.4,
    color: '#e06d44',
    isMoving: false,
    activeSlotItemId: null,
    ownedCount: 0,
    freeClaimsRemaining: STARTER_FREE_PLOTS,
    totalHarvested: 0,
    bestToolTier: 0,
    lastSeen: now,
    isOnline: true,
  };
  return {
    profile,
    inventory: [],
    plots: basePlots,
    mode: 'demo',
  };
}

export function subscribeFirebaseAuth(cb: (user: User | null) => void): () => void {
  const { auth } = getFirebaseServices();
  return onAuthStateChanged(auth, cb);
}

export async function signOutFirebaseFarmer(uid?: string): Promise<void> {
  try {
    const { auth, db } = getFirebaseServices();
    if (uid) {
      await update(ref(db, `players/${uid}`), { isOnline: false, lastSeen: Date.now() }).catch(() => {});
    }
    await signOut(auth);
  } catch {
    // Ignore
  }
}

export class WorldSyncChannel {
  private mode: 'firebase' | 'demo';
  private uid: string;
  private unsubs: Array<() => void> = [];
  private bc: BroadcastChannel | null = null;
  private lastPosSentAt = 0;

  constructor(mode: 'firebase' | 'demo', uid: string) {
    this.mode = mode;
    this.uid = uid;
    if (typeof BroadcastChannel !== 'undefined') {
      this.bc = new BroadcastChannel('kovel_voxel_farm_sync');
    }
  }

  public start(callbacks: {
    onPlayers: (players: Record<string, PlayerProfile>) => void;
    onPlots: (plots: Record<string, LandSquare>) => void;
    onChat: (messages: ChatMessage[]) => void;
  }) {
    if (this.mode === 'firebase') {
      const { db } = getFirebaseServices();
      const playerRef = ref(db, `players/${this.uid}`);
      onDisconnect(playerRef).update({ isOnline: false, lastSeen: Date.now() }).catch(() => {});
      update(playerRef, { isOnline: true, lastSeen: Date.now() }).catch(() => {});

      const unsubPlayers = onValue(
        ref(db, 'players'),
        (snap) => {
          const val = (snap.val() as Record<string, PlayerProfile>) || {};
          const merged = { ...createSeededNpcPlayers(Date.now()), ...val };
          callbacks.onPlayers(merged);
        },
        () => {
          callbacks.onPlayers(createSeededNpcPlayers(Date.now()));
        },
      );

      const unsubPlots = onValue(
        ref(db, 'plots'),
        (snap) => {
          if (snap.exists()) {
            const raw = snap.val() as Record<string, LandSquare>;
            const normalized: Record<string, LandSquare> = {};
            for (const [k, p] of Object.entries(raw)) {
              if (p) normalized[k] = normalizePlot(p);
            }
            callbacks.onPlots(normalized);
          }
        },
        () => {},
      );

      const chatQuery = query(ref(db, 'chat'), limitToLast(50));
      const unsubChat = onValue(
        chatQuery,
        (snap) => {
          const val = (snap.val() as Record<string, ChatMessage>) || {};
          const list = Object.entries(val)
            .map(([id, msg]) => ({ ...msg, id }))
            .sort((a, b) => a.timestamp - b.timestamp);
          callbacks.onChat(list);
        },
        () => {},
      );

      this.unsubs.push(unsubPlayers, unsubPlots, unsubChat);
    } else {
      callbacks.onPlayers(createSeededNpcPlayers(Date.now()));
      if (this.bc) {
        const handler = (ev: MessageEvent) => {
          const data = ev.data;
          if (!data || data.sender === this.uid) return;
          if (data.type === 'plot' && data.plot) {
            callbacks.onPlots({ [data.plot.key]: normalizePlot(data.plot) });
          } else if (data.type === 'chat' && data.msg) {
            callbacks.onChat([data.msg]);
          }
        };
        this.bc.addEventListener('message', handler);
        this.unsubs.push(() => this.bc?.removeEventListener('message', handler));
      }
    }
  }

  public syncPosition(x: number, z: number, yaw: number, isMoving: boolean, force = false) {
    const now = performance.now();
    if (!force && now - this.lastPosSentAt < 120) return;
    this.lastPosSentAt = now;

    if (this.mode === 'firebase') {
      const { db } = getFirebaseServices();
      update(ref(db, `players/${this.uid}`), {
        x: Number(x.toFixed(2)),
        z: Number(z.toFixed(2)),
        yaw: Number(yaw.toFixed(2)),
        isMoving,
        lastSeen: Date.now(),
        isOnline: true,
      }).catch(() => {});
    }
  }

  public syncPlayerProfile(profile: PlayerProfile, inventory: InventoryItem[]) {
    if (this.mode === 'firebase') {
      const { db } = getFirebaseServices();
      set(ref(db, `players/${this.uid}`), { ...profile, isOnline: true, lastSeen: Date.now() }).catch(() => {});
      set(ref(db, `users/${this.uid}/inventory`), inventory).catch(() => {});
    }
  }

  public syncPlot(plot: LandSquare) {
    if (this.mode === 'firebase') {
      const { db } = getFirebaseServices();
      set(ref(db, `plots/${plot.key}`), plot).catch(() => {});
    } else if (this.bc) {
      this.bc.postMessage({ sender: this.uid, type: 'plot', plot });
    }
  }

  public async sendChat(msg: Omit<ChatMessage, 'id'>): Promise<ChatMessage> {
    if (this.mode === 'firebase') {
      const { db } = getFirebaseServices();
      const newRef = push(ref(db, 'chat'));
      const fullMsg: ChatMessage = { ...msg, id: newRef.key || `m_${Date.now()}` };
      await set(newRef, fullMsg).catch(() => {});
      return fullMsg;
    }
    const localMsg: ChatMessage = { ...msg, id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` };
    this.bc?.postMessage({ sender: this.uid, type: 'chat', msg: localMsg });
    return localMsg;
  }

  public stop() {
    this.unsubs.forEach((fn) => fn());
    this.unsubs = [];
    this.bc?.close();
    this.bc = null;
  }
}
