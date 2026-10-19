import { FileSystemAdapter, normalizePath, Plugin } from 'obsidian';

import { FMG_ASSET_ENTRY_FILE } from './fmg/fmg-asset-server.constants';
import { FmgAssetServer } from './fmg/fmg-asset-server';
import { FMG_MAP_VIEW_TYPE, FmgMapView } from './map/fmg-map-view';
import { MAP_FILE_EXTENSION } from './map/map-file-paths';
import { NewMapCreator } from './map/new-map.creator';
import { FmgSettingsTab } from './settings/fmg-settings-tab';
import { readPluginSettings } from './settings/plugin-settings';
import type { iFmgPluginSettings, iPluginSettingsStore } from './settings/plugin-settings';
import { showNotice } from './show-notice';

// eslint-disable-next-line import-x/no-default-export -- Obsidian loads the plugin class from main.js's default export.
export default class FmgPlugin extends Plugin {
  public settings: iFmgPluginSettings = readPluginSettings(null);

  private fmgAssetServer: FmgAssetServer | null = null;

  private fmgPageUrl: string | null = null;

  public async onload() {
    this.settings = readPluginSettings(await this.loadData());
    await this.startFmgAssetServer();

    const settingsStore: iPluginSettingsStore = {
      read: () => this.settings,
      update: async (change) => this.updateSettings(change),
    };

    this.registerView(
      FMG_MAP_VIEW_TYPE,
      (leaf) =>
        new FmgMapView(leaf, {
          vault: this.app.vault,
          readFmgPageUrl: () => this.readFmgPageUrl(),
          hasFmgBundle: async () => this.fmgPageUrl !== null,
          readExportKinds: () => this.settings.exportKinds,
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
