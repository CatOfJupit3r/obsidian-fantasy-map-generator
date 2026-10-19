/**
 * A small FMG "Full" JSON export: a grid of 10 by 10 square cells, 4 columns and 2 rows, with cell `x + 4y` at
 * column x and row y.
 *
 *          x=0        x=1        x=2        x=3
 *   y=0  Ostmark   Ostmark    Westmere   Westmere      state 1 | state 2, provinces alike
 *   y=1  Ostmark   Ostmark    Westmere   Westmere
 *
 * The river Lenn runs down column 1. Culture Ostfolk covers every cell; the religion Old Way covers state 1 only.
 * Burg 1, Ostburg, sits in cell 0 and is the capital of Ostmark; burg 2, Weston, sits in cell 7. The zone Plague
 * covers cells 0 and 1; marker 0, Mount Doom, sits in cell 5. Temperature is 10°C plus the column, precipitation
 * 100 mm times one plus the row.
 */
export const FAKE_MAP_COLUMNS = 4;
export const FAKE_MAP_ROWS = 2;
export const FAKE_CELL_SIZE = 10;

const cellAt = (x: number, y: number) => x + y * FAKE_MAP_COLUMNS;
const vertexAt = (x: number, y: number) => x + y * (FAKE_MAP_COLUMNS + 1);

function buildCells() {
  const cells = [];
  for (let y = 0; y < FAKE_MAP_ROWS; y += 1) {
    for (let x = 0; x < FAKE_MAP_COLUMNS; x += 1) {
      const neighbours = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ].filter(([nx = -1, ny = -1]) => nx >= 0 && nx < FAKE_MAP_COLUMNS && ny >= 0 && ny < FAKE_MAP_ROWS);
      const state = x < 2 ? 1 : 2;
      cells.push({
        i: cellAt(x, y),
        v: [vertexAt(x, y), vertexAt(x + 1, y), vertexAt(x + 1, y + 1), vertexAt(x, y + 1)],
        c: neighbours.map(([nx = 0, ny = 0]) => cellAt(nx, ny)),
        p: [(x + 0.5) * FAKE_CELL_SIZE, (y + 0.5) * FAKE_CELL_SIZE],
        g: cellAt(x, y),
        h: 30,
        area: FAKE_CELL_SIZE * FAKE_CELL_SIZE,
        biome: x === 3 ? 2 : 1,
        r: x === 1 ? 1 : 0,
        pop: 2,
        culture: 1,
        burg: cellAt(x, y) === 0 ? 1 : cellAt(x, y) === 7 ? 2 : 0,
        state,
        religion: state === 1 ? 1 : 0,
        province: state,
      });
    }
  }
  return cells;
}

function buildVertices() {
  const vertices = [];
  for (let y = 0; y <= FAKE_MAP_ROWS; y += 1) {
    for (let x = 0; x <= FAKE_MAP_COLUMNS; x += 1) vertices.push({ i: vertexAt(x, y), p: [x * FAKE_CELL_SIZE, y * FAKE_CELL_SIZE] });
  }
  return vertices;
}

export function buildFakeMapExport() {
  const cells = buildCells();
  return {
    info: { width: FAKE_MAP_COLUMNS * FAKE_CELL_SIZE, height: FAKE_MAP_ROWS * FAKE_CELL_SIZE, mapName: 'Aster' },
    settings: {
      distanceUnit: 'km',
      distanceScale: 2,
      areaUnit: 'square',
      temperatureScale: '°C',
      populationRate: 1000,
      urbanization: 1,
    },
    pack: {
      cells,
      vertices: buildVertices(),
      biomes: [
        { i: 0, name: 'Marine' },
        { i: 1, name: 'Grassland' },
        { i: 2, name: 'Taiga' },
      ],
      burgs: [
        {},
        { i: 1, name: 'Ostburg', x: 5, y: 5, cell: 0, state: 1, culture: 1, capital: 1, port: 0, population: 3 },
        { i: 2, name: 'Weston', x: 35, y: 15, cell: 7, state: 2, culture: 1, capital: 0, port: 1, population: 1 },
      ],
      states: [
        { i: 0, name: 'Neutrals' },
        { i: 1, name: 'Ostmark', fullName: 'Kingdom of Ostmark', capital: 1, neighbors: [2] },
        { i: 2, name: 'Westmere', capital: 0, neighbors: [1] },
      ],
      provinces: [0, { i: 1, name: 'Ostshire', state: 1, burg: 1 }, { i: 2, name: 'Westshire', state: 2, burg: 2 }],
      cultures: [
        { i: 0, name: 'Wildlands' },
        { i: 1, name: 'Ostfolk' },
      ],
      religions: [
        { i: 0, name: 'No religion' },
        { i: 1, name: 'Old Way' },
      ],
      rivers: [{ i: 1, name: 'Lenn' }],
      markers: [{ i: 0, type: 'volcanoes', name: 'Mount Doom', x: 15, y: 15, cell: 5 }],
      zones: [{ i: 0, name: 'Plague', type: 'Disease', cells: [0, 1] }],
    },
    grid: {
      cells: cells.map((cell) => ({
        temp: 10 + (cell.i % FAKE_MAP_COLUMNS),
        prec: 1 + Math.floor(cell.i / FAKE_MAP_COLUMNS),
      })),
    },
  };
}

export function buildFakeMapExportText(): string {
  return JSON.stringify(buildFakeMapExport());
}
