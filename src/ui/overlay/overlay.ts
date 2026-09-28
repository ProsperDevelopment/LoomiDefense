// ============================================================
// DOM overlay UI: sits above the Phaser canvas.
// Panels: Auth, Profile/Settings, Friends, Store, Loadout, Lobby.
// ============================================================

const STYLE_ID = 'overlay-styles';

const CSS = `
#overlay-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  z-index: 1000;
}
#overlay-root * { box-sizing: border-box; }

.ov-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(10, 10, 30, 0.82);
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ov-panel {
  background: #16213e;
  border: 2px solid #0f3460;
  border-radius: 10px;
  padding: 22px 26px;
  width: 440px;
  max-width: calc(100vw - 40px);
  max-height: calc(100vh - 60px);
  overflow-y: auto;
  color: #eee;
  pointer-events: auto;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5);
}
.ov-panel h2 { margin: 0 0 4px; color: #e94560; font-size: 22px; }
.ov-panel h3 { margin: 16px 0 6px; color: #a0a0a0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
.ov-panel p.hint { margin: 0 0 12px; color: #8888aa; font-size: 12px; }

.ov-field { margin: 10px 0; }
.ov-field label { display: block; font-size: 12px; color: #a0a0a0; margin-bottom: 4px; }
.ov-field input[type=text],
.ov-field input[type=password],
.ov-field select {
  width: 100%;
  padding: 9px 10px;
  background: #0d1b33;
  border: 1px solid #33507a;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  outline: none;
}
.ov-field input:focus { border-color: #e94560; }
.ov-field input[type=color] {
  width: 52px; height: 34px; padding: 2px;
  background: #0d1b33; border: 1px solid #33507a; border-radius: 6px; cursor: pointer;
}

.ov-row { display: flex; gap: 10px; align-items: center; }
.ov-row.between { justify-content: space-between; }

.ov-btn {
  display: inline-block;
  padding: 10px 18px;
  background: #4CAF50;
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.ov-btn:hover { background: #45a049; }
.ov-btn:disabled { background: #445; color: #778; cursor: not-allowed; }
.ov-btn.secondary { background: #33507a; }
.ov-btn.secondary:hover { background: #3d6099; }
.ov-btn.danger { background: #c0392b; }
.ov-btn.danger:hover { background: #a93226; }
.ov-btn.small { padding: 6px 12px; font-size: 12px; }

.ov-error { color: #ff6b6b; font-size: 13px; margin: 8px 0 0; min-height: 16px; }
.ov-ok { color: #6fdc8c; font-size: 13px; margin: 8px 0 0; min-height: 16px; }

.ov-tabs { display: flex; gap: 6px; margin: 12px 0; }
.ov-tab {
  flex: 1; padding: 8px; text-align: center;
  background: #0d1b33; border: 1px solid #33507a; border-radius: 6px;
  color: #8fa8cc; font-size: 13px; cursor: pointer;
}
.ov-tab.active { background: #e94560; border-color: #e94560; color: #fff; }

.ov-list { list-style: none; margin: 8px 0; padding: 0; max-height: 220px; overflow-y: auto; }
.ov-list li {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 10px; margin: 4px 0;
  background: #0d1b33; border: 1px solid #24406a; border-radius: 6px;
  font-size: 13px;
}
.ov-list li .sub { color: #8888aa; font-size: 11px; }

.ov-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0; }
.ov-card {
  background: #0d1b33; border: 2px solid #24406a; border-radius: 8px;
  padding: 12px; cursor: pointer; position: relative; transition: border-color 0.12s;
}
.ov-card:hover { border-color: #33507a; }
.ov-card.selected { border-color: #4CAF50; }
.ov-card.disabled { opacity: 0.45; cursor: not-allowed; }
.ov-card .name { font-weight: 700; font-size: 14px; color: #fff; }
.ov-card .desc { font-size: 11px; color: #8899bb; margin-top: 4px; min-height: 28px; }
.ov-card .price { font-size: 12px; color: #FFD700; margin-top: 6px; }
.ov-card .owned { font-size: 11px; color: #6fdc8c; margin-top: 6px; }

.ov-chat {
  background: #0d1b33; border: 1px solid #33507a; border-radius: 6px;
  height: 140px; overflow-y: auto; padding: 8px; font-size: 12px; margin: 8px 0;
}
.ov-chat div { margin-bottom: 4px; }
.ov-chat .who { color: #e94560; font-weight: 700; }

.ov-status { font-size: 12px; color: #8fa8cc; margin-top: 6px; }
.ov-badge {
  display: inline-block; background: #FFD700; color: #1a1a2e;
  font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 10px;
}

/* Top HUD bar */
#ov-topbar {
  position: absolute; top: 0; left: 0; right: 0;
  display: flex; gap: 8px; align-items: center;
  padding: 6px 12px; pointer-events: auto;
  background: linear-gradient(to bottom, rgba(10,12,30,0.92), rgba(10,12,30,0.55));
}
#ov-topbar .spacer { flex: 1; }
#ov-topbar .pill {
  background: #0d1b33; border: 1px solid #33507a; border-radius: 14px;
  padding: 4px 12px; font-size: 12px; color: #cfe0ff; cursor: default;
}
#ov-topbar .pill.gold { color: #FFD700; border-color: #6a5a20; }
#ov-topbar button {
  background: #1d3355; border: 1px solid #33507a; border-radius: 14px;
  padding: 4px 12px; font-size: 12px; color: #cfe0ff; cursor: pointer;
}
#ov-topbar button:hover { background: #27446f; }

@media (max-width: 560px) {
  .ov-panel { padding: 16px; width: 100%; }
  .ov-cards { grid-template-columns: 1fr; }
}
`;

export function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

export function getRoot(): HTMLElement {
  let root = document.getElementById('overlay-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'overlay-root';
    document.body.appendChild(root);
  }
  return root;
}

export interface PanelHandle {
  close(): void;
}

/** Show a modal panel. Returns a handle to close it. Only one modal at a time. */
export function showPanel(
  build: (body: HTMLElement, close: () => void) => void,
): PanelHandle {
  ensureStyles();
  const root = getRoot();
  closeModal(root);

  const backdrop = document.createElement('div');
  backdrop.className = 'ov-backdrop';
  backdrop.dataset.modal = '1';

  const panel = document.createElement('div');
  panel.className = 'ov-panel';

  const close = () => backdrop.remove();
  build(panel, close);

  backdrop.appendChild(panel);
  backdrop.addEventListener('pointerdown', (e) => {
    if (e.target === backdrop) close();
  });
  root.appendChild(backdrop);
  return { close };
}

export function closeModal(root: HTMLElement = getRoot()): void {
  root.querySelectorAll('.ov-backdrop').forEach((el) => el.remove());
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  ...children: Array<string | Node>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) {
    node.append(child);
  }
  return node;
}

export function field(labelText: string, input: HTMLElement): HTMLElement {
  const wrap = el('div', 'ov-field');
  const label = el('label', undefined, labelText);
  wrap.append(label, input);
  return wrap;
}

export function textInput(type: 'text' | 'password', placeholder = ''): HTMLInputElement {
  const input = document.createElement('input');
  input.type = type;
  input.placeholder = placeholder;
  return input;
}

export function button(
  label: string,
  onClick: () => void,
  variant: 'primary' | 'secondary' | 'danger' | '' = 'primary',
): HTMLButtonElement {
  const btn = el('button', `ov-btn ${variant}`.trim(), label);
  btn.addEventListener('click', onClick);
  return btn;
}
