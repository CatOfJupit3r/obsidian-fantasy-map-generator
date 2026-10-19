import { describe, expect, it } from 'vitest';

import { MAP_ENTITY_KINDS } from '../../src/entities/map-entity.constants';
import type { iMapEntityRef } from '../../src/entities/map-entity.types';
import { MapFactsCalculator } from '../../src/facts/map-facts.calculator';
import { MAP_FACT_PART_KIND_CASES } from '../../src/facts/map-facts.types';
import type { iMapFact } from '../../src/facts/map-facts.types';
import { parseFmgMapData } from '../../src/map-data/fmg-map-data.schema';
import { FmgMapModel } from '../../src/map-data/fmg-map-model';
import { buildFakeMapExport } from '../utils/fake-fmg-map';

function calculate(ref: iMapEntityRef, data = buildFakeMapExport()) {
  return new MapFactsCalculator(new FmgMapModel(parseFmgMapData(JSON.stringify(data)))).calculate(ref);
}

/** Each fact as `label: part, part`, entities by name. */
function readLines(facts: iMapFact[] | null): string[] {
  return (facts ?? []).map(
    (fact) =>
      `${fact.label}: ${fact.parts
        .map((part) => (part.kind === MAP_FACT_PART_KIND_CASES.TEXT ? part.text : `<${part.entity.name}>`))
        .join(', ')}`,
  );
}

describe('MapFactsCalculator', () => {
  it("states a state's area, people, capital, neighbours, river, biomes and climate in the map's units", () => {
    expect(readLines(calculate({ kind: MAP_ENTITY_KINDS.STATE, id: 1 }))).toEqual([
      // 4 cells of 100 square map units, at 2 km per map unit.
      'Area: 1,600 km²',
      // 4 cells of 2 rural points and Ostburg's 3 urban points, at 1000 people per point.
      'Population: 11K',
      'Capital: <Ostburg>',
      'Neighbours: <Westmere>',
      'River: Lenn',
      'Biome: Grassland',
      'Temperature: 10°C to 11°C',
      'Precipitation: 100 mm to 200 mm',
    ]);
  });

  it("states a burg's people, state and province from the cell it sits in", () => {
    expect(readLines(calculate({ kind: MAP_ENTITY_KINDS.BURG, id: 1 }))).toEqual([
      // 3 urban points at 1000 people per point and full urbanization.
      'Population: 3K',
      'Capital of: <Ostmark>',
      'Province: <Ostshire>',
      'Culture: <Ostfolk>',
      'Religion: <Old Way>',
      'Nearby: <Weston>',
      'Biome: Grassland',
      'Temperature: 10°C',
      'Precipitation: 100 mm',
    ]);
  });

  it('converts temperatures to the scale the map uses', () => {
    const data = buildFakeMapExport();
    data.settings.temperatureScale = '°F';

    expect(readLines(calculate({ kind: MAP_ENTITY_KINDS.MARKER, id: 0 }, data))).toContain('Temperature: 52°F');
  });

  it('gives no facts for an entity that is no longer on the map', () => {
    expect(calculate({ kind: MAP_ENTITY_KINDS.STATE, id: 9 })).toBeNull();
  });
});
