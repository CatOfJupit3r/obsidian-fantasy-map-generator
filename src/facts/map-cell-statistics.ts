import type { FmgMapData } from '../map-data/fmg-map-data.schema';
import type { MapEntityCatalog } from '../map-data/map-entity-catalog';

/** How many biomes the facts name, most common first. */
const DOMINANT_BIOME_COUNT = 3;

export interface iBiomeShare {
  biome: number;
  /** Share of the cells' area, 0 to 1. */
  share: number;
}

export interface iValueRange {
  min: number;
  max: number;
}

export interface iCellClimate {
  /** In °C, as FMG stores it. */
  temperature: iValueRange;
  /** In FMG's units of 100 mm. */
  precipitation: iValueRange;
}

/** Sums and spreads over a set of map cells: area, population, rivers, biomes, climate. */
export class MapCellStatistics {
  public constructor(
    private readonly data: FmgMapData,
    private readonly catalog: MapEntityCatalog,
  ) {}

  /** In square map units. */
  public readRawArea(cells: number[]): number {
    return cells.reduce((total, cellId) => total + (this.data.pack.cells[cellId]?.area ?? 0), 0);
  }

  /** The cells' rural population points, and the urban points of the burgs on them. */
  public readPopulationPoints(cells: number[]): { rural: number; urban: number } {
    const points = { rural: 0, urban: 0 };
    for (const cellId of cells) {
      const cell = this.data.pack.cells[cellId];
      if (!cell) continue;
      points.rural += cell.pop;
      points.urban += this.catalog.readBurg(cell.burg)?.population ?? 0;
    }
    return points;
  }

  /** The rivers that run through the cells, longest stretch first. */
  public readRivers(cells: number[]): number[] {
    const stretches = new Map<number, number>();
    for (const cellId of cells) {
      const river = this.data.pack.cells[cellId]?.r ?? 0;
      if (river > 0) stretches.set(river, (stretches.get(river) ?? 0) + 1);
    }
    return [...stretches.entries()].sort((left, right) => right[1] - left[1]).map(([river]) => river);
  }

  public readDominantBiomes(cells: number[]): iBiomeShare[] {
    const areas = new Map<number, number>();
    let totalArea = 0;
    for (const cellId of cells) {
      const cell = this.data.pack.cells[cellId];
      if (!cell) continue;
      areas.set(cell.biome, (areas.get(cell.biome) ?? 0) + cell.area);
      totalArea += cell.area;
    }
    if (totalArea <= 0) return [];

    return [...areas.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, DOMINANT_BIOME_COUNT)
      .map(([biome, area]) => ({ biome, share: area / totalArea }));
  }

  /** The spread of the yearly mean temperature and precipitation over the cells, from FMG's grid. */
  public readClimate(cells: number[]): iCellClimate | null {
    const temperatures: number[] = [];
    const precipitations: number[] = [];
    for (const cellId of cells) {
      const gridCellId = this.data.pack.cells[cellId]?.g;
      const gridCell = gridCellId === undefined ? undefined : this.data.grid.cells[gridCellId];
      if (!gridCell) continue;
      temperatures.push(gridCell.temp);
      precipitations.push(gridCell.prec);
    }

    const temperature = this.readRange(temperatures);
    const precipitation = this.readRange(precipitations);
    return temperature && precipitation ? { temperature, precipitation } : null;
  }

  private readRange(values: number[]): iValueRange | null {
    const [first] = values;
    if (first === undefined) return null;
    return values.reduce((range, value) => ({ min: Math.min(range.min, value), max: Math.max(range.max, value) }), {
      min: first,
      max: first,
    });
  }
}
