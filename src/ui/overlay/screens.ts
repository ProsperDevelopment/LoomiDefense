// ============================================================
// Overlay screens: auth, profile/settings, friends, store, loadout.
// ============================================================
import {
  showPanel, el, field, textInput, button, getRoot, ensureStyles,
} from './overlay';
import { userProfile, onProfile } from '../../state/UserProfile';
import { showLobbyPanel } from './lobbyScreen';
import { ApiError } from '../../api/client';
import { TOWER_DEFINITIONS } from '../../data/towers';
import { isSfxMuted, setSfxMuted } from '../../audio/GameAudio';
import type { UserSearchResult, StoreCatalogItem } from '../../../shared/protocol';

// ------------------------------------------------------------
// Auth (login / register)
// ------------------------------------------------------------
export function showAuthPanel(): void {
  showPanel((body, close) => {
    body.append(el('h2', undefined, 'Welcome'));
    body.append(el('p', 'hint', 'Log in to sync progress, buy towers, and play multiplayer. Or continue as guest.'));

    let mode: 'login' | 'register' = 'login';

    const tabs = el('div', 'ov-tabs');
    const tabLogin = el('div', 'ov-tab active', 'Log In');
    const tabReg = el('div', 'ov-tab', 'Register');
    tabs.append(tabLogin, tabReg);

    const userInput = textInput('text', 'username');
    const passInput = textInput('password', 'password');
    const error = el('div', 'ov-error');

    const setMode = (m: 'login' | 'register') => {
      mode = m;
      tabLogin.classList.toggle('active', m === 'login');
      tabReg.classList.toggle('active', m === 'register');
      submit.textContent = m === 'login' ? 'Log In' : 'Create Account';
      error.textContent = '';
    };
    tabLogin.addEventListener('click', () => setMode('login'));
    tabReg.addEventListener('click', () => setMode('register'));

    const submit = button('Log In', async () => {
      error.textContent = '';
      submit.setAttribute('disabled', 'true');
      try {
        if (mode === 'login') {
          await userProfile.login(userInput.value.trim(), passInput.value);
        } else {
          await userProfile.register(userInput.value.trim(), passInput.value);
        }
        close();
        refreshTopbar();
      } catch (e) {
        error.textContent = e instanceof ApiError ? e.message : 'Connection failed — is the server running?';
      } finally {
        submit.removeAttribute('disabled');
      }
    });

    const guest = button('Continue as Guest', () => close(), 'secondary');

    body.append(
      tabs,
      field('Username', userInput),
      field('Password', passInput),
      error,
      el('div', 'ov-row',
        button('Cancel', close, 'secondary'),
        guest,
        submit,
      ),
    );
    userInput.focus();
  });
}

// ------------------------------------------------------------
// Profile / settings (display name + tower color)
// ------------------------------------------------------------
export function showProfilePanel(): void {
  showPanel((body, close) => {
    body.append(el('h2', undefined, 'Profile & Settings'));

    if (!userProfile.isLoggedIn) {
      body.append(el('p', 'hint', 'You are playing as a guest. Log in to sync your profile across devices.'));
    }

    const nameInput = textInput('text', 'Display name');
    nameInput.value = userProfile.displayName;

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = userProfile.towerColor;

    const colorRow = el('div', 'ov-row between');
    const colorLabel = el('span', undefined, 'Your tower color');
    colorLabel.style.fontSize = '13px';
    colorLabel.style.color = '#a0a0a0';
    colorRow.append(colorLabel, colorInput);

    // Live preview swatch
    const preview = el('div');
    preview.style.cssText = `width:28px;height:28px;border-radius:6px;border:2px solid ${userProfile.towerColor};background:${userProfile.towerColor}`;
    colorInput.addEventListener('input', () => {
      preview.style.background = colorInput.value;
      preview.style.borderColor = colorInput.value;
    });
    colorRow.appendChild(preview);

    const status = el('div', 'ov-status');
    const error = el('div', 'ov-error');

    const save = button('Save Settings', async () => {
      error.textContent = '';
      status.textContent = '';
      save.setAttribute('disabled', 'true');
      try {
        const name = nameInput.value.trim();
        if (name && name !== userProfile.displayName) {
          await userProfile.setDisplayName(name);
        }
        if (colorInput.value !== userProfile.towerColor) {
          await userProfile.setTowerColor(colorInput.value);
        }
        status.textContent = 'Saved!';
        refreshTopbar();
      } catch (e) {
        error.textContent = e instanceof ApiError ? e.message : 'Failed to save';
      } finally {
        save.removeAttribute('disabled');
      }
    });

    const rows: HTMLElement[] = [field('Display name', nameInput), colorRow, status, error];

    if (userProfile.isLoggedIn) {
      const logout = button('Log Out', async () => {
        await userProfile.logout();
        close();
        refreshTopbar();
      }, 'danger');
      rows.push(el('div', 'ov-row', logout));
    }

    rows.push(
      el('div', 'ov-row',
        button('Close', close, 'secondary'),
        save,
      ),
    );
    body.append(...rows);
  });
}

// ------------------------------------------------------------
// Friends: search, add, remove, list
// ------------------------------------------------------------
export function showFriendsPanel(): void {
  showPanel((body, close) => {
    body.append(el('h2', undefined, 'Friends'));
    body.append(el('p', 'hint', 'Find players by username and add them to your friend list.'));

    if (!userProfile.isLoggedIn) {
      body.append(el('p', 'hint', 'Log in to use friends.'));
      body.append(el('div', 'ov-row', button('Close', close, 'secondary')));
      return;
    }

    const searchInput = textInput('text', 'Search username…');
    const searchBtn = button('Search', () => void runSearch(), 'secondary');
    const searchRow = el('div', 'ov-row');
    searchInput.style.flex = '1';
    searchRow.append(searchInput, searchBtn);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void runSearch();
    });

    const results = el('ul', 'ov-list');
    const friendList = el('ul', 'ov-list');
    const status = el('div', 'ov-status');
    const error = el('div', 'ov-error');

    function renderFriends(friends: UserSearchResult[]): void {
      friendList.innerHTML = '';
      if (friends.length === 0) {
        const li = el('li');
        li.append(el('span', 'sub', 'No friends yet'));
        friendList.append(li);
        return;
      }
      for (const f of friends) {
        const li = el('li');
        const info = el('div');
        info.append(el('div', undefined, f.displayName));
        info.append(el('div', 'sub', `@${f.username}`));
        const rm = button('Remove', () => {
          void userProfile.removeFriend(f.username).then(renderFriends).catch((e) => {
            error.textContent = e instanceof ApiError ? e.message : 'Failed';
          });
        }, 'danger');
        rm.classList.add('small');
        li.append(info, rm);
        friendList.append(li);
      }
    }

    async function runSearch(): Promise<void> {
      error.textContent = '';
      const q = searchInput.value.trim();
      results.innerHTML = '';
      if (!q) return;
      try {
        const users = await userProfile.searchUsers(q);
        const myFriends = (await userProfile.getFriends()).map((f) => f.username);
        if (users.length === 0) {
          const li = el('li');
          li.append(el('span', 'sub', 'No users found'));
          results.append(li);
          return;
        }
        for (const u of users) {
          const li = el('li');
          const info = el('div');
          info.append(el('div', undefined, u.displayName));
          info.append(el('div', 'sub', `@${u.username}`));
          if (myFriends.includes(u.username)) {
            const badge = el('span', 'sub', 'Friend ✓');
            badge.style.color = '#6fdc8c';
            li.append(info, badge);
          } else {
            const add = button('Add', () => {
              void userProfile.addFriend(u.username).then((friends) => {
                renderFriends(friends);
                status.textContent = `Added ${u.displayName}`;
              }).catch((e) => {
                error.textContent = e instanceof ApiError ? e.message : 'Failed';
              });
            });
            add.classList.add('small');
            li.append(info, add);
          }
          results.append(li);
        }
      } catch (e) {
        error.textContent = e instanceof ApiError ? e.message : 'Search failed';
      }
    }

    body.append(
      el('h3', undefined, 'Search players'),
      searchRow,
      results,
      el('h3', undefined, 'Your friends'),
      friendList,
      status,
      error,
      el('div', 'ov-row', button('Close', close, 'secondary')),
    );

    void userProfile.getFriends().then(renderFriends).catch(() => undefined);
    searchInput.focus();
  });
}

// ------------------------------------------------------------
// Store: buy towers with coins
// ------------------------------------------------------------
export function showStorePanel(): void {
  showPanel((body, close) => {
    body.append(el('h2', undefined, 'Tower Store'));
    body.append(el('p', 'hint', 'Earn coins by completing levels. Unlock new towers here.'));

    const coinsRow = el('div', 'ov-row between');
    const coinsLabel = el('span', 'ov-badge', `${userProfile.coins} coins`);
    coinsRow.append(coinsLabel);
    body.append(coinsRow);

    const cards = el('div', 'ov-cards');
    const status = el('div', 'ov-status');
    const error = el('div', 'ov-error');

    const catalog: (StoreCatalogItem & { owned: boolean })[] = [
      { towerType: 'sniper', price: 150, name: 'Sniper Tower', description: 'Huge range, massive single-target damage', owned: userProfile.ownedTowers.includes('sniper') },
      { towerType: 'mortar', price: 250, name: 'Mortar Tower', description: 'Long range artillery with big splash', owned: userProfile.ownedTowers.includes('mortar') },
      { towerType: 'tesla', price: 400, name: 'Tesla Tower', description: 'Rapid fire chain lightning', owned: userProfile.ownedTowers.includes('tesla') },
      { towerType: 'grenade', price: 300, name: 'Grenade Tower', description: 'Lobs grenades that burst into shrapnel', owned: userProfile.ownedTowers.includes('grenade') },
    ];

    function render(): void {
      coinsLabel.textContent = `${userProfile.coins} coins`;
      cards.innerHTML = '';
      for (const item of catalog) {
        item.owned = userProfile.ownedTowers.includes(item.towerType);
        const card = el('div', `ov-card${item.owned ? ' disabled' : ''}`);
        card.append(el('div', 'name', item.name));
        card.append(el('div', 'desc', item.description));
        if (item.owned) {
          card.append(el('div', 'owned', 'Owned ✓'));
        } else {
          const canAfford = userProfile.coins >= item.price;
          card.append(el('div', 'price', `${item.price} coins`));
          const buy = button(canAfford ? 'Buy' : 'Not enough', () => {
            void buyItem(item);
          });
          buy.classList.add('small');
          if (!canAfford) buy.setAttribute('disabled', 'true');
          card.append(buy);
        }
        cards.append(card);
      }
    }

    async function buyItem(item: StoreCatalogItem & { owned: boolean }): Promise<void> {
      error.textContent = '';
      try {
        const ok = await userProfile.buyTower(item.towerType, item.price);
        if (ok) {
          status.textContent = `Purchased ${item.name}!`;
          render();
          refreshTopbar();
        } else {
          error.textContent = 'Purchase failed';
        }
      } catch (e) {
        error.textContent = e instanceof ApiError ? e.message : 'Purchase failed';
      }
    }

    body.append(cards, status, error);
    body.append(el('div', 'ov-row', button('Close', close, 'secondary')));
    render();
  });
}

// ------------------------------------------------------------
// Loadout: pick exactly 3 owned towers
// ------------------------------------------------------------
export function showLoadoutPanel(): void {
  showPanel((body, close) => {
    body.append(el('h2', undefined, 'Loadout'));
    body.append(el('p', 'hint', 'Choose exactly 3 towers to bring into battle.'));

    const owned = userProfile.ownedTowers;
    let selected: string[] = [...userProfile.loadout];

    const cards = el('div', 'ov-cards');
    const status = el('div', 'ov-status');
    const error = el('div', 'ov-error');
    const saveBtn = button('Save Loadout', async () => {
      error.textContent = '';
      if (selected.length !== 3) {
        error.textContent = 'Select exactly 3 towers';
        return;
      }
      saveBtn.setAttribute('disabled', 'true');
      try {
        const ok = await userProfile.setLoadout(selected);
        if (ok) {
          status.textContent = 'Loadout saved!';
          refreshTopbar();
        } else {
          error.textContent = 'Could not save loadout';
        }
      } catch (e) {
        error.textContent = e instanceof ApiError ? e.message : 'Failed to save';
      } finally {
        saveBtn.removeAttribute('disabled');
      }
    });

    function render(): void {
      cards.innerHTML = '';
      for (const type of owned) {
        const def = TOWER_DEFINITIONS[type];
        if (!def) continue;
        const isSelected = selected.includes(type);
        const card = el('div', `ov-card${isSelected ? ' selected' : ''}`);
        card.append(el('div', 'name', def.name));
        card.append(el('div', 'desc', def.description));
        card.append(el('div', 'price', `${def.cost}g · DMG ${def.damage} · RNG ${def.range}`));
        card.addEventListener('click', () => {
          if (isSelected) {
            selected = selected.filter((t) => t !== type);
          } else if (selected.length < 3) {
            selected = [...selected, type];
          } else {
            error.textContent = 'Deselect a tower first (max 3)';
            return;
          }
          error.textContent = '';
          render();
        });
        cards.append(card);
      }
      status.textContent = `${selected.length}/3 selected`;
    }

    body.append(cards, status, error);
    body.append(el('div', 'ov-row',
      button('Cancel', close, 'secondary'),
      saveBtn,
    ));
    render();
  });
}

// ------------------------------------------------------------
// Top bar (always visible): user, coins, quick buttons
// ------------------------------------------------------------
let topbarBuilt = false;

export function buildTopbar(): void {
  if (topbarBuilt) return;
  topbarBuilt = true;
  ensureStyles();
  const root = getRoot();

  const bar = el('div');
  bar.id = 'ov-topbar';

  const who = el('span', 'pill');
  const coins = el('span', 'pill gold');
  const spacer = el('div', 'spacer');

  const profileBtn = button0('Profile', () => showProfilePanel());
  const friendsBtn = button0('Friends', () => showFriendsPanel());
  const storeBtn = button0('Store', () => showStorePanel());
  const loadoutBtn = button0('Loadout', () => showLoadoutPanel());
  const lobbyBtn = button0('Multiplayer', () => showLobbyPanel());
  const authBtn = button0('Log In', () => showAuthPanel());
  const soundBtn = button0(isSfxMuted() ? 'Sound: Off' : 'Sound: On', () => {
    setSfxMuted(!isSfxMuted());
    soundBtn.textContent = isSfxMuted() ? 'Sound: Off' : 'Sound: On';
  });

  bar.append(who, coins, spacer, loadoutBtn, storeBtn, friendsBtn, lobbyBtn, profileBtn, soundBtn, authBtn);
  root.appendChild(bar);

  const refresh = () => refreshTopbar();
  onProfile('profile-changed', refresh);
  onProfile('coins-changed', refresh);
  refreshTopbar();
}

function button0(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

export function refreshTopbar(): void {
  const bar = document.getElementById('ov-topbar');
  if (!bar) return;
  const pills = bar.querySelectorAll('.pill');
  const who = pills[0] as HTMLElement | undefined;
  const coins = pills[1] as HTMLElement | undefined;
  const buttons = bar.querySelectorAll('button');
  if (who) {
    who.textContent = userProfile.isLoggedIn ? userProfile.displayName : 'Guest';
  }
  if (coins) coins.textContent = `🪙 ${userProfile.coins}`;
  // Last button = Log In (hidden when logged in; Profile screen has Log Out)
  const authBtn = buttons[buttons.length - 1] as HTMLButtonElement | undefined;
  if (authBtn) {
    authBtn.style.display = userProfile.isLoggedIn ? 'none' : '';
  }
}

/** Show/hide the top bar (hidden while a game is running). */
export function setTopbarVisible(visible: boolean): void {
  const bar = document.getElementById('ov-topbar');
  if (bar) bar.style.display = visible ? '' : 'none';
}
