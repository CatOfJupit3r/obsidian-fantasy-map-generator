import { MAP_ENTITY_SHAPES, readMapEntityKindFormat } from '../entities/map-entity.constants';
import type { iMapEntityRef, iMapEntitySummary } from '../entities/map-entity.types';
import type { FmgMapData } from './fmg-map-data.schema';
import type { MapEntityCatalog } from './map-entity-catalog';
import type { MapEntityGeometry } from './map-entity-geometry';

/** A point entity's neighbours are the nearest entities of its kind. */
const POINT_NEIGHBOUR_COUNT = 5;

/** The entities of the same kind next to an entity: bordering areas, or the nearest points. */
export class MapEntityNeighbours {
  public constructor(
    private readonly data: FmgMapData,
    private readonly catalog: MapEntityCatalog,
    private readonly geometry: MapEntityGeometry,
  ) {}

  public read(ref: iMapEntityRef): iMapEntitySummary[] {
    const ids =
      readMapEntityKindFormat(ref.kind).shape === MAP_ENTITY_SHAPES.POINT
        ? this.readNearestPoints(ref)
        : this.readBorderingAreas(ref);
    return ids.flatMap((id) => {
      const neighbour = this.catalog.find({ kind: ref.kind, id });
      return neighbour ? [neighbour] : [];
    });
  }

  private readBorderingAreas(ref: iMapEntityRef): number[] {
    const ownCells = new Set(this.geometry.readCells(ref));
    const neighbours = new Set<number>();
    for (const cellId of ownCells) {
      for (const nextCellId of this.data.pack.cells[cellId]?.c ?? []) {
        if (ownCells.has(nextCellId)) continue;
        for (const owner of this.geometry.readCellOwners(ref.kind, nextCellId)) {
          if (owner !== ref.id) neighbours.add(owner);
        }
      }
    }
    return [...neighbours].sort((left, right) => left - right);
  }

  private readNearestPoints(ref: iMapEntityRef): number[] {
    const origin = this.geometry.readPoint(ref);
    if (!origin) return [];

    return this.catalog
      .list(ref.kind)
      .flatMap((other) => {
        const point = other.id === ref.id ? null : this.geometry.readPoint(other);
        return point ? [{ id: other.id, distance: Math.hypot(point[0] - origin[0], point[1] - origin[1]) }] : [];
      })
      .sort((left, right) => left.distance - right.distance)
      .slice(0, POINT_NEIGHBOUR_COUNT)
      .map((other) => other.id);
  }
}
