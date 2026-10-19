import type { App, Editor, Plugin, TFile } from 'obsidian';

import type { iMapEntitySummary } from '../entities/map-entity.types';
import { FMG_FACTS_BLOCK_LANGUAGE } from '../facts/fmg-facts-block.schema';
import type { MapEntityPicker } from '../links/map-entity-picker';
import type { NoteLinkIndex } from '../links/note-link-index';
import type { FmgMapRepository } from '../map-data/fmg-map-repository';
import { FMG_MINIMAP_BLOCK_LANGUAGE } from '../minimap/fmg-minimap-block.schema';
import { showNotice } from '../show-notice';

const CODE_FENCE = '```';

export interface iMapBlockInsertCommandsDependencies {
  app: App;
  noteLinkIndex: NoteLinkIndex;
  mapRepository: FmgMapRepository;
  mapEntityPicker: MapEntityPicker;
}

/** "Insert mini-map" and "Insert map facts": pick a map and an entity, and get a block that shows it at the cursor. */
export class MapBlockInsertCommands {
  public constructor(private readonly dependencies: iMapBlockInsertCommandsDependencies) {}

  public register(plugin: Plugin) {
    plugin.addCommand({
      id: 'insert-minimap',
      name: 'Insert mini-map',
      editorCallback: (editor, context) => this.runInBackground(this.insert(editor, context.file, FMG_MINIMAP_BLOCK_LANGUAGE)),
    });
    plugin.addCommand({
      id: 'insert-map-facts',
      name: 'Insert map facts',
      editorCallback: (editor, context) => this.runInBackground(this.insert(editor, context.file, FMG_FACTS_BLOCK_LANGUAGE)),
    });
  }

  private async insert(editor: Editor, note: TFile | null, language: string) {
    const { noteLinkIndex, mapRepository, mapEntityPicker } = this.dependencies;
    const ownLink = note ? noteLinkIndex.readLink(note) : null;
    const mapFile = await mapEntityPicker.chooseMap(ownLink?.map);
    if (!mapFile) return;

    const entity = await mapEntityPicker.chooseEntity(mapFile.path, await mapRepository.read(mapFile.path));
    if (!entity) return;

    const isOwnEntity = ownLink?.map === mapFile.path && ownLink.kind === entity.kind && ownLink.id === entity.id;
    const options = isOwnEntity ? [] : this.buildOptions(note, mapFile, entity);
    editor.replaceSelection(`${CODE_FENCE}${language}\n${options.map((line) => `${line}\n`).join('')}${CODE_FENCE}\n`);
  }

  /**
   * The lines that name the entity: its note when it has one, which keeps the block right when the entity is renamed
   * in FMG; else its kind and id on the map, the map left out when it is the vault's only one.
   */
  private buildOptions(note: TFile | null, mapFile: TFile, entity: iMapEntitySummary): string[] {
    const { app, noteLinkIndex, mapEntityPicker } = this.dependencies;
    const sourcePath = note?.path ?? '';
    const entityNote = noteLinkIndex.findNote(mapFile.path, entity);
    if (entityNote) return [`note: "[[${app.metadataCache.fileToLinktext(entityNote, sourcePath, true)}]]"`];

    const lines = [`kind: ${entity.kind.toLowerCase()}`, `id: ${entity.id} # ${entity.name}`];
    if (mapEntityPicker.listMaps().length === 1) return lines;
    return [`map: "[[${app.metadataCache.fileToLinktext(mapFile, sourcePath, false)}]]"`, ...lines];
  }

  private runInBackground(operation: Promise<unknown>) {
    void operation.catch((error: unknown) => {
      showNotice(`Could not insert the block: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
}
