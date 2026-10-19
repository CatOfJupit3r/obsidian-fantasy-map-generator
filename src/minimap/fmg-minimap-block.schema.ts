import { z } from 'zod';

import { mapEntityKindSchema } from '../entities/map-entity.constants';

/** The `fmg-map` code block's language, as written after the opening fence. */
export const FMG_MINIMAP_BLOCK_LANGUAGE = 'fmg-map';

export const MINIMAP_HEIGHT_PX = { default: 320, min: 120, max: 1200 } as const;

/**
 * What an `fmg-map` block may say, as YAML lines; every line is optional. Without `kind`, the block shows the entity
 * the note links to; `map` defaults to the linked map.
 *
 * ```fmg-map
 * kind: STATE
 * name: Ostmark
 * ```
 */
const minimapBlockSchema = z.object({
  map: z.string().trim().min(1).optional(),
  kind: z
    .string()
    .transform((kind) => kind.trim().toUpperCase())
    .pipe(mapEntityKindSchema)
    .optional(),
  id: z.number().int().nonnegative().optional(),
  name: z.coerce.string().trim().min(1).optional(),
  height: z.number().int().min(MINIMAP_HEIGHT_PX.min).max(MINIMAP_HEIGHT_PX.max).optional(),
});
export type MinimapBlockOptions = z.infer<typeof minimapBlockSchema>;

/** The block's options, or a message naming what is wrong with them. */
export function parseMinimapBlockOptions(yaml: unknown): MinimapBlockOptions | string {
  const parsed = minimapBlockSchema.safeParse(yaml ?? {});
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  return `The fmg-map block has an invalid ${issue?.path.join('.') || 'option'}: ${issue?.message ?? 'unreadable'}.`;
}
