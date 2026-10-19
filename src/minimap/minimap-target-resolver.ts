import { normalizePath, TFile } from 'obsidian';
import type { MetadataCache, Vault } from 'obsidian';

import { readMapEntityKindFormat } from '../entities/map-entity.constants';
import type { iMapEntityRef, iMapEntitySummary } from '../entities/map-entity.types';
import type { NoteLinkIndex } from '../links/note-link-index';
import type { FmgMapModel } from '../map-data/fmg-map-model';
import type { FmgMapRepository } from '../map-data/fmg-map-repository';
import { MAP_FILE_EXTENSION } from '../map/map-file-paths';
import type { MinimapBlockOptions } from './fmg-minimap-block.schema';

export type MinimapVault = Pick<Vault, 'getAbstractFileByPath'>;
export type MinimapMetadata = Pick<MetadataCache, 'getFirstLinkpathDest'>;

export interface iMinimapTarget {
  mapFile: TFile;
  model: FmgMapModel;
  entity: iMapEntitySummary;
}

/** Which map and entity an `fmg-map` block shows: the ones it names, else the ones its note links to. */
export class MinimapTargetResolver {
  public constructor(
    private readonly vault: MinimapVault,
    private readonly metadataCache: MinimapMetadata,
    private readonly noteLinkIndex: NoteLinkIndex,
    private readonly mapRepository: FmgMapRepository,
  ) {}

  /** Throws with a message for the reader when the block names nothing that is on a map. */
  public async resolve(options: MinimapBlockOptions, sourcePath: string): Promise<iMinimapTarget> {
    const sourceFile = this.vault.getAbstractFileByPath(sourcePath);
    const noteLink = sourceFile instanceof TFile ? this.noteLinkIndex.readLink(sourceFile) : null;

    const mapFile = this.resolveMapFile(options.map ?? noteLink?.map, sourcePath);
    const model = await this.mapRepository.read(mapFile.path);
    const ref = options.kind ? this.resolveNamedRef(options, model) : noteLink;
    if (!ref) {
      throw new Error('This note links to no map entity. Name one in the block, for example "kind: STATE" and "id: 7".');
    }

    const entity = model.catalog.find(ref);
    if (!entity) throw new Error(`${mapFile.path} has no ${readMapEntityKindFormat(ref.kind).label} ${ref.id}.`);
    return { mapFile, model, entity };
  }

  private resolveMapFile(mapLink: string | undefined, sourcePath: string): TFile {
    if (!mapLink) throw new Error('Name the map in the block ("map: Maps/Aster.map") or link the note to an entity.');

    const file =
      this.metadataCache.getFirstLinkpathDest(mapLink, sourcePath) ??
      this.vault.getAbstractFileByPath(normalizePath(mapLink));
    if (!(file instanceof TFile) || file.extension !== MAP_FILE_EXTENSION) throw new Error(`No map at ${mapLink}.`);
    return file;
  }

  private resolveNamedRef(options: MinimapBlockOptions, model: FmgMapModel): iMapEntityRef | null {
    const { kind, id, name } = options;
    if (!kind) return null;
    if (id !== undefined) return { kind, id };
    if (name) {
      const named = model.catalog.findByName(kind, name);
      if (!named) throw new Error(`The map has no ${readMapEntityKindFormat(kind).label} named ${name}.`);
      return named;
    }
    throw new Error(`Give the ${readMapEntityKindFormat(kind).label} an "id" or a "name" in the block.`);
  }
}
