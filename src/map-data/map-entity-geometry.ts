import { MAP_ENTITY_KINDS, MAP_ENTITY_SHAPES, readMapEntityKindFormat } from '../entities/map-entity.constants';
import type { MapEntityKind } from '../entities/map-entity.constants';
import type { iMapEntityRef } from '../entities/map-entity.types';
import type { FmgMapData, FmgPackCell } from './fmg-map-data.schema';
import type { MapEntityCatalog } from './map-entity-catalog';
import type { iMapBox, MapPoint, MapSegment } from './map-geometry.types';

/** Around a point entity, the crop shows this share of the map's longer side in each direction. */
const POINT_CROP_SHARE = 0.04;
/** Space left around an area entity's own extent, as a share of that extent. */
const AREA_CROP_PADDING_SHARE = 0.12;

/** Where each entity is: its cells and outline for areas, its position for points, and the box to crop it to. */
export class MapEntityGeometry {
  private zonesByCell: Map<number, number[]> | null = null;

  public constructor(
    private readonly data: FmgMapData,
    private readonly catalog: MapEntityCatalog,
  ) {}

  public readMapBox(): iMapBox {
    return { x0: 0, y0: 0, x1: this.data.info.width, y1: this.data.info.height };
  }

  /** The cells an area entity covers; a point entity covers the one cell it sits in. */
  public readCells(ref: iMapEntityRef): number[] {
    switch (ref.kind) {
      case MAP_ENTITY_KINDS.BURG: {
        const burg = this.catalog.readBurg(ref.id);
        return burg ? [burg.cell] : [];
      }
      case MAP_ENTITY_KINDS.MARKER: {
        const marker = this.catalog.readMarker(ref.id);
        return marker ? [marker.cell] : [];
      }
      case MAP_ENTITY_KINDS.ZONE:
        return (this.catalog.readZone(ref.id)?.cells ?? []).filter((cell) => this.data.pack.cells[cell]);
      default:
        return this.collectCells(ref.kind, ref.id);
    }
  }

  /** The area entities of `kind` that hold the cell; zones may overlap, every other kind holds a cell alone. */
  public readCellOwners(kind: MapEntityKind, cellId: number): number[] {
    const cell = this.data.pack.cells[cellId];
    if (!cell) return [];
    if (kind === MAP_ENTITY_KINDS.ZONE) return this.readZonesByCell().get(cellId) ?? [];

    const owner = this.readCellOwner(kind, cell);
    return owner > 0 ? [owner] : [];
  }

  /** Where a point entity sits, or null for an area entity or an unknown one. */
  public readPoint(ref: iMapEntityRef): MapPoint | null {
    if (ref.kind === MAP_ENTITY_KINDS.BURG) {
      const burg = this.catalog.readBurg(ref.id);
      return burg ? [burg.x, burg.y] : null;
    }
    if (ref.kind === MAP_ENTITY_KINDS.MARKER) {
      const marker = this.catalog.readMarker(ref.id);
      return marker ? [marker.x, marker.y] : null;
    }
    return null;
  }

  /** How far a point entity's crop reaches from it. */
  public readPointRadius(): number {
    return Math.max(this.data.info.width, this.data.info.height) * POINT_CROP_SHARE;
  }

  public readCellPolygon(cellId: number): MapPoint[] {
    const { vertices } = this.data.pack;
    return (this.data.pack.cells[cellId]?.v ?? []).flatMap((vertexId) => {
      const vertex = vertices[vertexId];
      return vertex ? [vertex.p] : [];
    });
  }

  /** The box to show the entity in, with room around it, or null when the entity has no place on the map. */
  public readCropBox(ref: iMapEntityRef): iMapBox | null {
    const point = this.readPoint(ref);
    if (point) {
      const radius = this.readPointRadius();
      return { x0: point[0] - radius, y0: point[1] - radius, x1: point[0] + radius, y1: point[1] + radius };
    }
    if (readMapEntityKindFormat(ref.kind).shape !== MAP_ENTITY_SHAPES.AREA) return null;

    const extent = this.readExtent(this.readCells(ref).flatMap((cell) => this.readCellPolygon(cell)));
    if (!extent) return null;
    const padding = Math.max(extent.x1 - extent.x0, extent.y1 - extent.y0) * AREA_CROP_PADDING_SHARE;
    return { x0: extent.x0 - padding, y0: extent.y0 - padding, x1: extent.x1 + padding, y1: extent.y1 + padding };
  }

  /** The edges of the cells that border no other cell of the set: the set's outline, holes included. */
  public readOutline(cells: number[]): MapSegment[] {
    const edgeCounts = new Map<string, { segment: MapSegment; count: number }>();
    for (const cellId of cells) {
      const vertexIds = this.data.pack.cells[cellId]?.v ?? [];
      vertexIds.forEach((vertexId, index) => {
        const nextId = vertexIds[(index + 1) % vertexIds.length];
        const start = this.data.pack.vertices[vertexId]?.p;
        const end = nextId === undefined ? undefined : this.data.pack.vertices[nextId]?.p;
        if (!start || !end || nextId === undefined) return;

        const edgeKey = vertexId < nextId ? `${vertexId}:${nextId}` : `${nextId}:${vertexId}`;
        const known = edgeCounts.get(edgeKey);
        if (known) known.count += 1;
        else edgeCounts.set(edgeKey, { segment: [start, end], count: 1 });
      });
    }
    return [...edgeCounts.values()].filter((edge) => edge.count === 1).map((edge) => edge.segment);
  }

  private collectCells(kind: MapEntityKind, id: number): number[] {
    const cells: number[] = [];
    this.data.pack.cells.forEach((cell, cellId) => {
      if (this.readCellOwner(kind, cell) === id) cells.push(cellId);
    });
    return cells;
  }

  /** The area entity of `kind` holding the cell, 0 for none; zones and point kinds hold no cell this way. */
  private readCellOwner(kind: MapEntityKind, cell: FmgPackCell): number {
    switch (kind) {
      case MAP_ENTITY_KINDS.STATE:
        return cell.state;
      case MAP_ENTITY_KINDS.PROVINCE:
        return cell.province;
      case MAP_ENTITY_KINDS.CULTURE:
        return cell.culture;
      case MAP_ENTITY_KINDS.RELIGION:
        return cell.religion;
      default:
        return 0;
    }
  }

  private readZonesByCell(): Map<number, number[]> {
    if (this.zonesByCell) return this.zonesByCell;

    const zonesByCell = new Map<number, number[]>();
    for (const zone of this.catalog.listZones()) {
      for (const cell of zone.cells) zonesByCell.set(cell, [...(zonesByCell.get(cell) ?? []), zone.i]);
    }
    this.zonesByCell = zonesByCell;
    return zonesByCell;
  }

  private readExtent(points: MapPoint[]): iMapBox | null {
    const [first] = points;
    if (!first) return null;
    // A loop, not Math.min(...points): a large state has more vertices than a call takes arguments.
    const extent = { x0: first[0], y0: first[1], x1: first[0], y1: first[1] };
    for (const [x, y] of points) {
      extent.x0 = Math.min(extent.x0, x);
      extent.y0 = Math.min(extent.y0, y);
      extent.x1 = Math.max(extent.x1, x);
      extent.y1 = Math.max(extent.y1, y);
    }
    return extent;
  }
}
