import type { MapEntityKind } from './map-entity.constants';

/** One entity of one map, by FMG's own id, which survives renames on both sides. */
export interface iMapEntityRef {
  kind: MapEntityKind;
  id: number;
}

/** What a note's `fmg` frontmatter holds: the entity and the vault path of the `.map` it belongs to. */
export interface iMapEntityLink extends iMapEntityRef {
  map: string;
}

export interface iMapEntitySummary extends iMapEntityRef {
  name: string;
}
