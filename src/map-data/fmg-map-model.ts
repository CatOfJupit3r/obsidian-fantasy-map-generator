import type { FmgMapData } from './fmg-map-data.schema';
import { MapEntityCatalog } from './map-entity-catalog';
import { MapEntityGeometry } from './map-entity-geometry';
import { MapEntityNeighbours } from './map-entity-neighbours';

/** One map's Full JSON export with the lookups the facts, crops and links read it through. */
export class FmgMapModel {
  public readonly catalog: MapEntityCatalog;

  public readonly geometry: MapEntityGeometry;

  public readonly neighbours: MapEntityNeighbours;

  public constructor(public readonly data: FmgMapData) {
    this.catalog = new MapEntityCatalog(data);
    this.geometry = new MapEntityGeometry(data, this.catalog);
    this.neighbours = new MapEntityNeighbours(data, this.catalog, this.geometry);
  }
}
