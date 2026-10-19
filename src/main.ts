import { FileSystemAdapter, normalizePath, Plugin } from 'obsidian';

import { FMG_ASSET_ENTRY_FILE } from './fmg/fmg-asset-server.constants';
import { FmgAssetServer } from './fmg/fmg-asset-server';
import { LinkedNotesRefresher } from './links/linked-notes-refresher';
import { MapLinkCommands } from './links/map-link-commands';
import { MapRenameFollower } from './links/map-rename-follower';
import { NoteLinkIndex } from './links/note-link-index';
import { NoteLinkWriter } from './links/note-link-writer';
import { FmgMapRepository } from './map-data/fmg-map-repository';
import { FMG_MAP_VIEW_TYPE, FmgMapView } from './map/fmg-map-view';
import { MAP_FILE_EXTENSION } from './map/map-file-paths';
import { NewMapCreator } from './map/new-map.creator';
import { FMG_MINIMAP_BLOCK_LANGUAGE } from './minimap/fmg-minimap-block.schema';
import { FmgMinimapRenderChild } from './minimap/fmg-minimap-render-child';
import { MinimapTargetResolver } from './minimap/minimap-target-resolver';
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
    const linkedNotesRefresher = new LinkedNotesRefresher(
      vault,
      metadataCache,
      noteLinkIndex,
      mapRepository,
      () => this.settings.exportKinds,
    );
    const noteLinkWriter = new NoteLinkWriter(vault, fileManager, noteLinkIndex);
    const mapLinkCommands = new MapLinkCommands({
      app: this.app,
      noteLinkIndex,
      noteLinkWriter,
      mapRenameFollower: new MapRenameFollower(vault, noteLinkWriter, linkedNotesRefresher),
      mapRepository,
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
          refreshLinkedNotes: async (mapFile, editor) => linkedNotesRefresher.refresh(mapFile, editor),
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

    const minimapResolver = new MinimapTargetResolver(vault, metadataCache, noteLinkIndex, mapRepository);
    this.registerMarkdownCodeBlockProcessor(FMG_MINIMAP_BLOCK_LANGUAGE, (source, element, context) => {
      context.addChild(
        new FmgMinimapRenderChild(element, source, context.sourcePath, {
          app: this.app,
          resolver: minimapResolver,
          noteLinkIndex,
          createMaskId: () => {
            this.minimapCount += 1;
            return `fmg-minimap-mask-${this.minimapCount}`;
          },
        }),
      );
    });
    this.addSettingTab(new FmgSettingsTab(this.app, this, settingsStore));
  }

  public async onunload() {
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

  private async createMap() {
    try {
      const file = await new NewMapCreator(this.app.vault).create(this.settings.mapsFolder);
      await this.app.workspace.getLeaf(true).openFile(file);
    } catch (error) {
      showNotice(`Could not create a map: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
