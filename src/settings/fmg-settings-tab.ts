import { PluginSettingTab, Setting } from 'obsidian';
import type { App, Plugin } from 'obsidian';

import {
  MAP_ENTITY_KIND_VALUES,
  readMapEntityFolder,
  readMapEntityKindFormat,
  writeMapEntityFolder,
} from '../entities/map-entity.constants';
import type { MapEntityKind } from '../entities/map-entity.constants';
import { FMG_PIN } from '../fmg/fmg-pin';
import { MAP_EXPORT_KIND_VALUES, readMapExportFormat } from '../map/map-export.constants';
import type { MapExportKind } from '../map/map-export.constants';
import { buildMapExportPath } from '../map/map-file-paths';
import type { iPluginSettingsStore } from './plugin-settings';

const NEW_NOTE_LOCATION_PLACEHOLDER = 'Default location for new notes';

export class FmgSettingsTab extends PluginSettingTab {
  public constructor(
    app: App,
    plugin: Plugin,
    private readonly store: iPluginSettingsStore,
  ) {
    super(app, plugin);
  }

  public display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Maps folder')
      .setDesc('Where "New map" creates .map files. Created when missing.')
      .addText((text) =>
        text
          .setPlaceholder('Maps')
          .setValue(this.store.read().mapsFolder)
          .onChange(async (mapsFolder) => this.store.update({ mapsFolder })),
      );

    new Setting(containerEl).setName('Exports on save').setHeading();
    for (const kind of MAP_EXPORT_KIND_VALUES) this.addExportToggle(containerEl, kind);

    new Setting(containerEl)
      .setName('New note folders')
      .setDesc(
        'Where "Create note" in the map link report puts notes of each kind. Leave empty for Obsidian\'s default location for new notes. Linked notes are found by their properties, in any folder.',
      )
      .setHeading();
    for (const kind of MAP_ENTITY_KIND_VALUES) this.addEntityFolderSetting(containerEl, kind);

    new Setting(containerEl)
      .setName('Fantasy Map Generator version')
      .setDesc(`${FMG_PIN.tag} (${FMG_PIN.commit.slice(0, 7)}), bundled with the plugin. MIT licence: LICENSE-FMG.`);
  }

  private addEntityFolderSetting(containerEl: HTMLElement, kind: MapEntityKind) {
    new Setting(containerEl).setName(`${readMapEntityKindFormat(kind).label} notes`).addText((text) =>
      text
        .setPlaceholder(NEW_NOTE_LOCATION_PLACEHOLDER)
        .setValue(readMapEntityFolder(this.store.read().entityFolders, kind))
        .onChange(async (folder) =>
          this.store.update({ entityFolders: writeMapEntityFolder(this.store.read().entityFolders, kind, folder) }),
        ),
    );
  }

  private addExportToggle(containerEl: HTMLElement, kind: MapExportKind) {
    const format = readMapExportFormat(kind);
    new Setting(containerEl)
      .setName(format.label)
      .setDesc(`${format.description} Written as ${buildMapExportPath('<map>.map', kind)}.`)
      .addToggle((toggle) =>
        toggle.setValue(this.store.read().exportKinds.includes(kind)).onChange(async (isEnabled) => {
          const others = this.store.read().exportKinds.filter((enabled) => enabled !== kind);
          return this.store.update({ exportKinds: isEnabled ? [...others, kind] : others });
        }),
      );
  }
}
