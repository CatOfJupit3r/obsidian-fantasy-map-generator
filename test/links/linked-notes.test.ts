import { describe, expect, it } from 'vitest';

import { MAP_ENTITY_KINDS } from '../../src/entities/map-entity.constants';
import { buildLinkReport } from '../../src/links/link-report';
import { NoteLinkIndex } from '../../src/links/note-link-index';
import { NoteLinkMigration } from '../../src/links/note-link-migration';
import { NoteLinkWriter } from '../../src/links/note-link-writer';
import { FmgMapRepository } from '../../src/map-data/fmg-map-repository';
import { MapRenameFollower } from '../../src/map/map-rename-follower';
import { buildFakeMapExportText } from '../utils/fake-fmg-map';
import { FakeMetadata } from '../utils/fake-metadata';
import { FakeVault } from '../utils/fake-vault';

const MAP_PATH = 'Maps/Aster.map';
const OSTMARK_PROSE = '# Ostmark\n\nThe old kingdom by the Lenn. Its people distrust the sea.\n';

/** A vault with the map and its JSON export. */
function setUpVault() {
  const vault = new FakeVault();
  const metadata = new FakeMetadata(vault);
  vault.seedFolder('Maps');
  const mapFile = vault.seedFile(MAP_PATH, 'map text');
  vault.seedFile('Maps/Aster.fmg.json', new TextEncoder().encode(buildFakeMapExportText()).buffer);

  const noteLinkIndex = new NoteLinkIndex(vault, metadata);
  const noteLinkWriter = new NoteLinkWriter(vault, metadata, metadata);

  const seedLinkedNote = (path: string, prose: string, kind = 'state', id = 1, map = `[[${MAP_PATH}]]`) => {
    const file = vault.seedFile(path, prose);
    metadata.setFrontmatter(file, { 'fmg-map': map, 'fmg-kind': kind, 'fmg-id': id });
    return file;
  };
  return { vault, metadata, mapFile, noteLinkIndex, noteLinkWriter, seedLinkedNote };
}

describe('NoteLinkIndex.readLink', () => {
  it('resolves the map link to its file and reads the kind in any case', () => {
    const { noteLinkIndex, seedLinkedNote } = setUpVault();
    const byName = seedLinkedNote('Ostmark.md', OSTMARK_PROSE, 'State', 1, '[[Aster.map|the atlas]]');

    expect(noteLinkIndex.readLink(byName)).toEqual({ map: MAP_PATH, kind: MAP_ENTITY_KINDS.STATE, id: 1 });
  });

  it('keeps a link to a missing map as written, and ignores notes without a readable link', () => {
    const { vault, metadata, noteLinkIndex, seedLinkedNote } = setUpVault();
    const gone = seedLinkedNote('Gone.md', '', 'burg', 2, '[[Maps/Gone.map]]');
    const plainPath = seedLinkedNote('Plain.md', '', 'state', 1, MAP_PATH);
    const badKind = seedLinkedNote('River.md', '', 'river', 1);
    const noLink = vault.seedFile('Plain note.md', '');
    metadata.setFrontmatter(noLink, { title: 'no link' });

    expect(noteLinkIndex.readLink(gone)).toEqual({ map: 'Maps/Gone.map', kind: MAP_ENTITY_KINDS.BURG, id: 2 });
    expect(noteLinkIndex.readLink(plainPath)).toBeNull();
    expect(noteLinkIndex.readLink(badKind)).toBeNull();
    expect(noteLinkIndex.readLink(noLink)).toBeNull();
  });
});

describe('NoteLinkWriter', () => {
  it("writes the link as flat properties next to the note's own", async () => {
    const { vault, metadata, mapFile, noteLinkIndex, noteLinkWriter } = setUpVault();
    const note = vault.seedFile('Ostmark.md', OSTMARK_PROSE);
    metadata.setFrontmatter(note, { tags: ['realm'] });

    await noteLinkWriter.writeLink(note, mapFile, { kind: MAP_ENTITY_KINDS.STATE, id: 1 });

    expect(metadata.readFrontmatter(note)).toEqual({
      tags: ['realm'],
      'fmg-map': `[[${MAP_PATH}]]`,
      'fmg-kind': 'state',
      'fmg-id': 1,
    });
    expect(noteLinkIndex.readLink(note)).toEqual({ map: MAP_PATH, kind: MAP_ENTITY_KINDS.STATE, id: 1 });
  });

  it("creates a note where Obsidian puts new notes when the kind has no folder, and in the kind's folder otherwise", async () => {
    const { vault, mapFile, noteLinkWriter } = setUpVault();
    const ref = { kind: MAP_ENTITY_KINDS.BURG, id: 1 };

    const unfiled = await noteLinkWriter.createLinkedNote('', 'Ostburg', mapFile, ref);
    const filed = await noteLinkWriter.createLinkedNote('World/Burgs', 'Ostburg', mapFile, ref);

    expect(unfiled.path).toBe('Ostburg.md');
    expect(filed.path).toBe('World/Burgs/Ostburg.md');
  });
});

describe('NoteLinkMigration', () => {
  const LEGACY_CALLOUT = [
    '<!-- fmg-map-facts:start (generated on save; edits inside are replaced) -->',
    '> [!map-facts] Map facts: Ostmark',
    '> ![[Maps/Aster.fmg.state-1.png|320]]',
    '> - **Area:** 200 mi²',
    '<!-- fmg-map-facts:end -->',
  ].join('\n');

  function setUpLegacyVault() {
    const setUp = setUpVault();
    const { vault, metadata, noteLinkWriter } = setUp;
    vault.seedFile('Maps/Aster.fmg.png', 'whole map');
    vault.seedFile('Maps/Aster.fmg.state-1.png', 'thumbnail');
    vault.seedFile('Maps/Aster.fmg.burg-12.png', 'thumbnail');
    vault.seedFile('Maps/Aster state-1.png', 'not a thumbnail');
    const legacy = vault.seedFile('Ostmark.md', `${OSTMARK_PROSE}\n${LEGACY_CALLOUT}\n\n## History\n`);
    metadata.setFrontmatter(legacy, { aliases: ['Ost'], fmg: { map: MAP_PATH, kind: 'STATE', id: 1 } });
    const migration = new NoteLinkMigration(vault, metadata, metadata, noteLinkWriter);
    return { ...setUp, legacy, migration };
  }

  it('turns the nested link into flat properties and the written callout into live blocks in its place', async () => {
    const { vault, metadata, noteLinkIndex, legacy, migration } = setUpLegacyVault();

    const report = await migration.migrate();

    expect(report).toEqual({ noteCount: 1, thumbnailCount: 2, failures: [] });
    expect(metadata.readFrontmatter(legacy)).toEqual({
      aliases: ['Ost'],
      'fmg-map': `[[${MAP_PATH}]]`,
      'fmg-kind': 'state',
      'fmg-id': 1,
    });
    expect(noteLinkIndex.readLink(legacy)).toEqual({ map: MAP_PATH, kind: MAP_ENTITY_KINDS.STATE, id: 1 });
    expect(vault.readText('Ostmark.md')).toBe(
      `${OSTMARK_PROSE}\n\`\`\`fmg-map\n\`\`\`\n\n\`\`\`fmg-facts\n\`\`\`\n\n## History\n`,
    );
  });

  it('adds no second mini-map to a note that already shows one', async () => {
    const { vault, metadata, noteLinkWriter } = setUpVault();
    const note = vault.seedFile('Ostburg.md', `\`\`\`fmg-map\nheight: 260\n\`\`\`\n\n${LEGACY_CALLOUT}\n`);
    metadata.setFrontmatter(note, { fmg: { map: MAP_PATH, kind: 'BURG', id: 1 } });

    await new NoteLinkMigration(vault, metadata, metadata, noteLinkWriter).migrate();

    expect(vault.readText('Ostburg.md')).toBe('```fmg-map\nheight: 260\n```\n\n```fmg-facts\n```\n');
  });

  it('trashes only the baked thumbnails, and leaves a migrated vault alone', async () => {
    const { vault, metadata, migration } = setUpLegacyVault();

    await migration.migrate();

    expect(metadata.trashedPaths.sort()).toEqual(['Maps/Aster.fmg.burg-12.png', 'Maps/Aster.fmg.state-1.png']);
    expect(vault.listPaths()).toEqual(expect.arrayContaining(['Maps/Aster.fmg.png', 'Maps/Aster state-1.png']));
    expect(await migration.migrate()).toEqual({ noteCount: 0, thumbnailCount: 0, failures: [] });
  });
});

describe('MapRenameFollower', () => {
  it("moves the map's exports with it", async () => {
    const { vault, mapFile } = setUpVault();

    await vault.rename(mapFile, 'Maps/Atlas.map');
    await new MapRenameFollower(vault).follow(mapFile, MAP_PATH);

    expect(vault.listPaths()).toContain('Maps/Atlas.fmg.json');
    expect(vault.listPaths()).not.toContain('Maps/Aster.fmg.json');
  });
});

describe('buildLinkReport', () => {
  it("lists the map's entities with no note, and the linked notes that lead nowhere", async () => {
    const { vault, noteLinkIndex, seedLinkedNote } = setUpVault();
    seedLinkedNote('States/Ostmark.md', OSTMARK_PROSE);
    vault.seedFile('Lost Kingdom.md', 'No link here.');
    const goneEntity = seedLinkedNote('Fallen.md', 'Removed in FMG.', 'state', 9);
    const goneMap = seedLinkedNote('Elsewhere.md', 'On a deleted map.', 'state', 1, '[[Maps/Deleted.map]]');
    vault.seedFile('Maps/Other.map', 'other map');
    seedLinkedNote('Otherland.md', 'On another map.', 'state', 1, '[[Maps/Other.map]]');
    const model = await new FmgMapRepository(vault).read(MAP_PATH);

    const report = buildLinkReport({
      mapPath: MAP_PATH,
      catalog: model.catalog,
      linkedNotes: noteLinkIndex.listLinkedNotes(),
      hasMap: (path) => vault.getAbstractFileByPath(path) !== null,
    });

    expect(report.brokenNotes).toEqual([goneEntity, goneMap]);
    expect(report.unlinkedEntities.some((entity) => entity.kind === MAP_ENTITY_KINDS.STATE && entity.id === 1)).toBe(
      false,
    );
    expect(report.unlinkedEntities.map((entity) => entity.name)).toContain('Westmere');
  });
});
