import type { MapEntityKind } from './map-entity.constants';

/** One entity of one map, by FMG's own id, which survives renames on both sides. */
export interface iMapEntityRef {
  kind: MapEntityKind;
  id: number;
}

/** What a note's `fmg-*` properties hold: the entity and the `.map` it belongs to. */
export interface iMapEntityLink extends iMapEntityRef {
  /** The vault path of the linked map, or the link as written when it leads to no file. */
  map: string;
}

export interface iMapEntitySummary extends iMapEntityRef {
  name: string;
}
