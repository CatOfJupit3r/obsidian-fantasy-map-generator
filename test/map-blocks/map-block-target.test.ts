import { describe, expect, it } from 'vitest';

import { MAP_ENTITY_KINDS } from '../../src/entities/map-entity.constants';
import { NoteLinkIndex } from '../../src/links/note-link-index';
import { mapBlockTargetSchema, parseMapBlockOptions } from '../../src/map-blocks/map-block-options.schema';
import type { MapBlockTarget } from '../../src/map-blocks/map-block-options.schema';
import { MapBlockTargetResolver } from '../../src/map-blocks/map-block-target-resolver';
import { FmgMapRepository } from '../../src/map-data/fmg-map-repository';
import { buildFakeMapExportText } from '../utils/fake-fmg-map';
import { FakeMetadata } from '../utils/fake-metadata';
import { FakeVault } from '../utils/fake-vault';

const MAP_PATH = 'Maps/Aster.map';

function parseOptions(yaml: unknown): MapBlockTarget | string {
  return parseMapBlockOptions(mapBlockTargetSchema, 'fmg-facts', yaml);
}

/** A vault with one map, its JSON export, a note linked to Ostmark and an unrelated page. */
function setUpVault() {
  const vault = new FakeVault();
  const metadata = new FakeMetadata(vault);
  vault.seedFolder('Maps');
  vault.seedFile(MAP_PATH, 'map text');
  vault.seedFile('Maps/Aster.fmg.json', new TextEncoder().encode(buildFakeMapExportText()).buffer);
  const ostmark = vault.seedFile('Ostmark.md', '');
  metadata.setFrontmatter(ostmark, { 'fmg-map': `[[${MAP_PATH}]]`, 'fmg-kind': 'state', 'fmg-id': 1 });
  vault.seedFile('Travelogue.md', '');

  const noteLinkIndex = new NoteLinkIndex(vault, metadata);
  const resolver = new MapBlockTargetResolver(vault, metadata, noteLinkIndex, new FmgMapRepository(vault));
  const resolve = async (yaml: unknown, sourcePath = 'Travelogue.md') => {
    const options = parseOptions(yaml);
    if (typeof options === 'string') throw new Error(options);
    return resolver.resolve(options, sourcePath);
  };
  return { vault, resolve };
}

describe('map block options', () => {
  it('reads a map link quoted, unquoted or as a plain path, without its alias or heading', () => {
    expect(parseOptions({ map: '[[Aster.map|the atlas]]' })).toEqual({ map: 'Aster.map' });
    expect(parseOptions({ map: [['Aster.map']] })).toEqual({ map: 'Aster.map' });
    expect(parseOptions({ map: 'Maps/Aster.map' })).toEqual({ map: 'Maps/Aster.map' });
    expect(parseOptions({ note: '[[Ostmark#History]]' })).toEqual({ note: 'Ostmark' });
  });

  it('names the option that is wrong', () => {
    expect(parseOptions({ map: '[[]]' })).toMatch(/^The fmg-facts block has an invalid map/u);
  });
});

describe('MapBlockTargetResolver', () => {
  it('shows a named entity on an unrelated page, on the vault\'s only map', async () => {
    const { resolve } = setUpVault();

    const target = await resolve({ kind: 'state', name: 'westmere' });

    expect(target.mapFile.path).toBe(MAP_PATH);
    expect(target.entity).toEqual({ kind: MAP_ENTITY_KINDS.STATE, id: 2, name: 'Westmere' });
  });

  it("borrows the link of the note it names, and falls back to its own note's link", async () => {
    const { resolve } = setUpVault();

    expect((await resolve({ note: '[[Ostmark]]' })).entity.name).toBe('Ostmark');
    expect((await resolve({}, 'Ostmark.md')).entity.name).toBe('Ostmark');
    await expect(resolve({ note: '[[Travelogue]]' })).rejects.toThrow(/Travelogue links to no map entity/u);
    await expect(resolve({})).rejects.toThrow(/links to no map entity/u);
  });

  it('asks for the map once the vault has several', async () => {
    const { vault, resolve } = setUpVault();
    vault.seedFile('Maps/Other.map', 'other map');

    await expect(resolve({ kind: 'state', id: 2 })).rejects.toThrow(/Name the map in the block.*the vault has 2/u);
    expect((await resolve({ map: '[[Aster.map]]', kind: 'state', id: 2 })).entity.name).toBe('Westmere');
  });
});
