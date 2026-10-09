# LoomiDefense

A browser-based multiplayer tower defense game built with Phaser 4, TypeScript, and WebSockets. Defend your base against waves of enemies by strategically placing, upgrading, and selling towers across 25 campaign levels — or team up with friends in real-time multiplayer.

**Play it live:** [loomi.prosper.se](https://loomi.prosper.se)

## Features

- **10 unique tower types** — Arrow, Cannon, Frost, Sniper, Mortar, Tesla, Grenade, Farm, Beacon, and Ninja, each with 5 upgrade levels and distinct mechanics
- **14 enemy types** — from basic Slimes to invisible Phantoms, flying Bats, and massive Dragon bosses
- **25 campaign levels** with custom maps, paths, and wave configurations
- **3 difficulty tiers** — Easy (20 lives), Medium (5 lives), Hard (1 life)
- **Multiplayer** — Host or join rooms (up to 4 players) with real-time WebSocket netplay, per-player economies, and in-game chat
- **User accounts** — Registration, progress persistence, tower store, loadout customization, and friends system
- **Level editor** — Standalone tool for creating custom levels with tile painting, path drawing, wave editing, and server upload
- **Background music** via the companion LoomiMusicMixServer

## Tech Stack

| Layer | Technology |
|---|---|
| Game engine | Phaser 4.2.1 |
| Language | TypeScript 5.6+ |
| Bundler | Vite 6 |
| Server | Express 5 + ws (WebSocket) |
| Runtime | Node.js 22 |
| Testing | Vitest 3, Playwright 1.63 |
| Deployment | Docker, Nginx, GitHub Actions |

## Getting Started

### Prerequisites

- Node.js 22+
- npm

### Installation

```bash
git clone https://github.com/ProsperDevelopment/LoomiDefense.git
cd LoomiDefense
npm install
```

### Development

Start the full stack (game server + Vite dev server):

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

Other commands:

```bash
npm run dev:client   # Vite only (backend must be running separately)
npm run server       # Backend only (port 4000)
npm run kill-dev     # Kill all dev processes
```

### Production Build

```bash
npm run build        # Output to dist/
npm run preview      # Preview the build locally
```

### Testing

```bash
npm test             # Watch mode
npm run test:run     # Single run
```

## Project Structure

```
LoomiDefense/
├── src/                  # Client game source
│   ├── main.ts           # Phaser bootstrap + lobby wiring
│   ├── scenes/           # Boot, Menu, LevelSelect, Game, GameOver
│   ├── entities/         # Tower, Enemy, Projectile + type-specific logic
│   ├── systems/          # WaveManager, Economy, Health, Targeting, etc.
│   ├── ui/               # HUD, TowerPanel, DOM overlays (auth, store, lobby)
│   ├── data/             # Tower/enemy/map/wave definitions + JSON levels
│   ├── utils/            # Grid, A* pathfinding, EventBus, ObjectPool
│   ├── components/       # ECS-style components (Damage, Health, Position)
│   └── config/           # Game constants
├── server/               # Express API + WebSocket multiplayer
│   ├── index.ts          # Server entry (port 4000)
│   ├── api.ts            # REST routes (auth, progress, store, friends, levels)
│   ├── lobby.ts          # WebSocket lobby + in-game relay
│   ├── auth.ts           # Password hashing (scrypt) + sessions
│   └── db.ts             # JSON file-backed data store
├── shared/               # Types shared between client and server
├── editor/               # Standalone level editor (vanilla HTML/JS)
├── public/assets/        # Sprites, audio, tilesets
├── tests/                # Unit and integration tests
├── docker-compose.yml    # Production multi-container setup
└── scripts/              # Dev launcher, process management
```

## Gameplay

### Towers

Each tower has unique attack patterns and 5 upgrade levels:

| Tower | Role | Special |
|---|---|---|
| Arrow | Basic ranged | Fast fire rate, hits flying enemies |
| Cannon | Splash damage | Area-of-effect explosions |
| Frost | Crowd control | Slows enemies |
| Sniper | Single target | High damage, can hit invisible Phantoms (upgraded) |
| Mortar | Area denial | Lobbed projectiles with splash |
| Tesla | Chain attack | Lightning jumps between enemies |
| Grenade | Burst damage | Explosive shrapnel on impact |
| Farm | Economy | Generates gold each wave |
| Beacon | Support | Aura that boosts nearby tower fire rate |
| Ninja | Hybrid | Summons melee units that walk the path in reverse |

### Targeting Modes

Towers can be set to target: **First**, **Closest**, **Strongest**, **Last**, or **Random** enemy in range.

### Economy

- Earn gold from kills, wave completion bonuses, and Farm income
- Sell towers for 60% of total invested value
- In multiplayer, each player has their own gold pool

## Multiplayer

- **Lobby system** — Create or join rooms with 5-character codes (up to 4 players)
- **Host-authoritative** — Host runs the simulation, broadcasts snapshots to guests at 10Hz
- **Per-player loadouts** — Each player selects their own tower set before joining
- **In-game chat** — Communicate with teammates during lobby and gameplay

## Level Editor

A standalone tool located in `editor/` for creating custom levels:

- Paint background tiles across 5 tilesets (Nature, Field, Desert, Floor, Water)
- Draw and erase enemy paths with click-to-add and drag-to-paint
- Place spawn and base points
- Define tower placement restrictions (areas, walls, roofs)
- Edit difficulty, waves, and level metadata
- Import/export as JSON, export as PNG
- Save directly to the game server for online play

See [`editor/README.md`](editor/README.md) for full documentation.

## Docker Deployment

```bash
docker-compose up -d --build
```

This starts four services:

| Service | Port | Description |
|---|---|---|
| game-server | 4000 | Express API + WebSocket lobby |
| web | 80 | Nginx reverse proxy + static files |
| music | 4001 | Background music streaming |
| editor | 8084 | Level editor static site |

## Credits

- **Game engine:** [Phaser 4](https://phaser.io)
- **Art:** [Ninja Adventure Asset Pack](https://kenney.nl) by Kenney (CC0)
- **Sound effects:** Kenney and SoundBible
- **Music:** LoomiMusicMixServer

## License

See individual asset licenses in their respective directories.
