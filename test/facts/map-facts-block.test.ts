import { describe, expect, it } from 'vitest';

import { MAP_ENTITY_KINDS } from '../../src/entities/map-entity.constants';
import { MapFactsBlock } from '../../src/facts/map-facts-block';
import type { iMapFactsBlockContent } from '../../src/facts/map-facts-block';
import { MAP_FACT_PART_KIND_CASES } from '../../src/facts/map-facts.types';

const NOTE = '---\nfmg:\n  kind: STATE\n---\n# Ostmark\n\nThe old kingdom by the Lenn.\n';

function renderBlock(content: Partial<iMapFactsBlockContent> = {}) {
  return new MapFactsBlock().render({
    facts: [{ label: 'Area', parts: [{ kind: MAP_FACT_PART_KIND_CASES.TEXT, text: '1,600 km²' }] }],
    entityName: 'Ostmark',
    thumbnailPath: null,
    mapPath: 'Maps/Aster.map',
    mapName: 'Aster',
    readEntityLinkText: () => null,
    ...content,
  });
}

describe('MapFactsBlock', () => {
  it("appends the block after the note's own text, which stays as it was", () => {
    const block = new MapFactsBlock();
    const text = block.replaceIn(NOTE, renderBlock());

    expect(text.startsWith(NOTE)).toBe(true);
    expect(text.slice(NOTE.length)).toBe(`\n${renderBlock()}\n`);
  });

  it('replaces only the fenced block, keeping text before and after it', () => {
    const block = new MapFactsBlock();
    const withBlock = `${block.replaceIn(NOTE, renderBlock())}\n## Later notes\n\nWritten after the block.\n`;

    const refreshed = block.replaceIn(withBlock, renderBlock({ entityName: 'Ostmark Reborn' }));

    expect(refreshed).toContain('Map facts: Ostmark Reborn');
    expect(refreshed).not.toContain('Map facts: Ostmark\n');
    expect(refreshed.startsWith(NOTE)).toBe(true);
    expect(refreshed.endsWith('\n## Later notes\n\nWritten after the block.\n')).toBe(true);
  });

  it('refuses to replace a block whose end fence is gone, rather than take the text after it', () => {
    const block = new MapFactsBlock();
    const broken = block.replaceIn(NOTE, renderBlock()).replace('<!-- fmg-map-facts:end -->', '');

    expect(() => block.replaceIn(broken, renderBlock())).toThrow('not its end');
  });

  it('shows the thumbnail, and links an entity that has a note', () => {
    const rendered = renderBlock({
      thumbnailPath: 'Maps/Aster.fmg.state-1.png',
      facts: [
        {
          label: 'Neighbours',
          parts: [
            { kind: MAP_FACT_PART_KIND_CASES.ENTITY, entity: { kind: MAP_ENTITY_KINDS.STATE, id: 2, name: 'Westmere' } },
            { kind: MAP_FACT_PART_KIND_CASES.ENTITY, entity: { kind: MAP_ENTITY_KINDS.STATE, id: 3, name: 'Nordland' } },
          ],
        },
      ],
      readEntityLinkText: (entity) => (entity.id === 2 ? 'States/Westmere' : null),
    });

    expect(rendered).toContain('> ![[Maps/Aster.fmg.state-1.png|320]]');
    expect(rendered).toContain('> - **Neighbours:** [[States/Westmere|Westmere]], Nordland');
  });

  it('says so when the entity is no longer on the map', () => {
    expect(renderBlock({ facts: null })).toContain('no longer on the map');
  });
});
