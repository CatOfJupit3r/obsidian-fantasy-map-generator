import type { TFile } from 'obsidian';

import { buildNewMapPath, normalizeMapsFolder } from './map-file-paths';
import type { MapVault } from './map.types';

const MAX_NAME_ATTEMPTS = 1000;

/** Creates an empty `.map` file under a free name in the maps folder, creating the folder when it is missing. */
export class NewMapCreator {
  public constructor(private readonly vault: MapVault) {}

  public async create(mapsFolder: string): Promise<TFile> {
    const folder = normalizeMapsFolder(mapsFolder);
    if (folder && !this.vault.getAbstractFileByPath(folder)) await this.vault.createFolder(folder);

    return this.vault.create(this.chooseFreePath(folder), '');
  }

  private chooseFreePath(folder: string): string {
    for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt += 1) {
      const path = buildNewMapPath(folder, attempt);
      if (!this.vault.getAbstractFileByPath(path)) return path;
    }

    throw new Error(`No free name for a new map in "${folder || '/'}".`);
  }
}
