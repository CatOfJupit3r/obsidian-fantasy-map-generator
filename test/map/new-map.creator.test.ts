import { describe, expect, it } from 'vitest';

import { NewMapCreator } from '../../src/map/new-map.creator';
import { FakeVault } from '../utils/fake-vault';

describe('NewMapCreator', () => {
  it('creates the maps folder when it is missing and an empty map inside it', async () => {
    const vault = new FakeVault();

    const file = await new NewMapCreator(vault).create('Worlds/Maps/');

    expect(file.path).toBe('Worlds/Maps/Untitled map.map');
    expect(vault.readText(file.path)).toBe('');
    expect(vault.listPaths()).toEqual(['Worlds/Maps', 'Worlds/Maps/Untitled map.map']);
  });

  it('picks the first free name in the folder', async () => {
    const vault = new FakeVault();
    vault.seedFolder('Maps');
    vault.seedFile('Maps/Untitled map.map', 'map');
    vault.seedFile('Maps/Untitled map 1.map', 'map');

    const file = await new NewMapCreator(vault).create('Maps');

    expect(file.path).toBe('Maps/Untitled map 2.map');
  });

  it('creates the map at the vault root when the folder is empty', async () => {
    const vault = new FakeVault();

    const file = await new NewMapCreator(vault).create(' / ');

    expect(file.path).toBe('Untitled map.map');
  });
});
