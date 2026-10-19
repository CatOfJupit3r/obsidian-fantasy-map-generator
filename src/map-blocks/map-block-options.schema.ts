import { getLinkpath } from 'obsidian';
import { z } from 'zod';

import { mapEntityKindSchema } from '../entities/map-entity.constants';

const WIKILINK_PATTERN = /^\[\[([^\]]*)\]\]$/u;
const LINK_ALIAS_SEPARATOR = '|';

/** The path a link value leads to: `[[Atlas.map|the atlas]]` and `Atlas.map` both give `Atlas.map`. */
function readLinkpath(value: string): string {
  const trimmed = value.trim();
  const inner = WIKILINK_PATTERN.exec(trimmed)?.[1] ?? trimmed;
  return getLinkpath(inner.split(LINK_ALIAS_SEPARATOR)[0] ?? '').trim();
}

/**
 * A link to a file: `"[[Atlas.map]]"`, a plain path, or an unquoted `[[Atlas.map]]`, which YAML reads as a list
 * holding a list.
 */
const linkSchema = z
  .union([z.string(), z.tuple([z.tuple([z.string()])]).transform(([[inner]]) => inner)])
  .transform(readLinkpath)
  .pipe(z.string().min(1));

/**
 * The entity a map code block shows, as YAML lines; every line is optional. `kind` with `id` or `name` names an
 * entity; `note` borrows the link of the note that stands for one; with neither, the block shows the entity its own
 * note links to. `map` defaults to the linked map, or to the vault's only map.
 *
 * ```fmg-facts
 * note: "[[Ostmark]]"
 * ```
 */
export const mapBlockTargetSchema = z.object({
  map: linkSchema.optional(),
  note: linkSchema.optional(),
  kind: z
    .string()
    .transform((kind) => kind.trim().toUpperCase())
    .pipe(mapEntityKindSchema)
    .optional(),
  id: z.number().int().nonnegative().optional(),
  name: z.coerce.string().trim().min(1).optional(),
});
export type MapBlockTarget = z.infer<typeof mapBlockTargetSchema>;

/** The block's options, or a message naming what is wrong with them. */
export function parseMapBlockOptions<TSchema extends z.ZodType>(
  schema: TSchema,
  language: string,
  yaml: unknown,
): z.output<TSchema> | string {
  const parsed = schema.safeParse(yaml ?? {});
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  return `The ${language} block has an invalid ${issue?.path.join('.') || 'option'}: ${issue?.message ?? 'unreadable'}.`;
}
