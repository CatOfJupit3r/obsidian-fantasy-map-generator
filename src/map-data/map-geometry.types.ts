/** A position in map units, on a map of `info.width` by `info.height`. */
export type MapPoint = readonly [number, number];

/** A map-space box: `x0`/`y0` is its top-left corner, `x1`/`y1` its bottom-right. */
export interface iMapBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** One edge of an entity's outline. */
export type MapSegment = readonly [MapPoint, MapPoint];
