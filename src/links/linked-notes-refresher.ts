import type { MetadataCache, TFile, Vault } from 'obsidian';

import type { iMapEntityRef } from '../entities/map-entity.types';
import { MapFactsBlock } from '../facts/map-facts-block';
import { MapFactsCalculator } from '../facts/map-facts.calculator';
import type { FmgMapModel } from '../map-data/fmg-map-model';
import type { FmgMapRepository } from '../map-data/fmg-map-repository';
import { MAP_EXPORT_KINDS } from '../map/map-export.constants';
import type { MapExportKind } from '../map/map-export.constants';
import { buildEntityThumbnailPath } from '../map/map-file-paths';
import type { iMapEditor } from '../map/map.types';
import { VaultBinaryWriter } from '../map/vault-binary-writer';
import type { BinaryWriteVault } from '../map/vault-binary-writer';
import { EntityThumbnailWriter } from './entity-thumbnail-writer';
import type { iLinkedNote, NoteLinkIndex } from './note-link-index';

interface iRefreshContext {
  mapFile: TFile;
  model: FmgMapModel;
  calculator: MapFactsCalculator;
  thumbnails: Set<string>;
  /** The note linked to each entity of the map, by `KIND:id`. */
  notesByEntity: Map<string, TFile>;
}

export type LinkedNotesVault = BinaryWriteVault & Pick<Vault, 'process'>;
export type LinkTextMetadata = Pick<MetadataCache, 'fileToLinktext'>;
export type LinkedNotesEditor = Pick<iMapEditor, 'exportMap' | 'renderRegions'>;

export interface iLinkedNotesReport {
  noteCount: number;
  thumbnailCount: number;
  /** Notes whose block could not be written, each with the reason. */
  failures: string[];
}

/** After a save: renders each linked entity's thumbnail and rewrites the generated facts block of each linked note. */
export class LinkedNotesRefresher {
  private readonly factsBlock = new MapFactsBlock();

  private readonly thumbnailWriter: EntityThumbnailWriter;

  public constructor(
    private readonly vault: LinkedNotesVault,
    private readonly metadataCache: LinkTextMetadata,
    private readonly noteLinkIndex: NoteLinkIndex,
    private readonly mapRepository: FmgMapRepository,
    private readonly readExportKinds: () => MapExportKind[],
  ) {
    this.thumbnailWriter = new EntityThumbnailWriter(new VaultBinaryWriter(vault));
  }

  public async refresh(mapFile: TFile, editor: LinkedNotesEditor): Promise<iLinkedNotesReport> {
    const linkedNotes = this.noteLinkIndex.listLinkedNotes(mapFile.path);
    if (linkedNotes.length === 0) return { noteCount: 0, thumbnailCount: 0, failures: [] };

    const model = await this.readModel(mapFile, editor);
    const presentLinks = linkedNotes.map(({ link }) => link).filter((link) => model.catalog.has(link));
    const thumbnails = await this.thumbnailWriter.write(mapFile.path, model, presentLinks, editor);
    return this.writeFactsBlocks(mapFile, model, linkedNotes, thumbnails);
  }

  /**
   * Rewrites the facts blocks from the exports and thumbnails already next to the map, with no editor: after the map
   * moved, say. The notes are passed in, since Obsidian reads their rewritten frontmatter only a moment later.
   */
  public async rewriteFromExports(mapFile: TFile, linkedNotes: iLinkedNote[]): Promise<iLinkedNotesReport> {
    if (linkedNotes.length === 0) return { noteCount: 0, thumbnailCount: 0, failures: [] };

    const model = await this.mapRepository.read(mapFile.path);
    const thumbnails = new Set(
      linkedNotes
        .map(({ link }) => buildEntityThumbnailPath(mapFile.path, link))
        .filter((path) => this.vault.getAbstractFileByPath(path)),
    );
    return this.writeFactsBlocks(mapFile, model, linkedNotes, thumbnails);
  }

  private async writeFactsBlocks(
    mapFile: TFile,
    model: FmgMapModel,
    linkedNotes: iLinkedNote[],
    thumbnails: Set<string>,
  ): Promise<iLinkedNotesReport> {
    const context: iRefreshContext = {
      mapFile,
      model,
      calculator: new MapFactsCalculator(model),
      thumbnails,
      notesByEntity: new Map(linkedNotes.map(({ file, link }) => [this.readEntityKey(link), file])),
    };
    const failures: string[] = [];
    for (const linkedNote of linkedNotes) {
      try {
        await this.writeFactsBlock(context, linkedNote);
      } catch (error) {
        failures.push(`${linkedNote.file.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { noteCount: linkedNotes.length - failures.length, thumbnailCount: thumbnails.size, failures };
  }

  /** The export the save just wrote, or, with the JSON export off, one asked of the editor and not kept. */
  private async readModel(mapFile: TFile, editor: LinkedNotesEditor): Promise<FmgMapModel> {
    if (this.readExportKinds().includes(MAP_EXPORT_KINDS.JSON)) return this.mapRepository.read(mapFile.path);

    const [exported] = await editor.exportMap([MAP_EXPORT_KINDS.JSON]);
    if (!exported) throw new Error('FMG returned no JSON export.');
    return this.mapRepository.parse(exported.data);
  }

  private async writeFactsBlock(context: iRefreshContext, { file, link }: iLinkedNote) {
    const { mapFile, model, thumbnails, notesByEntity } = context;
    const thumbnailPath = buildEntityThumbnailPath(mapFile.path, link);
    const block = this.factsBlock.render({
      facts: context.calculator.calculate(link),
      entityName: model.catalog.find(link)?.name ?? null,
      thumbnailPath: thumbnails.has(thumbnailPath) ? thumbnailPath : null,
      mapPath: mapFile.path,
      mapName: mapFile.basename,
      readEntityLinkText: (entity) => {
        const note = notesByEntity.get(this.readEntityKey(entity));
        return note ? this.metadataCache.fileToLinktext(note, file.path, true) : null;
      },
    });
    await this.vault.process(file, (text) => this.factsBlock.replaceIn(text, block));
  }

  private readEntityKey(ref: iMapEntityRef): string {
    return `${ref.kind}:${ref.id}`;
  }
}
