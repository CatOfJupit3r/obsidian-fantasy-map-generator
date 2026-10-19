import { MAP_ENTITY_KINDS } from '../entities/map-entity.constants';
import type { MapEntityKind } from '../entities/map-entity.constants';
import type { iMapEntityRef } from '../entities/map-entity.types';
import type { FmgMapModel } from '../map-data/fmg-map-model';
import { MapCellStatistics } from './map-cell-statistics';
import { MapFactUnits } from './map-fact-units';
import { MAP_FACT_PART_KIND_CASES } from './map-facts.types';
import type { iMapFact, MapFactPart } from './map-facts.types';

const PERCENT = 100;
/** Rivers are named longest stretch first, up to this many; the rest are counted. */
const LISTED_RIVER_COUNT = 6;

/** What the map knows about one entity, as the lines of its facts block. */
export class MapFactsCalculator {
  private readonly statistics: MapCellStatistics;

  private readonly units: MapFactUnits;

  public constructor(private readonly model: FmgMapModel) {
    this.statistics = new MapCellStatistics(model.data, model.catalog);
    this.units = new MapFactUnits(model.data.settings);
  }

  /** Null when the map has no such entity, say after it was removed in FMG. */
  public calculate(ref: iMapEntityRef): iMapFact[] | null {
    if (!this.model.catalog.has(ref)) return null;

    const facts = this.readKindFacts(ref);
    return [...facts, ...this.readTerrainFacts(this.model.geometry.readCells(ref))].filter(
      (fact) => fact.parts.length > 0,
    );
  }

  private readKindFacts(ref: iMapEntityRef): iMapFact[] {
    switch (ref.kind) {
      case MAP_ENTITY_KINDS.STATE:
        return this.readStateFacts(ref);
      case MAP_ENTITY_KINDS.PROVINCE:
        return this.readProvinceFacts(ref);
      case MAP_ENTITY_KINDS.BURG:
        return this.readBurgFacts(ref);
      case MAP_ENTITY_KINDS.MARKER:
        return this.readMarkerFacts(ref);
      case MAP_ENTITY_KINDS.ZONE:
        return this.readZoneFacts(ref);
      default:
        return [...this.readAreaFacts(ref), this.readNeighbourFact(ref)];
    }
  }

  private readStateFacts(ref: iMapEntityRef): iMapFact[] {
    const state = this.model.catalog.readState(ref.id);
    return [
      ...this.readAreaFacts(ref),
      this.readEntityFact('Capital', MAP_ENTITY_KINDS.BURG, state?.capital),
      this.readNeighbourFact(ref),
    ];
  }

  private readProvinceFacts(ref: iMapEntityRef): iMapFact[] {
    const province = this.model.catalog.readProvince(ref.id);
    return [
      ...this.readAreaFacts(ref),
      this.readEntityFact('State', MAP_ENTITY_KINDS.STATE, province?.state),
      this.readEntityFact('Capital', MAP_ENTITY_KINDS.BURG, province?.burg),
      this.readNeighbourFact(ref),
    ];
  }

  private readBurgFacts(ref: iMapEntityRef): iMapFact[] {
    const burg = this.model.catalog.readBurg(ref.id);
    if (!burg) return [];

    const cell = this.model.data.pack.cells[burg.cell];
    const people = this.units.readPeople(0, burg.population ?? 0);
    return [
      { label: 'Population', parts: [this.textPart(this.units.formatPeople(people))] },
      this.readEntityFact(burg.capital ? 'Capital of' : 'State', MAP_ENTITY_KINDS.STATE, burg.state),
      this.readEntityFact('Province', MAP_ENTITY_KINDS.PROVINCE, cell?.province),
      this.readEntityFact('Culture', MAP_ENTITY_KINDS.CULTURE, burg.culture),
      this.readEntityFact('Religion', MAP_ENTITY_KINDS.RELIGION, cell?.religion),
      { label: 'Port', parts: burg.port ? [this.textPart('yes')] : [] },
      this.readNeighbourFact(ref, 'Nearby'),
    ];
  }

  private readMarkerFacts(ref: iMapEntityRef): iMapFact[] {
    const marker = this.model.catalog.readMarker(ref.id);
    if (!marker) return [];

    const cell = this.model.data.pack.cells[marker.cell];
    return [
      { label: 'Type', parts: marker.type ? [this.textPart(marker.type)] : [] },
      this.readEntityFact('State', MAP_ENTITY_KINDS.STATE, cell?.state),
      this.readEntityFact('Province', MAP_ENTITY_KINDS.PROVINCE, cell?.province),
      this.readEntityFact('Nearest burg', MAP_ENTITY_KINDS.BURG, this.readNearestBurg(marker.x, marker.y)),
      this.readNeighbourFact(ref, 'Nearby'),
    ];
  }

  private readZoneFacts(ref: iMapEntityRef): iMapFact[] {
    const zone = this.model.catalog.readZone(ref.id);
    const cells = this.model.geometry.readCells(ref);
    const states = [...new Set(cells.map((cellId) => this.model.data.pack.cells[cellId]?.state ?? 0))];
    return [
      { label: 'Type', parts: zone?.type ? [this.textPart(zone.type)] : [] },
      ...this.readAreaFacts(ref),
      { label: 'States', parts: this.entityParts(MAP_ENTITY_KINDS.STATE, states) },
      this.readNeighbourFact(ref),
    ];
  }

  private readAreaFacts(ref: iMapEntityRef): iMapFact[] {
    const cells = this.model.geometry.readCells(ref);
    const { rural, urban } = this.statistics.readPopulationPoints(cells);
    return [
      { label: 'Area', parts: [this.textPart(this.units.formatArea(this.statistics.readRawArea(cells)))] },
      {
        label: 'Population',
        parts: [this.textPart(this.units.formatPeople(this.units.readPeople(rural, urban)))],
      },
    ];
  }

  private readTerrainFacts(cells: number[]): iMapFact[] {
    const { catalog } = this.model;
    const riverNames = this.statistics.readRivers(cells).flatMap((river) => catalog.readRiverName(river) ?? []);
    const rivers = riverNames.slice(0, LISTED_RIVER_COUNT).map((name) => this.textPart(name));
    if (riverNames.length > LISTED_RIVER_COUNT) {
      rivers.push(this.textPart(`${riverNames.length - LISTED_RIVER_COUNT} more`));
    }
    const biomeShares = this.statistics.readDominantBiomes(cells);
    const biomes = biomeShares.flatMap(({ biome, share }) => {
      const name = catalog.readBiomeName(biome);
      if (!name) return [];
      return [this.textPart(biomeShares.length > 1 ? `${name} (${Math.round(share * PERCENT)}%)` : name)];
    });

    const climate = this.statistics.readClimate(cells);
    const temperature = climate
      ? this.units.formatRange(
          this.units.formatTemperature(climate.temperature.min),
          this.units.formatTemperature(climate.temperature.max),
        )
      : null;
    const precipitation = climate
      ? this.units.formatRange(
          this.units.formatPrecipitation(climate.precipitation.min),
          this.units.formatPrecipitation(climate.precipitation.max),
        )
      : null;

    return [
      { label: rivers.length > 1 ? 'Rivers' : 'River', parts: rivers },
      { label: biomes.length > 1 ? 'Biomes' : 'Biome', parts: biomes },
      { label: 'Temperature', parts: temperature ? [this.textPart(temperature)] : [] },
      { label: 'Precipitation', parts: precipitation ? [this.textPart(precipitation)] : [] },
    ];
  }

  private readNeighbourFact(ref: iMapEntityRef, label = 'Neighbours'): iMapFact {
    return {
      label,
      parts: this.model.neighbours.read(ref).map((entity) => ({ kind: MAP_FACT_PART_KIND_CASES.ENTITY, entity })),
    };
  }

  private readEntityFact(label: string, kind: MapEntityKind, id: number | undefined): iMapFact {
    return { label, parts: id === undefined ? [] : this.entityParts(kind, [id]) };
  }

  private entityParts(kind: MapEntityKind, ids: number[]): MapFactPart[] {
    return ids.flatMap((id) => {
      const entity = this.model.catalog.find({ kind, id });
      return entity ? [{ kind: MAP_FACT_PART_KIND_CASES.ENTITY, entity }] : [];
    });
  }

  private readNearestBurg(x: number, y: number): number | undefined {
    const { catalog } = this.model;
    let nearest: { id: number; distance: number } | undefined;
    for (const { id } of catalog.list(MAP_ENTITY_KINDS.BURG)) {
      const burg = catalog.readBurg(id);
      const distance = burg ? Math.hypot(burg.x - x, burg.y - y) : Infinity;
      if (!nearest || distance < nearest.distance) nearest = { id, distance };
    }
    return nearest?.id;
  }

  private textPart(text: string): MapFactPart {
    return { kind: MAP_FACT_PART_KIND_CASES.TEXT, text };
  }
}
