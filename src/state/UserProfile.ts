// ============================================================
// Client-side session/profile state.
// Logged in: backed by the server API.
// Guest: falls back to localStorage so the game still works offline.
// ============================================================
import { api, getToken, ApiError } from '../api/client';
import type { PublicUser, UserProgress, UserSearchResult } from '../../shared/protocol';
import { defaultProgress, DEFAULT_SETTINGS } from '../../shared/protocol';
import { DEV_MODE, DEV_COINS } from '../config/constants';

const LOCAL_KEY = 'loomi_guest_profile';

export type SessionMode = 'guest' | 'user';

interface GuestProfile {
  displayName: string;
  settings: { towerColor: string };
  progress: UserProgress;
}

export type ProfileEvent = 'profile-changed' | 'coins-changed' | 'login' | 'logout';

// Dedicated emitter: the game's eventBus is cleared on every GameScene start,
// which must not wipe profile listeners.
type ProfileHandler = () => void;
const listeners = new Map<ProfileEvent, Set<ProfileHandler>>();

export function onProfile(event: ProfileEvent, handler: ProfileHandler): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(handler);
  return () => listeners.get(event)?.delete(handler);
}

function emitProfile(event: ProfileEvent): void {
  listeners.get(event)?.forEach((h) => h());
}

function loadGuestProfile(): GuestProfile {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw) as GuestProfile;
  } catch {
    // fall through to defaults
  }
  return {
    displayName: 'Guest',
    settings: { ...DEFAULT_SETTINGS },
    progress: defaultProgress(),
  };
}

class UserProfile {
  mode: SessionMode = 'guest';
  user: PublicUser | null = null;
  guest: GuestProfile = loadGuestProfile();
  private initialized = false;

  /** Restore session from stored token, if any. Safe to call multiple times. */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    if (!getToken()) return;
    try {
      this.user = await api.me();
      this.mode = 'user';
      this.syncLocalProgress();
      emitProfile('profile-changed');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        // Stale token
        api.logout().catch(() => undefined);
      }
      // On network errors keep the token; user may be offline
    }
  }

  /** Mirror server progress into localStorage for the level-select screen. */
  private syncLocalProgress(): void {
    if (!this.isLoggedIn) return;
    try {
      localStorage.setItem(
        'towerDefense_progress',
        JSON.stringify({
          unlocked: this.user!.progress.unlocked,
          completed: this.user!.progress.completed,
        }),
      );
    } catch {
      // storage unavailable; non-fatal
    }
  }

  get isLoggedIn(): boolean {
    return this.mode === 'user' && this.user !== null;
  }

  get displayName(): string {
    return this.isLoggedIn ? this.user!.displayName : this.guest.displayName;
  }

  get towerColor(): string {
    return this.isLoggedIn ? this.user!.settings.towerColor : this.guest.settings.towerColor;
  }

  get coins(): number {
    if (this.isLoggedIn) return this.user!.progress.coins;
    // Dev mode: guests run on constant pocket money; logged-in balances
    // are real (the server seeds DEV_COINS at register/login), so
    // purchases visibly spend the dev coins down
    if (DEV_MODE) return DEV_COINS;
    return this.guest.progress.coins;
  }

  get ownedTowers(): string[] {
    return this.isLoggedIn ? this.user!.progress.ownedTowers : this.guest.progress.ownedTowers;
  }

  get loadout(): string[] {
    return this.isLoggedIn ? this.user!.progress.loadout : this.guest.progress.loadout;
  }

  get progress(): UserProgress {
    return this.isLoggedIn ? this.user!.progress : this.guest.progress;
  }

  // --- auth ---

  async register(username: string, password: string): Promise<void> {
    // Keep whatever the guest already picked (tower color) so it
    // applies to the new account instead of resetting to the default
    const carried = { ...this.guest.settings };
    const data = await api.register(username, password);
    this.user = data.user;
    if (carried.towerColor !== data.user.settings.towerColor) {
      try {
        this.user = await api.updateProfile({ settings: carried });
      } catch {
        // settings sync failed — account defaults stay for now
      }
    }
    this.mode = 'user';
    this.saveGuest(); // keep guest data around is unnecessary; clear it
    localStorage.removeItem(LOCAL_KEY);
    emitProfile('login');
    emitProfile('profile-changed');
    emitProfile('coins-changed');
  }

  async login(username: string, password: string): Promise<void> {
    const data = await api.login(username, password);
    this.user = data.user;
    this.mode = 'user';
    localStorage.removeItem(LOCAL_KEY);
    this.syncLocalProgress();
    emitProfile('login');
    emitProfile('profile-changed');
  }

  async logout(): Promise<void> {
    if (this.isLoggedIn) {
      await api.logout().catch(() => undefined);
    }
    this.user = null;
    this.mode = 'guest';
    this.guest = loadGuestProfile();
    emitProfile('logout');
    emitProfile('profile-changed');
  }

  // --- settings ---

  async setTowerColor(color: string): Promise<void> {
    if (this.isLoggedIn) {
      this.user = await api.updateProfile({ settings: { towerColor: color } });
    } else {
      this.guest.settings.towerColor = color;
      this.saveGuest();
    }
    emitProfile('profile-changed');
  }

  async setDisplayName(name: string): Promise<void> {
    if (this.isLoggedIn) {
      this.user = await api.updateProfile({ displayName: name });
    } else {
      this.guest.displayName = name.trim() || 'Guest';
      this.saveGuest();
    }
    emitProfile('profile-changed');
  }

  // --- coins / store ---

  async addCoins(amount: number): Promise<number> {
    if (amount <= 0) return this.coins;
    if (this.isLoggedIn) {
      const next = { ...this.user!.progress, coins: this.user!.progress.coins + amount };
      this.user = { ...this.user!, progress: await api.saveProgress(next) };
    } else {
      this.guest.progress.coins += amount;
      this.saveGuest();
    }
    emitProfile('coins-changed');
    return this.coins;
  }

  /** Persist local progress; for logged-in users this pushes to the server. */
  async saveProgress(patch: Partial<UserProgress>): Promise<void> {
    if (this.isLoggedIn) {
      const merged = { ...this.user!.progress, ...patch };
      this.user = { ...this.user!, progress: await api.saveProgress(merged) };
    } else {
      this.guest.progress = { ...this.guest.progress, ...patch };
      this.saveGuest();
    }
    emitProfile('profile-changed');
  }

  /** Mark a level complete; awards coins server-side when logged in. */
  async completeLevel(levelId: number, localReward: number): Promise<number> {
    if (this.isLoggedIn) {
      try {
        const res = await api.completeLevel(levelId, localReward);
        this.user = { ...this.user!, progress: res.progress };
        this.syncLocalProgress();
        emitProfile('coins-changed');
        emitProfile('profile-changed');
        return res.reward;
      } catch (e) {
        // Offline fallback: add locally
        if (e instanceof ApiError && e.status >= 500) {
          return this.addCoins(localReward);
        }
        throw e;
      }
    }

    // Guest: mirror the same "first completion only" rule locally
    if (!this.guest.progress.completed.includes(levelId)) {
      this.guest.progress.completed.push(levelId);
      for (const n of [levelId - 1, levelId + 1, 3, 4, 5]) {
        if (n >= 1 && n <= 25 && !this.guest.progress.unlocked.includes(n)) {
          this.guest.progress.unlocked.push(n);
        }
      }
      this.guest.progress.coins += localReward;
      this.saveGuest();
      emitProfile('coins-changed');
      emitProfile('profile-changed');
      return localReward;
    }
    return 0;
  }

  async buyTower(towerType: string, price: number): Promise<boolean> {
    if (this.ownedTowers.includes(towerType)) return false;
    if (this.coins < price) return false;
    if (this.isLoggedIn) {
      const res = await api.buyTower(towerType);
      this.user = { ...this.user!, progress: { ...this.user!.progress, coins: res.coins, ownedTowers: res.ownedTowers } };
    } else {
      this.guest.progress.coins -= price;
      this.guest.progress.ownedTowers.push(towerType);
      this.saveGuest();
    }
    emitProfile('coins-changed');
    emitProfile('profile-changed');
    return true;
  }

  async setLoadout(types: string[]): Promise<boolean> {
    if (types.length < 3 || types.length > 4) return false;
    const owned = this.ownedTowers;
    if (!types.every((t) => owned.includes(t))) return false;
    await this.saveProgress({ loadout: [...new Set(types)] });
    return true;
  }

  // --- friends ---

  async searchUsers(q: string): Promise<UserSearchResult[]> {
    if (!this.isLoggedIn) return [];
    return api.searchUsers(q);
  }

  async getFriends(): Promise<UserSearchResult[]> {
    if (!this.isLoggedIn) return [];
    return api.getFriends();
  }

  async addFriend(username: string): Promise<UserSearchResult[]> {
    if (!this.isLoggedIn) throw new Error('Log in to add friends');
    return api.addFriend(username);
  }

  async removeFriend(username: string): Promise<UserSearchResult[]> {
    if (!this.isLoggedIn) throw new Error('Log in to manage friends');
    return api.removeFriend(username);
  }

  private saveGuest(): void {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(this.guest));
  }
}

export const userProfile = new UserProfile();
