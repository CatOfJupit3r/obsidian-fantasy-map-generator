import type { iMapEntitySummary } from '../entities/map-entity.types';
import { MAP_FACT_PART_KIND_CASES } from './map-facts.types';
import type { iMapFact, MapFactPart } from './map-facts.types';

/** The fences around the generated block; everything between them belongs to the plugin, everything else to the note. */
const FACTS_BLOCK_START = '<!-- fmg-map-facts:start (generated on save; edits inside are replaced) -->';
const FACTS_BLOCK_END = '<!-- fmg-map-facts:end -->';
const FACTS_BLOCK_START_PREFIX = '<!-- fmg-map-facts:start';

const THUMBNAIL_EMBED_WIDTH = 320;
const CALLOUT_LINE_PREFIX = '> ';
const LINK_ALIAS_UNSAFE = /[[\]|]/gu;

export interface iMapFactsBlockContent {
  /** Null when the map no longer has the entity. */
  facts: iMapFact[] | null;
  entityName: string | null;
  /** Vault path of the entity's thumbnail, when one was rendered. */
  thumbnailPath: string | null;
  mapPath: string;
  mapName: string;
  /** The link text of the note that stands for an entity, or null when none does. */
  readEntityLinkText: (entity: iMapEntitySummary) => string | null;
}

/** Writes the generated `[!map-facts]` callout and puts it into a note without touching the note's own text. */
export class MapFactsBlock {
  public render(content: iMapFactsBlockContent): string {
    const lines = [`[!map-facts] Map facts${content.entityName ? `: ${content.entityName}` : ''}`];
    if (content.thumbnailPath) lines.push(`![[${content.thumbnailPath}|${THUMBNAIL_EMBED_WIDTH}]]`, '');

    if (content.facts) {
      for (const fact of content.facts) lines.push(`- **${fact.label}:** ${this.renderParts(fact.parts, content)}`);
    } else {
      lines.push('This entity is no longer on the map. Link the note again or remove its `fmg` frontmatter.');
    }

    lines.push('', `*Generated on save from ${this.renderLink(content.mapPath, content.mapName)}. Write outside this block.*`);
    return [FACTS_BLOCK_START, ...lines.map((line) => `${CALLOUT_LINE_PREFIX}${line}`.trimEnd()), FACTS_BLOCK_END].join(
      '\n',
    );
  }

  /**
   * The note with `block` in place of its generated block, or with `block` appended when it has none. Throws when the
   * note has a start fence without an end fence, since replacing then could take the note's own text with it.
   */
  public replaceIn(noteText: string, block: string): string {
    const start = noteText.indexOf(FACTS_BLOCK_START_PREFIX);
    if (start === -1) {
      const separator = noteText.length === 0 ? '' : noteText.endsWith('\n') ? '\n' : '\n\n';
      return `${noteText}${separator}${block}\n`;
    }

    const end = noteText.indexOf(FACTS_BLOCK_END, start);
    if (end === -1) throw new Error('The note has the start of a map facts block but not its end.');
    return `${noteText.slice(0, start)}${block}${noteText.slice(end + FACTS_BLOCK_END.length)}`;
  }

  private renderParts(parts: MapFactPart[], content: iMapFactsBlockContent): string {
    return parts
      .map((part) => {
        switch (part.kind) {
          case MAP_FACT_PART_KIND_CASES.TEXT:
            return part.text;
          case MAP_FACT_PART_KIND_CASES.ENTITY: {
            const linkText = content.readEntityLinkText(part.entity);
            return linkText ? this.renderLink(linkText, part.entity.name) : part.entity.name;
          }
          default:
            return '';
        }
      })
      .join(', ');
  }

  private renderLink(linkText: string, alias: string): string {
    return `[[${linkText}|${alias.replace(LINK_ALIAS_UNSAFE, ' ').trim()}]]`;
  }
}
