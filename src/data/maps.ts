import type { MapData, CellType } from '../types';
import { straight, curve90, curve45, diagonal, combinePaths, type CurvePoint } from '../utils/CurveBuilder';
import { LEVEL_3, LEVEL_5, LEVEL_8, LEVEL_9 } from './LevelLoader';
import { LEVEL_4 } from './LevelLoader';

const _ = 'empty' as CellType;
const P = 'path' as CellType;
const S = 'spawn' as CellType;
const B = 'base' as CellType;

/**
 * Generate grid from path points.
 */
function generateGrid(
  width: number,
  height: number,
  pathPoints: CurvePoint[],
  spawnPoints: { x: number; y: number }[],
  basePath: CurvePoint[],
): CellType[][] {
  const grid: CellType[][] = [];
  for (let y = 0; y < height; y++) {
    grid.push(new Array(width).fill(_));
  }

  for (const sp of spawnPoints) {
    if (sp.y >= 0 && sp.y < height && sp.x >= 0 && sp.x < width) {
      grid[sp.y][sp.x] = S;
    }
  }

  for (const p of pathPoints) {
    if (p.y >= 0 && p.y < height && p.x >= 0 && p.x < width) {
      if (grid[p.y][p.x] !== S) {
        grid[p.y][p.x] = P;
      }
    }
  }

  const lastPoint = basePath[basePath.length - 1];
  if (lastPoint && lastPoint.y >= 0 && lastPoint.y < height && lastPoint.x >= 0 && lastPoint.x < width) {
    grid[lastPoint.y][lastPoint.x] = B;
  }

  return grid;
}

function generateMap(
  id: number,
  name: string,
  description: string,
  width: number,
  height: number,
  spawnX: number,
  spawnY: number,
  pathPoints: CurvePoint[],
  bgTiles?: number[][],
): MapData {
  const spawnPoints = [{ x: spawnX, y: spawnY }];
  const basePath = pathPoints.map(p => ({ x: p.x, y: p.y }));
  const grid = generateGrid(width, height, pathPoints, spawnPoints, basePath);

  return { 
    id, name, description, width, height, cellSize: 48, grid, spawnPoints, basePath,
    ...(bgTiles && { bgTiles, tileset: 'TilesetNature' })
  };
}

// ============================================================
// Level Definitions
// ============================================================

export const MAP_DEFINITIONS: MapData[] = [
  // Level 1: Gentle curves (beginner)
  generateMap(1, 'Winding Path', 'A gentle S-curve through green fields', 16, 12, 0, 1,
    combinePaths(
      straight(1, 1, 'right', 4),
      curve45(5, 1, 'right', 'down', 2),
      straight(6, 3, 'down', 2),
      curve45(6, 5, 'down', 'right', 2),
      straight(8, 5, 'right', 3),
      curve45(11, 5, 'right', 'down', 2),
      straight(12, 7, 'down', 2),
      curve45(12, 9, 'down', 'right', 1),
      straight(13, 9, 'right', 2),
    )
  ),

  // Level 2: Diagonal zigzag (beginner)
  generateMap(2, 'Diagonal Canyon', 'A diagonal zigzag through a canyon', 14, 12, 0, 1,
    combinePaths(
      straight(1, 1, 'right', 3),
      diagonal(4, 1, 1, 1, 3),
      straight(7, 4, 'right', 3),
      diagonal(10, 4, 1, 1, 3),
      straight(12, 7, 'down', 3),
    )
  ),

  // Level 3: Loaded from editor JSON
  LEVEL_3,

  // Level 4: Spiral with 45-degree turns (intermediate)
  LEVEL_4,

  // Level 5: Diagonal S-curve (intermediate)
  LEVEL_5,

  // Level 6: Maze with 45-degree turns (advanced)
  generateMap(6, 'The Maze', 'Navigate through a twisting maze', 16, 14, 0, 1,
    combinePaths(
      straight(1, 1, 'right', 3),
      curve45(4, 1, 'right', 'down', 1),
      straight(4, 2, 'down', 3),
      curve45(4, 5, 'down', 'left', 1),
      straight(3, 5, 'left', 2),
      curve45(1, 5, 'left', 'down', 1),
      straight(1, 6, 'down', 3),
      curve45(1, 9, 'down', 'right', 1),
      straight(2, 9, 'right', 3),
      curve45(5, 9, 'right', 'up', 1),
      straight(5, 8, 'up', 2),
      curve45(5, 6, 'up', 'right', 1),
      straight(6, 6, 'right', 5),
      curve45(11, 6, 'right', 'down', 1),
      straight(11, 7, 'down', 3),
    )
  ),

  // Level 7: Diagonal helix (advanced)
  generateMap(7, 'Diagonal Helix', 'A spiraling helix with diagonals', 16, 14, 0, 1,
    combinePaths(
      straight(1, 1, 'right', 4),
      diagonal(5, 1, 1, 1, 3),
      straight(8, 4, 'right', 2),
      diagonal(10, 4, -1, 1, 3),
      straight(8, 7, 'left', 3),
      diagonal(5, 7, -1, 1, 3),
      straight(3, 10, 'right', 5),
      curve45(8, 10, 'right', 'down', 1),
      straight(8, 11, 'down', 2),
    )
  ),
 LEVEL_8,

 LEVEL_9,

  // Level 10: Diagonal bridge (beginner)
  generateMap(10, 'Diagonal Bridge', 'Cross the bridge at an angle', 16, 10, 0, 1,
    combinePaths(
      straight(1, 1, 'right', 2),
      diagonal(3, 1, 1, 1, 5),
      straight(8, 6, 'right', 2),
      diagonal(10, 6, 1, 1, 3),
      straight(13, 9, 'right', 2),
    )
  ),

  // Level 11: Serpentine with 45-degree turns (intermediate)
  generateMap(11, 'Serpentine', 'A snake-like winding path', 14, 12, 0, 1,
    combinePaths(
      straight(1, 1, 'right', 4),
      curve45(5, 1, 'right', 'down', 2),
      straight(6, 3, 'down', 2),
      curve45(6, 5, 'down', 'left', 2),
      straight(4, 5, 'left', 2),
      curve45(2, 5, 'left', 'down', 2),
      straight(2, 7, 'down', 2),
      curve45(2, 9, 'down', 'right', 2),
      straight(4, 9, 'right', 8),
    ),
  ),

  // Level 12: Labyrinth with diagonals (advanced)
  generateMap(12, 'Labyrinth', 'Find your way through', 16, 14, 0, 1,
    combinePaths(
      straight(1, 1, 'right', 3),
      diagonal(4, 1, 1, 1, 3),
      straight(7, 4, 'down', 3),
      diagonal(7, 7, -1, 1, 2),
      straight(5, 9, 'down', 2),
      curve45(5, 11, 'down', 'right', 1),
      straight(6, 11, 'right', 8),
    )
  ),

  // Level 13: Dual with curves (intermediate)
  generateMap(13, 'Dual', 'Two paths converge', 16, 12, 0, 1,
    combinePaths(
      straight(1, 1, 'right', 3),
      curve45(4, 1, 'right', 'down', 2),
      straight(5, 3, 'down', 3),
      curve45(5, 6, 'down', 'right', 2),
      straight(7, 6, 'right', 3),
      curve45(10, 6, 'right', 'down', 2),
      straight(11, 8, 'down', 2),
      curve45(11, 10, 'down', 'right', 1),
      straight(12, 10, 'right', 3),
    )
  ),

  // Level 14: Zigzag with 45-degree turns (advanced)
  generateMap(14, 'Zigzag II', 'More zigzags, more danger', 14, 12, 0, 1,
    combinePaths(
      straight(1, 1, 'right', 2),
      curve45(3, 1, 'right', 'down', 1),
      straight(3, 2, 'down', 2),
      curve45(3, 4, 'down', 'right', 1),
      straight(4, 4, 'right', 3),
      curve45(7, 4, 'right', 'down', 1),
      straight(7, 5, 'down', 2),
      curve45(7, 7, 'down', 'right', 1),
      straight(8, 7, 'right', 3),
      curve45(11, 7, 'right', 'down', 1),
      straight(11, 8, 'down', 3),
    )
  ),

  // Level 15: Fortress diagonal (intermediate)
  generateMap(15, 'Fortress', 'Break through the fortress', 16, 14, 0, 1,
    combinePaths(
      straight(1, 1, 'right', 3),
      diagonal(4, 1, 1, 1, 4),
      straight(8, 5, 'right', 3),
      diagonal(11, 5, 1, 1, 4),
      straight(13, 9, 'down', 3),
    )
  ),

  // Level 16: Gauntlet with curves (beginner)
  generateMap(16, 'Gauntlet', 'Run the gauntlet', 16, 10, 0, 1,
    combinePaths(
      straight(1, 1, 'right', 3),
      curve45(4, 1, 'right', 'down', 1),
      straight(4, 2, 'down', 2),
      curve45(4, 4, 'down', 'right', 1),
      straight(5, 4, 'right', 4),
      curve45(9, 4, 'right', 'down', 1),
      straight(9, 5, 'down', 2),
      curve45(9, 7, 'down', 'right', 1),
      straight(10, 7, 'right', 5),
    )
  ),

  // Level 17: Fortress II diagonal (intermediate)
  generateMap(17, 'Fortress II', 'The second fortress', 14, 12, 0, 1,
    combinePaths(
      straight(1, 1, 'right', 3),
      diagonal(4, 1, 1, 1, 4),
      straight(8, 5, 'right', 2),
      curve45(10, 5, 'right', 'down', 1),
      straight(10, 6, 'down', 4),
    )
  ),

  // Level 18: Gauntlet II with 45-degree turns (beginner)
  generateMap(18, 'Gauntlet II', 'The second gauntlet', 14, 10, 0, 1,
    combinePaths(
      straight(1, 1, 'right', 2),
      curve45(3, 1, 'right', 'down', 2),
      straight(4, 3, 'down', 2),
      curve45(4, 5, 'down', 'right', 2),
      straight(6, 5, 'right', 6),
    )
  ),

  // Level 19: Fortress III diagonal (intermediate)
  generateMap(19, 'Fortress III', 'The final fortress', 14, 12, 0, 1,
    combinePaths(
      straight(1, 1, 'right', 2),
      diagonal(3, 1, 1, 1, 5),
      straight(8, 6, 'right', 2),
      curve45(10, 6, 'right', 'down', 1),
      straight(10, 7, 'down', 3),
    )
  ),

  // Level 20: Gauntlet III with curves (beginner)
  generateMap(20, 'Gauntlet III', 'The final gauntlet', 14, 10, 0, 1,
    combinePaths(
      straight(1, 1, 'right', 2),
      curve45(3, 1, 'right', 'down', 1),
      straight(3, 2, 'down', 2),
      curve45(3, 4, 'down', 'right', 1),
      straight(4, 4, 'right', 8),
    )
  ),

  // Level 21: Crossroads II with diagonals (intermediate)
  generateMap(21, 'Crossroads II', 'A more complex intersection', 16, 14, 0, 3,
    combinePaths(
      straight(1, 3, 'right', 3),
      diagonal(4, 3, 1, -1, 3),
      straight(7, 0, 'down', 11),
      diagonal(7, 11, 1, 1, 3),
      straight(10, 14, 'right', 5),
    )
  ),

  // Level 22: Gauntlet IV diagonal (beginner)
  generateMap(22, 'Gauntlet IV', 'The fourth gauntlet', 14, 10, 0, 1,
    combinePaths(
      straight(1, 1, 'right', 2),
      diagonal(3, 1, 1, 1, 4),
      straight(7, 5, 'right', 2),
      curve45(9, 5, 'right', 'down', 1),
      straight(9, 6, 'down', 3),
    )
  ),

  // Level 23: Fortress IV with curves (intermediate)
  generateMap(23, 'Fortress IV', 'The fourth fortress', 14, 12, 0, 1,
    combinePaths(
      straight(1, 1, 'right', 3),
      curve45(4, 1, 'right', 'down', 1),
      straight(4, 2, 'down', 3),
      curve45(4, 5, 'down', 'right', 1),
      straight(5, 5, 'right', 4),
      curve45(9, 5, 'right', 'down', 1),
      straight(9, 6, 'down', 4),
    )
  ),

  // Level 24: Gauntlet V diagonal (beginner)
  generateMap(24, 'Gauntlet V', 'The fifth gauntlet', 14, 10, 0, 1,
    combinePaths(
      straight(1, 1, 'right', 2),
      diagonal(3, 1, 1, 1, 3),
      straight(6, 4, 'right', 3),
      curve45(9, 4, 'right', 'down', 1),
      straight(9, 5, 'down', 4),
    )
  ),

  // Level 25: Final Boss diagonal (intermediate)
  generateMap(25, 'Final Boss', 'Defeat the final boss', 16, 14, 0, 1,
    combinePaths(
      straight(1, 1, 'right', 3),
      diagonal(4, 1, 1, 1, 4),
      straight(8, 5, 'right', 3),
      diagonal(11, 5, 1, 1, 4),
      straight(13, 9, 'down', 3),
    )
  ),

  // Dev Demo
  generateMap(0, 'Dev Demo', 'Test all enemy types', 16, 10, 0, 1,
    combinePaths(
      straight(1, 1, 'right', 3),
      curve45(4, 1, 'right', 'down', 2),
      straight(5, 3, 'down', 2),
      curve45(5, 5, 'down', 'right', 2),
      straight(7, 5, 'right', 8),
    )
  ),
];
