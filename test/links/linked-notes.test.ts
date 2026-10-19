import { describe, expect, it } from 'vitest';

import { MAP_ENTITY_KINDS } from '../../src/entities/map-entity.constants';
import { buildLinkReport } from '../../src/links/link-report';
import { LinkedNotesRefresher } from '../../src/links/linked-notes-refresher';
import { MapRenameFollower } from '../../src/links/map-rename-follower';
import { NoteLinkIndex } from '../../src/links/note-link-index';
import { NoteLinkWriter } from '../../src/links/note-link-writer';
import { readNoteLink } from '../../src/links/note-link.schema';
import { FmgMapRepository } from '../../src/map-data/fmg-map-repository';
import { MAP_EXPORT_KINDS } from '../../src/map/map-export.constants';
import type { MapExportKind } from '../../src/map/map-export.constants';
import { buildFakeMapExportText } from '../utils/fake-fmg-map';
import { FakeMapEditor } from '../utils/fake-map-editor';
import { FakeMetadata } from '../utils/fake-metadata';
import { FakeVault } from '../utils/fake-vault';

const MAP_PATH = 'Maps/Aster.map';
const OSTMARK_PROSE = '# Ostmark\n\nThe old kingdom by the Lenn. Its people distrust the sea.\n';

/** A vault with the map, its JSON export, and a note per given link. */
function setUpVault(exportKinds: MapExportKind[] = [MAP_EXPORT_KINDS.JSON]) {
  const vault = new FakeVault();
  const metadata = new FakeMetadata();
  vault.seedFolder('Maps');
  vault.seedFolder('States');
  const mapFile = vault.seedFile(MAP_PATH, 'map text');
  vault.seedFile('Maps/Aster.fmg.json', new TextEncoder().encode(buildFakeMapExportText()).buffer);

  const noteLinkIndex = new NoteLinkIndex(vault, metadata);
  const mapRepository = new FmgMapRepository(vault);
  const refresher = new LinkedNotesRefresher(vault, metadata, noteLinkIndex, mapRepository, () => exportKinds);
  const noteLinkWriter = new NoteLinkWriter(vault, metadata, noteLinkIndex);

  const seedLinkedNote = (path: string, prose: string, kind = MAP_ENTITY_KINDS.STATE, id = 1) => {
    const file = vault.seedFile(path, prose);
    metadata.setFrontmatter(file, { fmg: { map: MAP_PATH, kind, id } });
    return file;
  };
  return { vault, metadata, mapFile, noteLinkIndex, refresher, noteLinkWriter, seedLinkedNote };
}

describe('readNoteLink', () => {
  it('reads the map, kind and id, and ignores links it cannot read', () => {
    expect(readNoteLink({ fmg: { map: MAP_PATH, kind: 'STATE', id: 7 } })).toEqual({
      map: MAP_PATH,
      kind: MAP_ENTITY_KINDS.STATE,
      id: 7,
    });
    expect(readNoteLink({ fmg: { kind: 'STATE', id: 7 } })).toBeNull();
    expect(readNoteLink({ fmg: { map: MAP_PATH, kind: 'RIVER', id: 7 } })).toBeNull();
    expect(readNoteLink({ title: 'no link' })).toBeNull();
  });
});

describe('LinkedNotesRefresher.refresh', () => {
  it("writes the facts block and the entity's thumbnail, and leaves the note's own text untouched", async () => {
    const { vault, mapFile, refresher, seedLinkedNote } = setUpVault();
    seedLinkedNote('States/Ostmark.md', OSTMARK_PROSE);
    seedLinkedNote('States/Westmere.md', '# Westmere\n', MAP_ENTITY_KINDS.STATE, 2);
    const editor = new FakeMapEditor('map text');

    const report = await refresher.refresh(mapFile, editor);

    expect(report).toEqual({ noteCount: 2, thumbnailCount: 2, failures: [] });
    const note = vault.readText('States/Ostmark.md') ?? '';
    expect(note.startsWith(OSTMARK_PROSE)).toBe(true);
    expect(note).toContain('> ![[Maps/Aster.fmg.state-1.png|320]]');
    expect(note).toContain('> - **Neighbours:** [[States/Westmere|Westmere]]');
    expect(vault.readBytes('Maps/Aster.fmg.state-1.png')).toBeDefined();
    expect(editor.regionRequests[0]?.[0]?.width).toBeGreaterThan(0);
  });

  it('replaces the block on the next save instead of adding another one', async () => {
    const { vault, mapFile, refresher, seedLinkedNote } = setUpVault();
    seedLinkedNote('States/Ostmark.md', OSTMARK_PROSE);
    const editor = new FakeMapEditor('map text');

    await refresher.refresh(mapFile, editor);
    const afterFirstSave = vault.readText('States/Ostmark.md');
    await refresher.refresh(mapFile, editor);

    expect(vault.readText('States/Ostmark.md')).toBe(afterFirstSave);
  });

  it('asks the editor for the JSON when the JSON export is turned off, without writing it', async () => {
    const { vault, mapFile, refresher, seedLinkedNote } = setUpVault([MAP_EXPORT_KINDS.PNG]);
    seedLinkedNote('States/Ostmark.md', OSTMARK_PROSE);
    const editor = new FakeMapEditor('map text');
    editor.jsonExport = buildFakeMapExportText();

    await refresher.refresh(mapFile, editor);

    expect(editor.exportRequests).toEqual([[MAP_EXPORT_KINDS.JSON]]);
    expect(vault.readText('States/Ostmark.md')).toContain('Map facts: Ostmark');
  });

  it('touches nothing when no note links to the map', async () => {
    const { mapFile, refresher } = setUpVault();
    const editor = new FakeMapEditor('map text');

    expect(await refresher.refresh(mapFile, editor)).toEqual({ noteCount: 0, thumbnailCount: 0, failures: [] });
    expect(editor.regionRequests).toEqual([]);
  });
});

describe('MapRenameFollower', () => {
  it('keeps the links when the map is renamed: notes, exports, thumbnails and blocks follow it', async () => {
    const { vault, metadata, mapFile, refresher, noteLinkWriter, seedLinkedNote } = setUpVault();
    const note = seedLinkedNote('States/Ostmark.md', OSTMARK_PROSE);
    await refresher.refresh(mapFile, new FakeMapEditor('map text'));

    await vault.rename(mapFile, 'Maps/Atlas.map');
    await new MapRenameFollower(vault, noteLinkWriter, refresher).follow(mapFile, MAP_PATH);

    expect(metadata.readFrontmatter(note)).toEqual({ fmg: { map: 'Maps/Atlas.map', kind: 'STATE', id: 1 } });
    expect(vault.listPaths()).toContain('Maps/Atlas.fmg.json');
    expect(vault.listPaths()).toContain('Maps/Atlas.fmg.state-1.png');
    expect(vault.listPaths()).not.toContain('Maps/Aster.fmg.json');
    const text = vault.readText('States/Ostmark.md') ?? '';
    expect(text.startsWith(OSTMARK_PROSE)).toBe(true);
    expect(text).toContain('![[Maps/Atlas.fmg.state-1.png|320]]');
  });
});

describe('buildLinkReport', () => {
  it("lists the map's entities with no note and the folder notes with no entity", async () => {
    const { vault, metadata, noteLinkIndex, seedLinkedNote } = setUpVault();
    seedLinkedNote('States/Ostmark.md', OSTMARK_PROSE);
    const unlinked = vault.seedFile('States/Lost Kingdom.md', 'No link here.');
    const gone = seedLinkedNote('States/Fallen.md', 'Removed in FMG.', MAP_ENTITY_KINDS.STATE, 9);
    const otherMap = vault.seedFile('States/Elsewhere.md', 'On another map.');
    metadata.setFrontmatter(otherMap, { fmg: { map: 'Maps/Other.map', kind: 'STATE', id: 1 } });
    vault.seedFile('Maps/Other.map', 'other map');
    const model = await new FmgMapRepository(vault).read(MAP_PATH);

    const report = buildLinkReport({
      mapPath: MAP_PATH,
      catalog: model.catalog,
      linkedNotes: noteLinkIndex.listLinkedNotes(),
      folderNotes: vault.getMarkdownFiles(),
      hasMap: (path) => vault.getAbstractFileByPath(path) !== null,
    });

    expect(report.unmatchedNotes).toEqual([unlinked, gone]);
    expect(report.unlinkedEntities.some((entity) => entity.kind === MAP_ENTITY_KINDS.STATE && entity.id === 1)).toBe(
      false,
    );
    expect(report.unlinkedEntities.map((entity) => entity.name)).toContain('Westmere');
  });
});
