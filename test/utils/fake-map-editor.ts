import { MAP_EXPORT_KINDS } from '../../src/map/map-export.constants';
import type { MapExportKind } from '../../src/map/map-export.constants';
import type { iExportedMapFile, iMapEditor, iMapRegionImage, iSerializedMap } from '../../src/map/map.types';

/** A map editor that holds the map as text, the way FMG holds what its `.map` serialisation writes. */
export class FakeMapEditor implements iMapEditor {
  public readonly loadedTexts: string[] = [];

  public readonly exportRequests: MapExportKind[][] = [];

  public readonly regionRequests: iMapRegionImage[][] = [];

  /** What a JSON export returns, standing in for FMG's Full JSON of the map. */
  public jsonExport: string | null = null;

  /** What the next exports fail with, if anything. */
  public exportFailure: Error | null = null;

  public constructor(private mapText: string) {}

  /** Stands in for an edit made in the editor's UI. */
  public edit(mapText: string) {
    this.mapText = mapText;
  }

  public async loadMap(mapData: ArrayBuffer): Promise<void> {
    const mapText = new TextDecoder().decode(mapData);
    this.loadedTexts.push(mapText);
    this.mapText = mapText;
  }

  public async serializeMap(): Promise<iSerializedMap> {
    return { text: this.mapText, content: this.mapText };
  }

  public async exportMap(kinds: MapExportKind[]): Promise<iExportedMapFile[]> {
    this.exportRequests.push(kinds);
    if (this.exportFailure) throw this.exportFailure;
    return kinds.map((kind) => ({
      kind,
      data: new TextEncoder().encode(
        kind === MAP_EXPORT_KINDS.JSON && this.jsonExport !== null ? this.jsonExport : `${kind} of ${this.mapText}`,
      ).buffer,
    }));
  }

  public async renderRegions(regions: iMapRegionImage[]): Promise<ArrayBuffer[]> {
    this.regionRequests.push(regions);
    return regions.map((region) => new TextEncoder().encode(`PNG ${region.width}x${region.height}`).buffer);
  }
}
