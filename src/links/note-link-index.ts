import { getLinkpath } from 'obsidian';
import type { MetadataCache, TFile, Vault } from 'obsidian';

import type { iMapEntityLink, iMapEntityRef } from '../entities/map-entity.types';
import { NOTE_LINK_PROPERTIES, readNoteLinkEntity } from './note-link.schema';

export type NoteLinkMetadata = Pick<MetadataCache, 'getFileCache' | 'getFirstLinkpathDest'>;
export type NoteLinkVault = Pick<Vault, 'getMarkdownFiles'>;

export interface iLinkedNote {
  file: TFile;
  link: iMapEntityLink;
}

/**
 * Which notes stand for which map entities, read from Obsidian's frontmatter cache on every call, so renames, edits and
 * deletions on either side are always reflected.
 */
export class NoteLinkIndex {
  public constructor(
    private readonly vault: NoteLinkVault,
    private readonly metadataCache: NoteLinkMetadata,
  ) {}

  public readLink(file: TFile): iMapEntityLink | null {
    const cache = this.metadataCache.getFileCache(file);
    const entity = readNoteLinkEntity(cache?.frontmatter);
    const mapLink = cache?.frontmatterLinks?.find((link) => link.key === NOTE_LINK_PROPERTIES.MAP);
    if (!entity || !mapLink) return null;

    const linkpath = getLinkpath(mapLink.link);
    const mapFile = this.metadataCache.getFirstLinkpathDest(linkpath, file.path);
    return {
      map: mapFile?.path ?? linkpath,
      kind: entity[NOTE_LINK_PROPERTIES.KIND],
      id: entity[NOTE_LINK_PROPERTIES.ID],
    };
  }

  /** Every linked note, or only those linked to the map at `mapPath`. */
  public listLinkedNotes(mapPath?: string): iLinkedNote[] {
    return this.vault.getMarkdownFiles().flatMap((file) => {
      const link = this.readLink(file);
      return link && (mapPath === undefined || link.map === mapPath) ? [{ file, link }] : [];
    });
  }

  public findNote(mapPath: string, ref: iMapEntityRef): TFile | null {
    return (
      this.listLinkedNotes(mapPath).find(({ link }) => link.kind === ref.kind && link.id === ref.id)?.file ?? null
    );
  }
}
