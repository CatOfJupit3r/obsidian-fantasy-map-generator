import { MAP_ENTITY_KINDS, MAP_ENTITY_KIND_VALUES, readMapEntityKindFormat } from '../entities/map-entity.constants';
import type { MapEntityKind } from '../entities/map-entity.constants';
import type { iMapEntityRef, iMapEntitySummary } from '../entities/map-entity.types';
import type {
  FmgBurg,
  FmgMapData,
  FmgMarker,
  FmgNamedEntity,
  FmgProvince,
  FmgState,
  FmgZone,
} from './fmg-map-data.schema';

/** Kinds whose id 0 is FMG's placeholder: neutral lands, wildlands, no religion, or an empty first item. */
const KINDS_WITHOUT_ID_ZERO = new Set<MapEntityKind>([
  MAP_ENTITY_KINDS.STATE,
  MAP_ENTITY_KINDS.PROVINCE,
  MAP_ENTITY_KINDS.BURG,
  MAP_ENTITY_KINDS.CULTURE,
  MAP_ENTITY_KINDS.RELIGION,
]);

type CatalogEntity = FmgNamedEntity & { type?: string };

/** The map's linkable entities by kind and id, without removed ones and FMG's placeholders. */
export class MapEntityCatalog {
  private readonly entitiesByKind = new Map<MapEntityKind, Map<number, CatalogEntity>>();

  private readonly burgs: Map<number, FmgBurg>;

  private readonly markers: Map<number, FmgMarker>;

  private readonly zones: Map<number, FmgZone>;

  private readonly states: Map<number, FmgState>;

  private readonly provinces: Map<number, FmgProvince>;

  private readonly biomeNames: Map<number, string>;

  private readonly riverNames: Map<number, string>;

  public constructor(data: FmgMapData) {
    const { pack } = data;
    this.burgs = this.indexLinkable(MAP_ENTITY_KINDS.BURG, pack.burgs);
    this.markers = this.indexLinkable(MAP_ENTITY_KINDS.MARKER, pack.markers);
    this.zones = this.indexLinkable(MAP_ENTITY_KINDS.ZONE, pack.zones);
    this.states = this.indexLinkable(MAP_ENTITY_KINDS.STATE, pack.states);
    this.provinces = this.indexLinkable(MAP_ENTITY_KINDS.PROVINCE, pack.provinces);
    this.indexLinkable(MAP_ENTITY_KINDS.CULTURE, pack.cultures);
    this.indexLinkable(MAP_ENTITY_KINDS.RELIGION, pack.religions);
    this.biomeNames = this.indexNames(pack.biomes);
    this.riverNames = this.indexNames(pack.rivers);
  }

  public list(kind: MapEntityKind): iMapEntitySummary[] {
    return [...(this.entitiesByKind.get(kind)?.values() ?? [])].map((entity) => this.summarize(kind, entity));
  }

  public listAll(): iMapEntitySummary[] {
    return MAP_ENTITY_KIND_VALUES.flatMap((kind) => this.list(kind));
  }

  public has(ref: iMapEntityRef): boolean {
    return this.entitiesByKind.get(ref.kind)?.has(ref.id) ?? false;
  }

  public find(ref: iMapEntityRef): iMapEntitySummary | null {
    const entity = this.entitiesByKind.get(ref.kind)?.get(ref.id);
    return entity ? this.summarize(ref.kind, entity) : null;
  }

  /** The first entity of the kind with that name, ignoring case. */
  public findByName(kind: MapEntityKind, name: string): iMapEntitySummary | null {
    const wanted = name.trim().toLowerCase();
    return this.list(kind).find((entity) => entity.name.toLowerCase() === wanted) ?? null;
  }

  /** The entity's name, or null for id 0 and unknown ids. */
  public readName(kind: MapEntityKind, id: number | undefined): string | null {
    return id === undefined ? null : (this.find({ kind, id })?.name ?? null);
  }

  /** The color FMG fills the entity's area with, or null when it has none. */
  public readColor(ref: iMapEntityRef): string | null {
    return this.entitiesByKind.get(ref.kind)?.get(ref.id)?.color ?? null;
  }

  public readBurg(id: number): FmgBurg | null {
    return this.burgs.get(id) ?? null;
  }

  public readMarker(id: number): FmgMarker | null {
    return this.markers.get(id) ?? null;
  }

  public readZone(id: number): FmgZone | null {
    return this.zones.get(id) ?? null;
  }

  public listZones(): FmgZone[] {
    return [...this.zones.values()];
  }

  public readState(id: number): FmgState | null {
    return this.states.get(id) ?? null;
  }

  public readProvince(id: number): FmgProvince | null {
    return this.provinces.get(id) ?? null;
  }

  public readBiomeName(id: number): string | null {
    return this.biomeNames.get(id) ?? null;
  }

  public readRiverName(id: number): string | null {
    return this.riverNames.get(id) ?? null;
  }

  private indexLinkable<TEntity extends CatalogEntity>(kind: MapEntityKind, entities: TEntity[]): Map<number, TEntity> {
    const isPlaceholder = (entity: TEntity) => entity.i === 0 && KINDS_WITHOUT_ID_ZERO.has(kind);
    const index = new Map(
      entities.filter((entity) => !entity.removed && !isPlaceholder(entity)).map((entity) => [entity.i, entity]),
    );
    this.entitiesByKind.set(kind, index);
    return index;
  }

  private indexNames(entities: FmgNamedEntity[]): Map<number, string> {
    return new Map(
      entities.flatMap((entity) => (entity.name && !entity.removed ? [[entity.i, entity.name] as const] : [])),
    );
  }

  private summarize(kind: MapEntityKind, entity: CatalogEntity): iMapEntitySummary {
    const name = entity.name || entity.type || `${readMapEntityKindFormat(kind).label} ${entity.i}`;
    return { kind, id: entity.i, name };
  }
}
