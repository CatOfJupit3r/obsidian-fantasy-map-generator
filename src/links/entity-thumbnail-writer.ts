import type { iMapEntityRef } from '../entities/map-entity.types';
import type { FmgMapModel } from '../map-data/fmg-map-model';
import type { iMapBox } from '../map-data/map-geometry.types';
import { buildEntityThumbnailPath } from '../map/map-file-paths';
import type { iMapEditor, iMapRegionImage } from '../map/map.types';
import type { VaultBinaryWriter } from '../map/vault-binary-writer';

/** The thumbnail's longer side, in pixels. */
const THUMBNAIL_LONG_SIDE_PX = 480;

export type MapRegionRenderer = Pick<iMapEditor, 'renderRegions'>;

interface iThumbnailJob {
  path: string;
  region: iMapRegionImage;
}

/** Renders a cropped PNG of each entity next to the map: `Maps/Aster.fmg.state-7.png`. */
export class EntityThumbnailWriter {
  public constructor(private readonly binaryWriter: VaultBinaryWriter) {}

  /** Returns the paths written; an entity with no place on the map gets none. */
  public async write(
    mapPath: string,
    model: FmgMapModel,
    refs: iMapEntityRef[],
    renderer: MapRegionRenderer,
  ): Promise<Set<string>> {
    const jobs = refs.flatMap((ref): iThumbnailJob[] => {
      const box = model.geometry.readCropBox(ref);
      return box ? [{ path: buildEntityThumbnailPath(mapPath, ref), region: this.buildRegion(box, model) }] : [];
    });
    if (jobs.length === 0) return new Set();

    const images = await renderer.renderRegions(jobs.map((job) => job.region));
    const written = new Set<string>();
    for (const [index, job] of jobs.entries()) {
      const image = images[index];
      if (!image || image.byteLength === 0) continue;
      await this.binaryWriter.write(job.path, image);
      written.add(job.path);
    }
    return written;
  }

  private buildRegion(cropBox: iMapBox, model: FmgMapModel): iMapRegionImage {
    const mapBox = model.geometry.readMapBox();
    const box = {
      x0: Math.max(mapBox.x0, cropBox.x0),
      y0: Math.max(mapBox.y0, cropBox.y0),
      x1: Math.min(mapBox.x1, cropBox.x1),
      y1: Math.min(mapBox.y1, cropBox.y1),
    };
    const width = Math.max(1, box.x1 - box.x0);
    const height = Math.max(1, box.y1 - box.y0);
    const pixelsPerUnit = THUMBNAIL_LONG_SIDE_PX / Math.max(width, height);
    return {
      box,
      width: Math.max(1, Math.round(width * pixelsPerUnit)),
      height: Math.max(1, Math.round(height * pixelsPerUnit)),
    };
  }
}
