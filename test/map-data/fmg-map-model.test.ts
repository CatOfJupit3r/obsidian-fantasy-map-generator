import { describe, expect, it } from 'vitest';

import { MAP_ENTITY_KINDS } from '../../src/entities/map-entity.constants';
import { parseFmgMapData } from '../../src/map-data/fmg-map-data.schema';
import { FmgMapModel } from '../../src/map-data/fmg-map-model';
import { buildFakeMapExport, buildFakeMapExportText } from '../utils/fake-fmg-map';

function loadModel() {
  return new FmgMapModel(parseFmgMapData(buildFakeMapExportText()));
}

describe('parseFmgMapData', () => {
  it('drops list items it cannot read, such as FMG placeholders, and keeps the rest', () => {
    const model = loadModel();

    expect(model.catalog.list(MAP_ENTITY_KINDS.BURG).map((burg) => burg.name)).toEqual(['Ostburg', 'Weston']);
    expect(model.catalog.list(MAP_ENTITY_KINDS.PROVINCE).map((province) => province.name)).toEqual([
      'Ostshire',
      'Westshire',
    ]);
  });

  it('refuses a JSON file that is not a Full export', () => {
    const minimal = { ...buildFakeMapExport(), grid: undefined };

    expect(() => parseFmgMapData(JSON.stringify(minimal))).toThrow('not an FMG "Full" JSON export');
  });
});

describe('MapEntityCatalog', () => {
  it('leaves out the neutral state, wildlands, no religion and removed entities, but keeps marker and zone 0', () => {
    const exported = buildFakeMapExport();
    const states = [...exported.pack.states, { i: 3, name: 'Fallen', removed: true }];
    const model = new FmgMapModel(parseFmgMapData(JSON.stringify({ ...exported, pack: { ...exported.pack, states } })));

    expect(model.catalog.list(MAP_ENTITY_KINDS.STATE).map((state) => state.id)).toEqual([1, 2]);
    expect(model.catalog.list(MAP_ENTITY_KINDS.CULTURE).map((culture) => culture.name)).toEqual(['Ostfolk']);
    expect(model.catalog.list(MAP_ENTITY_KINDS.RELIGION).map((religion) => religion.name)).toEqual(['Old Way']);
    expect(model.catalog.find({ kind: MAP_ENTITY_KINDS.MARKER, id: 0 })?.name).toBe('Mount Doom');
    expect(model.catalog.find({ kind: MAP_ENTITY_KINDS.ZONE, id: 0 })?.name).toBe('Plague');
  });

  it('finds an entity by name whatever its case', () => {
    expect(loadModel().catalog.findByName(MAP_ENTITY_KINDS.STATE, 'westmere')).toEqual({
      kind: MAP_ENTITY_KINDS.STATE,
      id: 2,
      name: 'Westmere',
    });
  });
});

describe('MapEntityGeometry', () => {
  it("outlines an area by the edges its cells share with no other of its cells", () => {
    const { geometry } = loadModel();
    const ostmark = { kind: MAP_ENTITY_KINDS.STATE, id: 1 };

    expect(geometry.readCells(ostmark)).toEqual([0, 1, 4, 5]);
    // A 2 by 2 block of cells has 8 outer edges; the 4 inner ones are left out.
    expect(geometry.readOutline(geometry.readCells(ostmark))).toHaveLength(8);
  });

  it('crops an area to its extent with room around it, and a point to a square around it', () => {
    const { geometry } = loadModel();

    const stateBox = geometry.readCropBox({ kind: MAP_ENTITY_KINDS.STATE, id: 1 });
    expect(stateBox?.x0).toBeLessThan(0);
    expect(stateBox?.x1).toBeGreaterThan(20);

    const radius = geometry.readPointRadius();
    expect(geometry.readCropBox({ kind: MAP_ENTITY_KINDS.BURG, id: 2 })).toEqual({
      x0: 35 - radius,
      y0: 15 - radius,
      x1: 35 + radius,
      y1: 15 + radius,
    });
  });
});

describe('MapEntityNeighbours', () => {
  it('finds the areas of the same kind across the border', () => {
    const { neighbours } = loadModel();

    expect(neighbours.read({ kind: MAP_ENTITY_KINDS.PROVINCE, id: 1 }).map((province) => province.name)).toEqual([
      'Westshire',
    ]);
  });

  it('gives a point the nearest points of its kind', () => {
    const { neighbours } = loadModel();

    expect(neighbours.read({ kind: MAP_ENTITY_KINDS.BURG, id: 1 }).map((burg) => burg.name)).toEqual(['Weston']);
  });
});
