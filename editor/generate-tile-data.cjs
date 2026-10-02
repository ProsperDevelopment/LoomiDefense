/**
 * Tile data generator - extracts tile metadata from tilesets
 * Run with: node generate-tile-data.js
 */

const fs = require('fs');
const path = require('path');

const TILESETS = [
  'TilesetNature',
  'TilesetField', 
  'TilesetDesert',
  'TilesetFloor',
  'TilesetWater',
  'TilesetHouse',
  'TilesetAbandoned',
];

const TILE_SIZE = 16;

// Original tileset picture widths (in tiles) — the palette groups rows
// exactly like the source image. Verified against the pack PNGs.
const COLUMNS = {
  TilesetNature: 24,
  TilesetField: 5,
  TilesetDesert: 20,
  TilesetFloor: 22,
  TilesetWater: 28,
  TilesetHouse: 33,
  TilesetAbandoned: 20,
};

function generateTileData(tilesetName) {
  const tileDir = path.join(__dirname, '..', 'public', 'assets', 'tilesets', tilesetName);
  
  if (!fs.existsSync(tileDir)) {
    console.log(`Tileset directory not found: ${tileDir}`);
    return null;
  }

  const files = fs.readdirSync(tileDir).filter(f => f.endsWith('.png')).sort((a, b) => {
    const numA = parseInt(a.match(/\d+/)?.[0] || '0');
    const numB = parseInt(b.match(/\d+/)?.[0] || '0');
    return numA - numB;
  });

  const tiles = files.map((file, index) => ({
    id: index,
    file: file,
    name: `${tilesetName}_${index}`,
    category: categorizeTile(index, tilesetName),
  }));

  return {
    name: tilesetName,
    tileSize: TILE_SIZE,
    columns: COLUMNS[tilesetName] ?? 8,
    tileCount: tiles.length,
    tiles: tiles,
  };
}

function categorizeTile(index, tileset) {
  // Basic categorization based on tileset and position
  // This can be customized per tileset
  switch(tileset) {
    case 'TilesetNature':
      if (index < 50) return 'grass';
      if (index < 100) return 'flowers';
      if (index < 200) return 'trees';
      if (index < 300) return 'bushes';
      if (index < 400) return 'rocks';
      return 'decoration';
    case 'TilesetWater':
      return 'water';
    case 'TilesetDesert':
      if (index < 100) return 'sand';
      if (index < 200) return 'rocks';
      return 'cactus';
    case 'TilesetField':
      return 'farm';
    case 'TilesetFloor':
      return 'floor';
    case 'TilesetHouse':
      return 'house';
    case 'TilesetAbandoned':
      return 'abandoned';
    default:
      return 'unknown';
  }
}

// Generate data for all tilesets
const allTileData = {};
TILESETS.forEach(name => {
  const data = generateTileData(name);
  if (data) {
    allTileData[name] = data;
    console.log(`${name}: ${data.tileCount} tiles`);
  }
});

// Write to JSON
const outputPath = path.join(__dirname, '..', 'public', 'assets', 'tilesets', 'tile-data.json');
fs.writeFileSync(outputPath, JSON.stringify(allTileData, null, 2));
console.log(`\nTile data written to: ${outputPath}`);
