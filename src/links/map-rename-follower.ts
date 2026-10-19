import { TFile, TFolder } from 'obsidian';
import type { Vault } from 'obsidian';

import { buildMapGeneratedFilePrefix } from '../map/map-file-paths';
import type { iLinkedNotesReport, LinkedNotesRefresher } from './linked-notes-refresher';
import type { NoteLinkWriter } from './note-link-writer';

export type MapRenameVault = Pick<Vault, 'getAbstractFileByPath' | 'getRoot' | 'rename'>;

/**
 * Keeps a moved or renamed map whole: its exports and thumbnails move with it, its notes link to its new path, and
 * their facts blocks point at the moved thumbnails.
 */
export class MapRenameFollower {
  public constructor(
    private readonly vault: MapRenameVault,
    private readonly noteLinkWriter: NoteLinkWriter,
    private readonly linkedNotesRefresher: LinkedNotesRefresher,
  ) {}

  public async follow(mapFile: TFile, oldMapPath: string): Promise<iLinkedNotesReport> {
    await this.moveGeneratedFiles(oldMapPath, mapFile.path);
    const movedNotes = await this.noteLinkWriter.followMapRename(oldMapPath, mapFile.path);
    return this.linkedNotesRefresher.rewriteFromExports(mapFile, movedNotes);
  }

  /** `Maps/Old.fmg.png` becomes `Maps/New.fmg.png`, and so on for every export and thumbnail; a taken name is left. */
  private async moveGeneratedFiles(oldMapPath: string, newMapPath: string) {
    const oldPrefix = buildMapGeneratedFilePrefix(oldMapPath);
    const newPrefix = buildMapGeneratedFilePrefix(newMapPath);
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
