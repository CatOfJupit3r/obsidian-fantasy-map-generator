import { normalizePath, TFile } from 'obsidian';
import type { MetadataCache, Vault } from 'obsidian';

import { readMapEntityKindFormat } from '../entities/map-entity.constants';
import type { iMapEntityLink, iMapEntityRef, iMapEntitySummary } from '../entities/map-entity.types';
import type { NoteLinkIndex } from '../links/note-link-index';
import type { FmgMapModel } from '../map-data/fmg-map-model';
import type { FmgMapRepository } from '../map-data/fmg-map-repository';
import { MAP_FILE_EXTENSION } from '../map/map-file-paths';
import type { MapBlockTarget } from './map-block-options.schema';

export type MapBlockVault = Pick<Vault, 'getAbstractFileByPath' | 'getFiles'>;
export type MapBlockMetadata = Pick<MetadataCache, 'getFirstLinkpathDest'>;

export interface iMapBlockTarget {
  mapFile: TFile;
  model: FmgMapModel;
  entity: iMapEntitySummary;
}

/**
 * Which map and entity a map code block shows: the entity it names, else the one the note it names stands for, else
 * the one its own note stands for; on the map it names, else that entity's map, else the vault's only map.
 */
export class MapBlockTargetResolver {
  public constructor(
    private readonly vault: MapBlockVault,
    private readonly metadataCache: MapBlockMetadata,
    private readonly noteLinkIndex: NoteLinkIndex,
    private readonly mapRepository: FmgMapRepository,
  ) {}

  /** Throws with a message for the reader when the block names nothing that is on a map. */
  public async resolve(options: MapBlockTarget, sourcePath: string): Promise<iMapBlockTarget> {
    const link = options.note ? this.readNamedNoteLink(options.note, sourcePath) : this.readOwnLink(sourcePath);
    const mapFile = this.resolveMapFile(options.map ?? link?.map, sourcePath);
    const model = await this.mapRepository.read(mapFile.path);
    const ref = options.kind ? this.resolveNamedRef(options, model) : link;
    if (!ref) {
      throw new Error(
        'This note links to no map entity. Name one in the block, such as "note: [[Ostmark]]" or "kind: state" with "name: Ostmark".',
      );
    }

    const entity = model.catalog.find(ref);
    if (!entity) throw new Error(`${mapFile.path} has no ${readMapEntityKindFormat(ref.kind).label} ${ref.id}.`);
    return { mapFile, model, entity };
  }

  private readOwnLink(sourcePath: string): iMapEntityLink | null {
    const sourceFile = this.vault.getAbstractFileByPath(sourcePath);
    return sourceFile instanceof TFile ? this.noteLinkIndex.readLink(sourceFile) : null;
  }

  private readNamedNoteLink(linkpath: string, sourcePath: string): iMapEntityLink {
    const note = this.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
    if (!note) throw new Error(`No note at ${linkpath}.`);
    const link = this.noteLinkIndex.readLink(note);
    if (!link) throw new Error(`${note.basename} links to no map entity. Run "Link note to map entity" on it first.`);
    return link;
  }

  private resolveMapFile(mapLinkpath: string | undefined, sourcePath: string): TFile {
    if (!mapLinkpath) return this.readOnlyMap();

    const file =
      this.metadataCache.getFirstLinkpathDest(mapLinkpath, sourcePath) ??
      this.vault.getAbstractFileByPath(normalizePath(mapLinkpath));
    if (!(file instanceof TFile) || file.extension !== MAP_FILE_EXTENSION) throw new Error(`No map at ${mapLinkpath}.`);
    return file;
  }

  private readOnlyMap(): TFile {
    const maps = this.vault.getFiles().filter((file) => file.extension === MAP_FILE_EXTENSION);
    const [onlyMap] = maps;
    if (onlyMap && maps.length === 1) return onlyMap;
    if (maps.length === 0) throw new Error('The vault has no .map files. Run "New map" to create one.');
    throw new Error(`Name the map in the block, such as "map: [[${maps[0]?.name ?? ''}]]"; the vault has ${maps.length}.`);
  }

  private resolveNamedRef(options: MapBlockTarget, model: FmgMapModel): iMapEntityRef | null {
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
