import { describe, expect, it } from 'vitest';

import { MAP_ENTITY_KINDS } from '../../src/entities/map-entity.constants';
import { parseFmgMapData } from '../../src/map-data/fmg-map-data.schema';
import { FmgMapModel } from '../../src/map-data/fmg-map-model';
import { parseMinimapBlockOptions } from '../../src/minimap/fmg-minimap-block.schema';
import { MinimapAreaPaths } from '../../src/minimap/minimap-area-paths';
import { panBox, zoomBox } from '../../src/minimap/minimap-viewport';
import { buildFakeMapExportText } from '../utils/fake-fmg-map';

const BOX = { x0: 0, y0: 0, x1: 100, y1: 50 };
const LIMITS = { minWidth: 10, maxWidth: 400 };

describe('zoomBox', () => {
  it('zooms around the anchor, which keeps its place in the view', () => {
    const zoomed = zoomBox(BOX, [80, 40], 0.5, LIMITS);

    expect(zoomed).toEqual({ x0: 40, y0: 20, x1: 90, y1: 45 });
  });

  it('stops at the zoom limits', () => {
    expect(zoomBox(BOX, [50, 25], 0.01, LIMITS).x1 - zoomBox(BOX, [50, 25], 0.01, LIMITS).x0).toBeCloseTo(10);
    expect(zoomBox(BOX, [50, 25], 100, LIMITS).x1 - zoomBox(BOX, [50, 25], 100, LIMITS).x0).toBeCloseTo(400);
  });
});

describe('panBox', () => {
  it('moves the view against the drag, so the map follows the pointer', () => {
    expect(panBox(BOX, 10, -5)).toEqual({ x0: -10, y0: 5, x1: 90, y1: 55 });
  });
});

describe('parseMinimapBlockOptions', () => {
  it('reads a named entity, with the kind in any case', () => {
    expect(parseMinimapBlockOptions({ kind: 'state', name: 'Ostmark', height: 240 })).toEqual({
      kind: MAP_ENTITY_KINDS.STATE,
      name: 'Ostmark',
      height: 240,
    });
  });

  it('takes an empty block as "the entity the note links to"', () => {
    expect(parseMinimapBlockOptions(null)).toEqual({});
  });

  it('names the option that is wrong', () => {
    expect(parseMinimapBlockOptions({ kind: 'RIVER' })).toMatch(/invalid kind/u);
    expect(parseMinimapBlockOptions('not yaml options')).toMatch(/^The fmg-map block has an invalid/u);
  });
});

describe('MinimapAreaPaths', () => {
  const model = new FmgMapModel(parseFmgMapData(buildFakeMapExportText()));

  it("fills each entity's cells in its FMG color, one path per entity", () => {
    const paths = new MinimapAreaPaths().read(model, MAP_ENTITY_KINDS.STATE);

    expect(paths.map((path) => path.color)).toEqual(['#66c2a5', '#fc8d62']);
    expect(paths.map((path) => path.d.match(/M/gu)?.length)).toEqual([4, 4]);
  });

  it('leaves out entities FMG gave no color', () => {
    expect(new MinimapAreaPaths().read(model, MAP_ENTITY_KINDS.CULTURE)).toEqual([]);
  });
});
