# Tower Defense Level Editor

A standalone level editor for creating and editing tower defense maps.

## Features

- **Paint tiles** from multiple tilesets (Nature, Field, Desert, Floor, Water)
- **Draw paths** for enemy movement
- **Place spawn points** and **base locations**
- **Import/Export** levels as JSON
- **Export** as PNG image
- **Zoom** and **grid** controls
- **Keyboard shortcuts** (1-5 for tools)

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
| Paint Tile | 1 | Paint tiles on the grid |
| Erase Tile | 2 | Remove tiles |
| Draw Path | 3 | Draw enemy path points |
| Place Spawn | 4 | Set enemy spawn location |
| Place Base | 5 | Set base/exit location |

### Tilesets

Select from the dropdown to switch between tilesets:
- **Nature** - Trees, grass, flowers
- **Field** - Farm tiles
- **Desert** - Sand, rocks
- **Floor** - Indoor floors
- **Water** - Water tiles

### Import/Export

- **Export JSON**: Save level as JSON file
- **Import JSON**: Load level from JSON file
- **Export Image**: Save level as PNG image

### JSON Format

```json
{
  "version": 1,
  "name": "My Level",
  "description": "A fun level",
  "width": 20,
  "height": 15,
  "tileSize": 16,
  "tileset": "TilesetNature",
  "tiles": [[0, 0, ...], ...],
  "path": [{"x": 0, "y": 7}, ...],
  "spawnPoints": [{"x": 0, "y": 7}],
  "basePoints": [{"x": 19, "y": 7}]
}
```

### Tile Index Reference

Each tileset has tiles numbered starting from 0. Empty cells use -1.

## Integration with Game

To use a level in the game:

1. Export the level as JSON
2. Place the JSON file in `src/data/levels/`
3. Import and use in the game's level loader
