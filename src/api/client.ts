// ============================================================
// REST API client for the LoomiDefense backend.
// Talks to /api/* (proxied by Vite in dev).
// ============================================================
import type {
  AuthResponse,
  PublicUser,
  UserProgress,
  UserSearchResult,
  StoreCatalogItem,
} from '../../shared/protocol';

const TOKEN_KEY = 'loomi_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  let res: Response;
  try {
    res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch {
    // fetch itself failed (server unreachable / offline)
    throw new ApiError(0, 'Cannot reach the game server. Make sure it is running: npm run server');
  }

  // Parse as text first so proxy error pages (HTML/empty) don't throw
  let json: unknown = null;
  try {
    const text = await res.text();
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const apiMessage =
      json && typeof json === 'object' ? (json as { error?: string }).error : undefined;
    if (apiMessage) {
      throw new ApiError(res.status, apiMessage);
    }
    // Vite's dev proxy returns a bare 500/502/503 when the backend is down
    if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
      throw new ApiError(
        res.status,
        'Game server is not running. Start it in another terminal with: npm run server',
      );
    }
    throw new ApiError(res.status, `Request failed (${res.status})`);
  }
  return json as T;
}

export const api = {
  // --- auth ---
  async register(username: string, password: string): Promise<AuthResponse> {
    const data = await request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setToken(data.token);
    return data;
  },

  async login(username: string, password: string): Promise<AuthResponse> {
    const data = await request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setToken(data.token);
    return data;
  },

  async logout(): Promise<void> {
    try {
      await request('/api/auth/logout', { method: 'POST' });
    } finally {
      setToken(null);
    }
  },

  // --- profile ---
  async me(): Promise<PublicUser> {
    const data = await request<{ user: PublicUser }>('/api/me');
    return data.user;
  },

  async updateProfile(updates: {
    displayName?: string;
    settings?: { towerColor?: string };
  }): Promise<PublicUser> {
    const data = await request<{ user: PublicUser }>('/api/me', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return data.user;
  },

  // --- progress ---
  async getProgress(): Promise<UserProgress> {
    const data = await request<{ progress: UserProgress }>('/api/progress');
    return data.progress;
  },

  async saveProgress(progress: Partial<UserProgress>): Promise<UserProgress> {
    const data = await request<{ progress: UserProgress }>('/api/progress', {
      method: 'PUT',
      body: JSON.stringify({ progress }),
    });
    return data.progress;
  },

  async completeLevel(levelId: number, coins: number): Promise<{
    progress: UserProgress;
    firstTime: boolean;
    reward: number;
  }> {
    return request('/api/progress/complete-level', {
      method: 'POST',
      body: JSON.stringify({ levelId, coins }),
    });
  },

  // --- friends / search ---
  async searchUsers(q: string): Promise<UserSearchResult[]> {
    const data = await request<{ users: UserSearchResult[] }>(
      `/api/users/search?q=${encodeURIComponent(q)}`,
    );
    return data.users;
  },

  async getFriends(): Promise<UserSearchResult[]> {
    const data = await request<{ friends: UserSearchResult[] }>('/api/friends');
    return data.friends;
  },

  async addFriend(username: string): Promise<UserSearchResult[]> {
    const data = await request<{ friends: UserSearchResult[] }>('/api/friends', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    return data.friends;
  },

  async removeFriend(username: string): Promise<UserSearchResult[]> {
    const data = await request<{ friends: UserSearchResult[] }>(
      `/api/friends/${encodeURIComponent(username)}`,
      { method: 'DELETE' },
    );
    return data.friends;
  },

  // --- store ---
  async getStore(): Promise<{ catalog: StoreCatalogItem[]; coins: number; ownedTowers: string[] }> {
    return request('/api/store');
  },

  async buyTower(towerType: string): Promise<{
    catalog: StoreCatalogItem[];
    coins: number;
    ownedTowers: string[];
  }> {
    return request('/api/store/buy', {
      method: 'POST',
      body: JSON.stringify({ towerType }),
    });
  },
};
