import { em } from 'enumwaii';

import type { iMapEntitySummary } from '../entities/map-entity.types';

const mapFactPartKindsEnumwaii = em(['TEXT', 'ENTITY']);
export const MAP_FACT_PART_KIND_CASES = mapFactPartKindsEnumwaii.cases;

interface iMapFactText {
  kind: typeof MAP_FACT_PART_KIND_CASES.TEXT;
  text: string;
}

/** Another map entity, written as a link when a note stands for it. */
interface iMapFactEntity {
  kind: typeof MAP_FACT_PART_KIND_CASES.ENTITY;
  entity: iMapEntitySummary;
}

export type MapFactPart = iMapFactText | iMapFactEntity;

/** One line of the facts block: a label and the parts after it, listed with commas. */
export interface iMapFact {
  label: string;
  parts: MapFactPart[];
}
