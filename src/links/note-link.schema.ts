import { z } from 'zod';

import { mapEntityKindSchema } from '../entities/map-entity.constants';

/**
 * The frontmatter properties of a note's link to a map entity, flat so the Properties view edits them and Bases and
 * Dataview filter on them. `fmg-map` is a real link, which Obsidian keeps up to date when the map moves:
 *
 * ```yaml
 * fmg-map: "[[Maps/Aster.map]]"
 * fmg-kind: state
 * fmg-id: 7
 * ```
 */
export const NOTE_LINK_PROPERTIES = {
  MAP: 'fmg-map',
  KIND: 'fmg-kind',
  ID: 'fmg-id',
} as const;

const noteLinkEntitySchema = z.object({
  [NOTE_LINK_PROPERTIES.KIND]: z
    .string()
    .transform((kind) => kind.trim().toUpperCase())
    .pipe(mapEntityKindSchema),
  [NOTE_LINK_PROPERTIES.ID]: z.number().int().nonnegative(),
});
export type NoteLinkEntityProperties = z.infer<typeof noteLinkEntitySchema>;

/** The kind and id properties of the note's link, or null when its frontmatter has none or ones this plugin cannot read. */
export function readNoteLinkEntity(frontmatter: unknown): NoteLinkEntityProperties | null {
  const parsed = noteLinkEntitySchema.safeParse(frontmatter);
  return parsed.success ? parsed.data : null;
}
