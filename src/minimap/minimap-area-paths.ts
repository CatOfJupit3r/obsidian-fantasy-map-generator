import type { MapEntityKind } from '../entities/map-entity.constants';
import type { FmgMapModel } from '../map-data/fmg-map-model';
import type { MapPoint } from '../map-data/map-geometry.types';

const COORDINATE_DIGITS = 1;

export interface iMinimapAreaPath {
  /** FMG's color for the entity. */
  color: string;
  /** The entity's cells as one SVG path. */
  d: string;
}

/** Every entity of an area kind as a filled path in its FMG color, built once per map export and kind. */
export class MinimapAreaPaths {
  private readonly pathsByModel = new WeakMap<FmgMapModel, Map<MapEntityKind, iMinimapAreaPath[]>>();

  public read(model: FmgMapModel, kind: MapEntityKind): iMinimapAreaPath[] {
    const pathsByKind = this.pathsByModel.get(model) ?? new Map<MapEntityKind, iMinimapAreaPath[]>();
    this.pathsByModel.set(model, pathsByKind);
    const cached = pathsByKind.get(kind);
    if (cached) return cached;

    const paths = this.build(model, kind);
    pathsByKind.set(kind, paths);
    return paths;
  }

  /** Walks the cells once, appending each to the path of the entity that holds it. */
  private build(model: FmgMapModel, kind: MapEntityKind): iMinimapAreaPath[] {
    const cellPathsByOwner = new Map<number, string[]>();
    model.data.pack.cells.forEach((_cell, cellId) => {
      for (const owner of model.geometry.readCellOwners(kind, cellId)) {
        const polygon = model.geometry.readCellPolygon(cellId);
        if (polygon.length < 3) continue;
        const cellPaths = cellPathsByOwner.get(owner) ?? [];
        cellPaths.push(`M${polygon.map((point) => this.formatPoint(point)).join('L')}Z`);
        cellPathsByOwner.set(owner, cellPaths);
      }
    });

    return [...cellPathsByOwner].flatMap(([id, cellPaths]) => {
      const color = model.catalog.readColor({ kind, id });
      return color ? [{ color, d: cellPaths.join('') }] : [];
    });
  }

  private formatPoint([x, y]: MapPoint): string {
    return `${x.toFixed(COORDINATE_DIGITS)} ${y.toFixed(COORDINATE_DIGITS)}`;
  }
}
