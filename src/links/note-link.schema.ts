import { z } from 'zod';

import { mapEntityKindSchema } from '../entities/map-entity.constants';
import type { iMapEntityLink } from '../entities/map-entity.types';

/** The frontmatter key of the link: `fmg: { map: Maps/Aster.map, kind: STATE, id: 7 }`. */
export const NOTE_LINK_FRONTMATTER_KEY = 'fmg';

const noteLinkSchema = z.object({
  map: z.string().trim().min(1),
  kind: mapEntityKindSchema,
  id: z.number().int().nonnegative(),
});
const frontmatterSchema = z.object({ [NOTE_LINK_FRONTMATTER_KEY]: noteLinkSchema });

/** The note's link to a map entity, or null when its frontmatter has none or one this plugin does not read. */
export function readNoteLink(frontmatter: unknown): iMapEntityLink | null {
  const parsed = frontmatterSchema.safeParse(frontmatter);
  return parsed.success ? parsed.data[NOTE_LINK_FRONTMATTER_KEY] : null;
}

/** The link as it goes into frontmatter, with `map` first since a world can hold several maps. */
export function buildNoteLinkFrontmatter(link: iMapEntityLink) {
  return { map: link.map, kind: link.kind, id: link.id };
}
