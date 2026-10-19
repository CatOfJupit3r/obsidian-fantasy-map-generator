import { mapBlockTargetSchema, parseMapBlockOptions } from '../map-blocks/map-block-options.schema';
import type { MapBlockTarget } from '../map-blocks/map-block-options.schema';

/** The `fmg-facts` code block's language, as written after the opening fence. */
export const FMG_FACTS_BLOCK_LANGUAGE = 'fmg-facts';

/** The entity whose facts to list; an empty block lists those of the entity the note links to. */
export function parseFactsBlockOptions(yaml: unknown): MapBlockTarget | string {
  return parseMapBlockOptions(mapBlockTargetSchema, FMG_FACTS_BLOCK_LANGUAGE, yaml);
}
