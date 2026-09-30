// One-shot conversion: serialize every auto-generated level in
// MAP_DEFINITIONS to src/data/levels/level<N>.json (skips files that
// already exist). Run with: npx tsx scripts/convert-levels.ts
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MAP_DEFINITIONS } from '../src/data/maps';
import { DEV_DEMO_WAVES } from '../src/data/devWaves';

const OUT_DIR = join(process.cwd(), 'src', 'data', 'levels');
let written = 0;
let skipped = 0;

for (const map of MAP_DEFINITIONS) {
  const file = join(OUT_DIR, `level${map.id}.json`);
  if (existsSync(file)) {
    skipped++;
    continue;
  }

  const json: Record<string, unknown> = {
    version: 1,
    name: map.name,
    description: map.description,
    width: map.width,
    height: map.height,
    path: map.basePath,
    spawnPoints: map.spawnPoints,
    basePoints: [{ x: map.basePath[map.basePath.length - 1].x, y: map.basePath[map.basePath.length - 1].y }],
  };
  // Optional color overrides (generated maps fall back to defaults)
  if (map.groundColor !== undefined) json.groundColor = map.groundColor;
  if (map.groundColorDark !== undefined) json.groundColorDark = map.groundColorDark;
  if (map.roadColor !== undefined) json.roadColor = map.roadColor;
  if (map.roadColorDark !== undefined) json.roadColorDark = map.roadColorDark;
  // Dev demo carries its special waves in the JSON now
  if (map.id === 0) json.waves = DEV_DEMO_WAVES;

  writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  written++;
  console.log(`wrote level${map.id}.json  (${map.name})`);
}

console.log(`\ndone: ${written} written, ${skipped} kept (existing JSON)`);
