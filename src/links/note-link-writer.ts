import { normalizePath, TFile } from 'obsidian';
import type { FileManager, MetadataCache, Vault } from 'obsidian';

import type { iMapEntityRef } from '../entities/map-entity.types';
import { NOTE_LINK_PROPERTIES } from './note-link.schema';

export type NoteLinkFileManager = Pick<FileManager, 'processFrontMatter' | 'getNewFileParent'>;
export type NoteLinkLinktextMetadata = Pick<MetadataCache, 'fileToLinktext'>;
export type NoteCreationVault = Pick<Vault, 'create' | 'createFolder' | 'getAbstractFileByPath'>;

const MAX_NAME_ATTEMPTS = 100;
/** Characters a file name cannot hold on some platform, or that Obsidian links read specially. */
const UNSAFE_FILE_NAME_CHARACTERS = /[\/:*?"<>|#^[\]]/gu;

/** Writes links into notes' frontmatter, and creates notes for entities that have none. */
export class NoteLinkWriter {
  public constructor(
    private readonly vault: NoteCreationVault,
    private readonly fileManager: NoteLinkFileManager,
    private readonly metadataCache: NoteLinkLinktextMetadata,
  ) {}

  public async writeLink(note: TFile, mapFile: TFile, ref: iMapEntityRef) {
    await this.fileManager.processFrontMatter(note, (frontmatter: Record<string, unknown>) => {
      Object.assign(frontmatter, this.buildProperties(note, mapFile, ref));
    });
  }

  /** The link's properties; `map` is the map's file, or a vault path written as it is when no file is there. */
  public buildProperties(note: TFile, map: TFile | string, ref: iMapEntityRef): Record<string, string | number> {
    const mapLinktext = map instanceof TFile ? this.metadataCache.fileToLinktext(map, note.path, false) : map;
    return {
      [NOTE_LINK_PROPERTIES.MAP]: `[[${mapLinktext}]]`,
      [NOTE_LINK_PROPERTIES.KIND]: ref.kind.toLowerCase(),
      [NOTE_LINK_PROPERTIES.ID]: ref.id,
    };
  }

  /**
   * A new note named after the entity, with the link in its frontmatter: in `folder`, created when missing, or where
   * Obsidian puts new notes when `folder` is empty.
   */
  public async createLinkedNote(folder: string, entityName: string, mapFile: TFile, ref: iMapEntityRef): Promise<TFile> {
    const file = await this.vault.create(this.chooseFreePath(await this.readFolderPath(folder), entityName), '');
    await this.writeLink(file, mapFile, ref);
    return file;
  }

  /** The folder's vault path, with the empty string for the vault root. */
  private async readFolderPath(folder: string): Promise<string> {
    if (folder.trim() === '') return this.readVaultPath(this.fileManager.getNewFileParent('').path);

    const folderPath = this.readVaultPath(folder);
    if (folderPath && !this.vault.getAbstractFileByPath(folderPath)) await this.vault.createFolder(folderPath);
    return folderPath;
  }

  private readVaultPath(folder: string): string {
    const normalized = normalizePath(folder.trim());
    return normalized === '/' ? '' : normalized;
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
