import { TFile } from 'obsidian';
import type { App } from 'obsidian';

import { readMapEntityKindFormat } from '../entities/map-entity.constants';
import type { iMapEntitySummary } from '../entities/map-entity.types';
import type { FmgMapModel } from '../map-data/fmg-map-model';
import { MAP_FILE_EXTENSION } from '../map/map-file-paths';
import { showNotice } from '../show-notice';
import { chooseFromSuggestions } from './choice-suggest.modal';
import type { NoteLinkIndex } from './note-link-index';

/** Asks the reader for a map and for an entity on it. */
export class MapEntityPicker {
  public constructor(
    private readonly app: App,
    private readonly noteLinkIndex: NoteLinkIndex,
  ) {}

  /** The map at `preferredMapPath`, the vault's only map, or the one picked from the vault's maps. */
  public async chooseMap(preferredMapPath: string | undefined): Promise<TFile | null> {
    const preferredMap = preferredMapPath ? this.app.vault.getAbstractFileByPath(preferredMapPath) : null;
    if (preferredMap instanceof TFile) return preferredMap;

    const maps = this.listMaps();
    if (maps.length === 0) {
      showNotice('The vault has no .map files. Run "New map" to create one.');
      return null;
    }
    if (maps.length === 1) return maps[0] ?? null;
    return chooseFromSuggestions(this.app, { items: maps, readText: (file) => file.path, placeholder: 'Pick a map' });
  }

  public async chooseEntity(mapPath: string, model: FmgMapModel): Promise<iMapEntitySummary | null> {
    const linkedNames = new Map(
      this.noteLinkIndex.listLinkedNotes(mapPath).map(({ file, link }) => [`${link.kind}:${link.id}`, file.basename]),
    );
    return chooseFromSuggestions(this.app, {
      items: model.catalog.listAll(),
      readText: (entity) => {
        const linkedTo = linkedNames.get(`${entity.kind}:${entity.id}`);
        const label = readMapEntityKindFormat(entity.kind).label;
        return linkedTo ? `${entity.name} · ${label} · linked to ${linkedTo}` : `${entity.name} · ${label}`;
      },
      placeholder: 'Pick the state, province, burg, culture, religion, marker or zone',
    });
  }

  public listMaps(): TFile[] {
    return this.app.vault.getFiles().filter((file) => file.extension === MAP_FILE_EXTENSION);
  }
}
