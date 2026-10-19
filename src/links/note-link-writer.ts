import type { FileManager, TFile, Vault } from 'obsidian';
import { normalizePath } from 'obsidian';

import type { iMapEntityLink } from '../entities/map-entity.types';
import type { iLinkedNote, NoteLinkIndex } from './note-link-index';
import { buildNoteLinkFrontmatter, NOTE_LINK_FRONTMATTER_KEY } from './note-link.schema';

export type NoteLinkFileManager = Pick<FileManager, 'processFrontMatter'>;
export type NoteCreationVault = Pick<Vault, 'create' | 'createFolder' | 'getAbstractFileByPath'>;

const MAX_NAME_ATTEMPTS = 100;
/** Characters a file name cannot hold on some platform, or that Obsidian links read specially. */
const UNSAFE_FILE_NAME_CHARACTERS = /[\/:*?"<>|#^[\]]/gu;

/** Writes links into notes' frontmatter, and creates notes for entities that have none. */
export class NoteLinkWriter {
  public constructor(
    private readonly vault: NoteCreationVault,
    private readonly fileManager: NoteLinkFileManager,
    private readonly noteLinkIndex: NoteLinkIndex,
  ) {}

  public async writeLink(file: TFile, link: iMapEntityLink) {
    await this.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
      frontmatter[NOTE_LINK_FRONTMATTER_KEY] = buildNoteLinkFrontmatter(link);
    });
  }

  /** Points every note linked to the map at its new path, and returns those notes with their new links. */
  public async followMapRename(oldMapPath: string, newMapPath: string): Promise<iLinkedNote[]> {
    const movedNotes = this.noteLinkIndex
      .listLinkedNotes(oldMapPath)
      .map(({ file, link }) => ({ file, link: { ...link, map: newMapPath } }));
    for (const { file, link } of movedNotes) await this.writeLink(file, link);
    return movedNotes;
  }

  /** A new note named after the entity in `folder`, created when missing, with the link in its frontmatter. */
  public async createLinkedNote(folder: string, entityName: string, link: iMapEntityLink): Promise<TFile> {
    const folderPath = normalizePath(folder.trim());
    const isVaultRoot = folderPath === '/';
    if (!isVaultRoot && !this.vault.getAbstractFileByPath(folderPath)) await this.vault.createFolder(folderPath);

    const file = await this.vault.create(this.chooseFreePath(isVaultRoot ? '' : folderPath, entityName), '');
    await this.writeLink(file, link);
    return file;
  }

  private chooseFreePath(folder: string, entityName: string): string {
    const baseName = entityName.replace(UNSAFE_FILE_NAME_CHARACTERS, ' ').trim() || 'Untitled';
    for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt += 1) {
      const name = attempt === 0 ? baseName : `${baseName} ${attempt + 1}`;
      const path = folder ? `${folder}/${name}.md` : `${name}.md`;
      if (!this.vault.getAbstractFileByPath(path)) return path;
    }
    throw new Error(`No free name for a note on ${entityName} in "${folder || '/'}".`);
  }
}
