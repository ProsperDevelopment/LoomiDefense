# Tower Defense Level Editor

A standalone level editor for creating and editing tower defense maps.

## Features

- **Paint/erase background tiles** from multiple tilesets (Nature, Field, Desert, Floor, Water)
- **Paint areas**: tree, wall (no building) and roof (sniper-only building)
- **Foreground markers**: mark background tiles to render above gameplay (depth 20)
- **Difficulty**: easy / medium / hard — decides starting lives
- **Draw and erase paths** for enemy movement
- **Place spawn points** and **base locations**
- **Level colors** (grass/road) used by the game background
- **Import/Export** levels as JSON
- **Export** as PNG image
- **Zoom** and **grid** controls
- **Keyboard shortcuts** (1-9 for tools)

## How to Use

### Starting the Editor

```bash
# From the project root
npx serve editor
# Or simply open editor/index.html in a browser
```

### Tools

| Tool | Shortcut | Description |
|------|----------|-------------|
| Draw Path | 1 | Click cells to add enemy path points |
| Erase Path | 2 | Click (or drag) a cell to remove its path points |
| Place Spawn | 3 | Set enemy spawn location |
| Place Base | 4 | Set base/exit location |
| Paint Background | 5 | Paint background tiles (half-cell grid) |
| Erase Background | 6 | Remove background tiles |
| Paint Area | 7 | Paint the selected area type (tree / wall / roof / erase) at half-cell resolution |
| Paint Foreground | 8 | Mark background tiles to render above gameplay |
| Delete Foreground | 9 | Remove foreground markers (half-cell grid) |

### Areas

Areas are painted at **background-tile resolution** (half-cell grid, the
same resolution as the background tiles) with the **Area Type** dropdown:

| Area | Game rule |
|------|-----------|
| Tree | No towers may be built on it |
| Wall | No towers may be built on it |
| Roof | Only the **Sniper** may be built on it — and snipers can't be built anywhere else |

**Towers are placed on the background grid** — they can be offset by
half a cell, as long as they don't collide with walls, trees, other
towers, or (for non-snipers) roofs. Legacy grid-resolution area layers
are upgraded to half-cell resolution automatically on import.

### Foreground Layer

An invisible layer at **background-tile resolution** (half-cell grid, same as
the background tiles):

- **Paint Foreground (8)** marks a background tile as foreground; **Delete
  Foreground (9)** removes the mark (click or drag for both)
- In the game, marked tiles render at **depth 20** (above gameplay objects
  like enemies and towers); all other background tiles render at **depth 10**
- Markers are **only visible in the editor while a foreground tool is active**

Area markings are **only visible in the editor while the Paint Area tool is active**
and are **invisible in the game** — paint them where the background art already
shows trees/walls/roofs.

### Difficulty

The **Difficulty** dropdown sets the level's starting lives:

| Difficulty | Starting lives |
|------------|----------------|
| Easy | 20 |
| Medium | 5 |
| Hard | 1 |

Levels without a difficulty default to easy.

### Waves

**Edit Waves…** opens the wave definitions dialog. Each wave contains entries of:

| Field | Meaning |
|-------|---------|
| enemyType | basic, fast, armored, healer, swarm, tank, elite, boss |
| count | number of enemies in the entry |
| spawn ms | delay between spawns of the entry |
| wave ms | delay before the entry starts (from wave start) |

Custom waves replace the game's built-in waves for this level. Leave the
list empty (the default) to keep the game's built-in waves.

### Tilesets

Select from the dropdown to switch between tilesets (used by the background painting tools):
- **Nature** - Trees, grass, flowers
- **Field** - Farm tiles
- **Desert** - Sand, rocks
- **Floor** - Indoor floors
- **Water** - Water tiles

### Import/Export

- **Export JSON**: Save level as JSON file
- **Import JSON**: Load level from JSON file (legacy foreground `tiles` fields are ignored)
- **Export Image**: Save level as PNG image

### JSON Format

```json
{
  "version": 1,
  "name": "My Level",
  "description": "A fun level",
  "width": 20,
  "height": 15,
  "tileset": "TilesetNature",
  "bgTiles": [[0, 0, ...], ...],
  "areas": [["tree", "none", "roof", ...], ...],
  "fgAreas": [["fg", "none", ...], ...],
  "difficulty": "medium",
  "path": [{"x": 0, "y": 7}, ...],
  "spawnPoints": [{"x": 0, "y": 7}],
  "basePoints": [{"x": 19, "y": 7}],
  "grassColor": 8948814,
  "roadColor": 7829354
}
```

### Background Tile Index Reference

Background tiles are painted on a 2x-resolution grid (half-cell size).
Each tileset has tiles numbered starting from 0. Empty cells use -1.

## Integration with Game

To use a level in the game:

1. Export the level as JSON
2. Place the JSON file in `src/data/levels/`
3. Import and use in the game's level loader
