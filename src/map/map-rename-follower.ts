import { TFile, TFolder } from 'obsidian';
import type { Vault } from 'obsidian';

import { buildMapGeneratedFilePrefix } from './map-file-paths';

export type MapRenameVault = Pick<Vault, 'getAbstractFileByPath' | 'getRoot' | 'rename'>;

/**
 * Keeps a moved or renamed map whole: its exports move with it. Notes link to the map with a `[[...]]` property, which
 * Obsidian itself updates on rename.
 */
export class MapRenameFollower {
  public constructor(private readonly vault: MapRenameVault) {}

  /** `Maps/Old.fmg.png` becomes `Maps/New.fmg.png`, and so on for every export; a taken name is left. */
  public async follow(mapFile: TFile, oldMapPath: string) {
    const oldPrefix = buildMapGeneratedFilePrefix(oldMapPath);
    const newPrefix = buildMapGeneratedFilePrefix(mapFile.path);
    const separator = oldMapPath.lastIndexOf('/');
    const folder = separator === -1 ? this.vault.getRoot() : this.vault.getAbstractFileByPath(oldMapPath.slice(0, separator));
    if (!(folder instanceof TFolder)) return;

    const generatedFiles = folder.children.filter(
      (child): child is TFile => child instanceof TFile && child.path.startsWith(oldPrefix),
    );
    for (const file of generatedFiles) {
      const newPath = `${newPrefix}${file.path.slice(oldPrefix.length)}`;
      if (!this.vault.getAbstractFileByPath(newPath)) await this.vault.rename(file, newPath);
    }
  }
}
