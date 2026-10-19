import { FileSystemAdapter, normalizePath, Plugin } from 'obsidian';

import { FMG_ASSET_ENTRY_FILE } from './fmg/fmg-asset-server.constants';
import { FMG_FACTS_BLOCK_LANGUAGE } from './facts/fmg-facts-block.schema';
import { FmgFactsRenderChild } from './facts/fmg-facts-render-child';
import { FmgAssetServer } from './fmg/fmg-asset-server';
import { MapEntityPicker } from './links/map-entity-picker';
import { MapLinkCommands } from './links/map-link-commands';
import { NoteLinkIndex } from './links/note-link-index';
import { NoteLinkMigration } from './links/note-link-migration';
import type { iNoteLinkMigrationReport } from './links/note-link-migration';
import { NoteLinkWriter } from './links/note-link-writer';
import { MapBlockInsertCommands } from './map-blocks/map-block-insert-commands';
import type { iMapBlockHost } from './map-blocks/map-block-render-child';
import { MapBlockTargetResolver } from './map-blocks/map-block-target-resolver';
import { FmgMapRepository } from './map-data/fmg-map-repository';
import { FMG_MAP_VIEW_TYPE, FmgMapView } from './map/fmg-map-view';
import { MAP_FILE_EXTENSION } from './map/map-file-paths';
import { MapRenameFollower } from './map/map-rename-follower';
import { NewMapCreator } from './map/new-map.creator';
import { FMG_MINIMAP_BLOCK_LANGUAGE } from './minimap/fmg-minimap-block.schema';
import { FmgMinimapRenderChild } from './minimap/fmg-minimap-render-child';
import { MinimapAreaPaths } from './minimap/minimap-area-paths';
import { MinimapBackdropVariants } from './minimap/minimap-backdrop-variants';
import { FmgSettingsTab } from './settings/fmg-settings-tab';
import { readPluginSettings } from './settings/plugin-settings';
import type { iFmgPluginSettings, iPluginSettingsStore } from './settings/plugin-settings';
import { showNotice } from './show-notice';

// eslint-disable-next-line import-x/no-default-export -- Obsidian loads the plugin class from main.js's default export.
export default class FmgPlugin extends Plugin {
  public settings: iFmgPluginSettings = readPluginSettings(null);

  private fmgAssetServer: FmgAssetServer | null = null;

  private fmgPageUrl: string | null = null;

  /** Numbers the mini-maps' SVG masks, whose ids must be unique in the page. */
  private minimapCount = 0;

  private minimapBackdropVariants: MinimapBackdropVariants | null = null;

  public async onload() {
    this.settings = readPluginSettings(await this.loadData());
    await this.startFmgAssetServer();

    const settingsStore: iPluginSettingsStore = {
      read: () => this.settings,
      update: async (change) => this.updateSettings(change),
    };

    const { vault, metadataCache, fileManager } = this.app;
    const noteLinkIndex = new NoteLinkIndex(vault, metadataCache);
    const mapRepository = new FmgMapRepository(vault);
    const noteLinkWriter = new NoteLinkWriter(vault, fileManager, metadataCache);
    const mapEntityPicker = new MapEntityPicker(this.app, noteLinkIndex);
    const mapLinkCommands = new MapLinkCommands({
      app: this.app,
      noteLinkIndex,
      noteLinkWriter,
      mapRenameFollower: new MapRenameFollower(vault),
      mapRepository,
      mapEntityPicker,
      readEntityFolders: () => this.settings.entityFolders,
    });

    this.registerView(
      FMG_MAP_VIEW_TYPE,
      (leaf) =>
        new FmgMapView(leaf, {
          vault,
          readFmgPageUrl: () => this.readFmgPageUrl(),
          hasFmgBundle: async () => this.fmgPageUrl !== null,
          readExportKinds: () => this.settings.exportKinds,
          openEntityNote: async (mapPath, candidates) => mapLinkCommands.openEntityNote(mapPath, candidates),
        }),
    );
    this.registerExtensions([MAP_FILE_EXTENSION], FMG_MAP_VIEW_TYPE);

    this.addCommand({
      id: 'new-map',
      name: 'New map',
      callback: async () => {
        await this.createMap();
      },
    });
    this.addCommand({
      id: 'save-map',
      name: 'Save map',
      checkCallback: (isChecking) => {
        const view = this.app.workspace.getActiveViewOfType(FmgMapView);
        if (!view) return false;
        if (!isChecking) {
          void view.saveMap().catch((error: unknown) => {
            showNotice(`Could not save the map: ${error instanceof Error ? error.message : String(error)}`);
          });
        }
        return true;
      },
    });
    mapLinkCommands.register(this);
    new MapBlockInsertCommands({ app: this.app, noteLinkIndex, mapRepository, mapEntityPicker }).register(this);

    const mapBlockHost: iMapBlockHost = {
      app: this.app,
      resolver: new MapBlockTargetResolver(vault, metadataCache, noteLinkIndex, mapRepository),
      noteLinkIndex,
    };
    const backdropVariants = new MinimapBackdropVariants(vault);
    this.minimapBackdropVariants = backdropVariants;
    const areaPaths = new MinimapAreaPaths();
    this.registerMarkdownCodeBlockProcessor(FMG_MINIMAP_BLOCK_LANGUAGE, (source, element, context) => {
      context.addChild(
        new FmgMinimapRenderChild(element, source, context.sourcePath, {
          ...mapBlockHost,
          backdropVariants,
          areaPaths,
          createMaskId: () => {
            this.minimapCount += 1;
            return `fmg-minimap-mask-${this.minimapCount}`;
          },
        }),
      );
    });
    this.registerMarkdownCodeBlockProcessor(FMG_FACTS_BLOCK_LANGUAGE, (source, element, context) => {
      context.addChild(new FmgFactsRenderChild(element, source, context.sourcePath, mapBlockHost));
    });
    this.addSettingTab(new FmgSettingsTab(this.app, this, settingsStore));

    const noteLinkMigration = new NoteLinkMigration(vault, metadataCache, fileManager, noteLinkWriter);
    this.app.workspace.onLayoutReady(() => {
      void noteLinkMigration
        .migrate()
        .then((report) => this.reportMigration(report))
        .catch((error: unknown) => {
          showNotice(`Could not migrate the linked notes: ${error instanceof Error ? error.message : String(error)}`);
        });
    });
  }

  public async onunload() {
    this.minimapBackdropVariants?.dispose();
    this.minimapBackdropVariants = null;
    const fmgAssetServer = this.fmgAssetServer;
    this.fmgAssetServer = null;
    this.fmgPageUrl = null;
    if (fmgAssetServer) await fmgAssetServer.stop();
  }

  private async startFmgAssetServer() {
    const pluginFolder = this.manifest.dir;
    if (!pluginFolder) throw new Error('The plugin folder is unknown.');

    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) throw new Error('Azgaar Fantasy Map Generator requires an Obsidian desktop vault.');

    const fmgFolder = normalizePath(`${pluginFolder}/fmg`);
    if (!(await adapter.exists(normalizePath(`${fmgFolder}/${FMG_ASSET_ENTRY_FILE}`)))) return;

    const fmgAssetServer = new FmgAssetServer(adapter.getFullPath(fmgFolder));
    const { pageUrl, port } = await fmgAssetServer.start(this.settings.fmgAssetServerPort);
    this.fmgPageUrl = pageUrl;
    this.fmgAssetServer = fmgAssetServer;
    if (port !== this.settings.fmgAssetServerPort) await this.updateSettings({ fmgAssetServerPort: port });
  }

  private async updateSettings(change: Partial<iFmgPluginSettings>) {
    this.settings = { ...this.settings, ...change };
    await this.saveData(this.settings);
  }

  private readFmgPageUrl(): string {
    if (!this.fmgPageUrl) throw new Error('FMG is not bundled with the plugin.');
    return this.fmgPageUrl;
  }

  private reportMigration(report: iNoteLinkMigrationReport) {
    if (report.noteCount === 0 && report.thumbnailCount === 0 && report.failures.length === 0) return;
    const migrated = `Moved ${report.noteCount} linked note(s) to the fmg-map, fmg-kind and fmg-id properties with live fmg-map and fmg-facts blocks, and ${report.thumbnailCount} old thumbnail(s) to the trash.`;
    showNotice(report.failures.length > 0 ? `${migrated} Not migrated: ${report.failures.join('; ')}` : migrated);
  }

  private async createMap() {
    try {
      const file = await new NewMapCreator(this.app.vault).create(this.settings.mapsFolder);
      await this.app.workspace.getLeaf(true).openFile(file);
    } catch (error) {
      showNotice(`Could not create a map: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
