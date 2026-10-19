import { z } from 'zod';

import { mapBlockTargetSchema, parseMapBlockOptions } from '../map-blocks/map-block-options.schema';

/** The `fmg-map` code block's language, as written after the opening fence. */
export const FMG_MINIMAP_BLOCK_LANGUAGE = 'fmg-map';

export const MINIMAP_HEIGHT_PX = { default: 320, min: 120, max: 1200 } as const;

/** The entity to show, as any map block names it, and the mini-map's height. */
const minimapBlockSchema = mapBlockTargetSchema.extend({
  height: z.number().int().min(MINIMAP_HEIGHT_PX.min).max(MINIMAP_HEIGHT_PX.max).optional(),
});
export type MinimapBlockOptions = z.infer<typeof minimapBlockSchema>;

export function parseMinimapBlockOptions(yaml: unknown): MinimapBlockOptions | string {
  return parseMapBlockOptions(minimapBlockSchema, FMG_MINIMAP_BLOCK_LANGUAGE, yaml);
}
