import { FileView } from 'obsidian';
import type { TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian';

import type { iMapEntityRef } from '../entities/map-entity.types';
import { mountFmg } from '../fmg/fmg-adapter';
import type { iMountedFmg } from '../fmg/fmg-adapter';
import type { iMapBox } from '../map-data/map-geometry.types';
import { PERSISTENT_NOTICE_DURATION_MS, showNotice } from '../show-notice';
import { askMapConflict, MAP_CONFLICT_CHOICES } from './map-conflict.modal';
import type { MapExportKind } from './map-export.constants';
import { MAP_FILE_EXTENSION } from './map-file-paths';
import { MapSession } from './map-session';
import { MAP_SAVE_OUTCOME_KIND_CASES } from './map.types';
import type { iMapSaveReport, MapVault } from './map.types';

export const FMG_MAP_VIEW_TYPE = 'azgaar-fmg-map';

export interface iFmgMapViewHost {
  vault: MapVault;
  /** The resource URL of the bundled FMG page. */
  readFmgPageUrl: () => string;
  /** Whether the build put FMG next to the plugin. */
  hasFmgBundle: () => Promise<boolean>;
  readExportKinds: () => MapExportKind[];
  /** Opens the note of the first of the clicked entities that has one. */
  openEntityNote: (mapPath: string, candidates: iMapEntityRef[]) => Promise<unknown>;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describeSave(report: iMapSaveReport): string {
  if (report.exportError) return `Saved ${report.mapPath}, but an export failed: ${report.exportError}`;
  const exports = report.exportPaths.length > 0 ? ` and ${report.exportPaths.length} export(s)` : '';
  return `Saved ${report.mapPath}${exports}.`;
}

/** Shows a vault `.map` file in the bundled FMG and writes FMG's map back on "Save map", Ctrl/Cmd+S or close. */
export class FmgMapView extends FileView {
  private mounted: iMountedFmg | null = null;

  private session: MapSession | null = null;

  private isBusy = false;

  /** Set while closing the tab waits for the save, so further close clicks do nothing meanwhile. */
  private isClosingTab?: boolean;

  /** Set once saving before closing failed and the tab stayed open: closing it again drops the unsaved edits. */
  private shouldDiscardUnsavedEdits?: boolean;

  /** The save before closing under way, which every close path running meanwhile waits for. */
  private savingBeforeClose: Promise<unknown> | null = null;

  /** Settles once the file's map is open in FMG, or failed to open. */
  private opening: Promise<unknown> | null = null;

  public constructor(
    leaf: WorkspaceLeaf,
    private readonly host: iFmgMapViewHost,
  ) {
    super(leaf);
  }

  public getViewType() {
    return FMG_MAP_VIEW_TYPE;
  }

  public getIcon() {
    return 'map';
  }

  public canAcceptExtension(extension: string) {
    return extension === MAP_FILE_EXTENSION;
  }

  public onload() {
    super.onload();
    this.contentEl.addClass('azgaar-fmg-view');
    this.addAction('save', 'Save map', () => {
      this.runInBackground(this.saveMap(), 'Could not save the map');
    });
    this.registerEvent(
      this.app.vault.on('modify', (changed) => {
        this.runInBackground(this.onFileModified(changed), `Could not process the change to ${changed.path}`);
      }),
    );
    this.saveBeforeTabDetaches();
  }

  /** Returns at once; the map opens in the background, since FMG first starts and generates a map of its own. */
  public async onLoadFile(file: TFile) {
    await this.closeMap(file);
    if (!(await this.host.hasFmgBundle())) {
      showNotice('FMG is not bundled with the plugin. Build it with `build:release` and reinstall the plugin.');
      return;
    }

    const mounted = mountFmg(this.contentEl, this.host.readFmgPageUrl());
    this.mounted = mounted;
    mounted.adapter.onSaveRequested(() => {
      this.runInBackground(this.saveMap(), 'Could not save the map');
    });
    mounted.adapter.onEntityClicked((candidates) => {
      this.runInBackground(this.host.openEntityNote(file.path, candidates), 'Could not open the linked note');
    });
    this.opening = this.openMap(mounted, file);
    this.runInBackground(this.opening, `Could not open ${file.path}`);
  }

  public async onUnloadFile(file: TFile) {
    await this.closeMap(file);
  }

  /**
   * Obsidian removes FMG's frame along with the view's element before `onClose`, so unsaved edits are saved here. Only
   * a view replaced within its tab waits for this; closing the tab is handled by `saveBeforeTabDetaches`.
   */
  public async close() {
    if (this.file) await this.closeMap(this.file);
    await super.close();
  }

  public async onClose() {
    if (this.file) await this.closeMap(this.file);
  }

  public async saveMap() {
    const { file, session } = this;
    if (!file || !session) {
      showNotice('The map is not open in FMG yet.');
      return;
    }

    await this.runExclusively(async () => {
      const outcome = await session.save(file);
      if (outcome.kind === MAP_SAVE_OUTCOME_KIND_CASES.SAVED) {
        this.shouldDiscardUnsavedEdits = false;
        showNotice(describeSave(outcome.report));
        return;
      }
      await this.resolveConflict(session, file);
    }, `Could not save ${file.path}`);
  }

  /** Zooms FMG to the box once the map is open. */
  public async showRegion(box: iMapBox) {
    await this.opening;
    const { mounted, session } = this;
    if (!mounted || !session) throw new Error('The map did not open in FMG.');
    await mounted.adapter.showRegion(box);
  }

  private async openMap(mounted: iMountedFmg, file: TFile) {
    const session = new MapSession(this.host.vault, mounted.adapter, () => this.host.readExportKinds());
    try {
      await mounted.adapter.waitUntilReady();
      const report = await session.open(file);
      if (this.mounted !== mounted) return;

      this.session = session;
      if (report) showNotice(describeSave(report));
    } catch (error) {
      if (this.mounted === mounted) showNotice(`Could not open ${file.path}: ${describeError(error)}`);
    }
  }

  private async resolveConflict(session: MapSession, file: TFile) {
    const choice = await askMapConflict(this.app, file.path);
    if (choice === MAP_CONFLICT_CHOICES.OVERWRITE) {
      const outcome = await session.save(file, { shouldOverwrite: true });
      if (outcome.kind === MAP_SAVE_OUTCOME_KIND_CASES.SAVED) showNotice(describeSave(outcome.report));
    } else if (choice === MAP_CONFLICT_CHOICES.RELOAD) {
      await session.open(file);
      showNotice(`Reloaded ${file.path}.`);
    }
  }

  /** A change made outside the view: reload when FMG holds no unsaved edits, else leave it to the next save. */
  private async onFileModified(changed: TAbstractFile) {
    const { file, session } = this;
    if (changed !== file || !session || this.isBusy || !session.hasChangedOnDisk(file)) return;

    await this.runExclusively(async () => {
      if (await session.hasUnsavedChanges()) {
        showNotice(`${file.path} changed on disk. Saving will ask whether to overwrite it.`);
        return;
      }
      await session.open(file);
      showNotice(`${file.path} changed on disk and was reloaded.`);
    }, `Could not reload ${file.path}`);
  }

  /**
   * `WorkspaceLeaf.detach` closes the view without waiting and removes the tab's DOM, and FMG's frame with it, right
   * after. The leaf's `detach` is wrapped so it first saves while FMG still runs; a failed save keeps the tab open.
   */
  private saveBeforeTabDetaches() {
    const { leaf } = this;
    const detachLeaf = leaf.detach.bind(leaf);
    leaf.detach = () => {
      this.runInBackground(this.detachTabAfterSaving(detachLeaf), 'Could not close the map');
    };
    this.register(() => {
      leaf.detach = detachLeaf;
    });
  }

  private async detachTabAfterSaving(detachLeaf: () => unknown) {
    const { file } = this;
    if (this.isClosingTab || !file) return;

    this.isClosingTab = true;
    try {
      await this.saveBeforeClosing(file);
    } catch (error) {
      this.shouldDiscardUnsavedEdits = true;
      this.reportCloseFailure(file, error, 'The map stays open; close it again to discard the unsaved edits.');
      return;
    } finally {
      this.isClosingTab = false;
    }
    detachLeaf();
  }

  private async closeMap(file: TFile) {
    try {
      await this.saveBeforeClosing(file);
    } catch (error) {
      this.reportCloseFailure(file, error, 'Any edits since the last save are lost.');
    }
    this.session = null;
    this.shouldDiscardUnsavedEdits = false;
    this.mounted?.adapter.dispose();
    this.mounted?.frame.remove();
    this.mounted = null;
    this.opening = null;
  }

  /**
   * Obsidian may run several close paths at once, for example when the plugin unloads; they all wait for the one save
   * under way instead of failing as busy and disposing FMG beneath it.
   */
  private async saveBeforeClosing(file: TFile) {
    this.savingBeforeClose ??= this.saveSessionBeforeClosing(file).finally(() => {
      this.savingBeforeClose = null;
    });
    await this.savingBeforeClose;
  }

  /** Saves unsaved edits while FMG still runs, and forgets the session once nothing is left unsaved. */
  private async saveSessionBeforeClosing(file: TFile) {
    const { session, mounted } = this;
    if (!session || this.shouldDiscardUnsavedEdits) return;
    if (this.isBusy) throw new Error('The map is busy saving or loading.');
    if (!mounted?.frame.isConnected) throw new Error('FMG was closed before its map could be read.');

    this.isBusy = true;
    try {
      await this.writeUnsavedEdits(session, file);
    } finally {
      this.isBusy = false;
    }
    this.session = null;
  }

  /** When the file changed on disk, the edits go to a copy next to it. */
  private async writeUnsavedEdits(session: MapSession, file: TFile) {
    if (!(await session.hasUnsavedChanges())) return;

    const outcome = await session.save(file);
    if (outcome.kind === MAP_SAVE_OUTCOME_KIND_CASES.SAVED) {
      showNotice(`Unsaved edits: ${describeSave(outcome.report)}`);
      return;
    }
    const copyPath = await session.saveCopy(file);
    showNotice(`${file.path} changed on disk, so the unsaved edits went to ${copyPath}.`);
  }

  /** Unsaved edits are at stake, so the notice stays until dismissed and the console keeps the error with its stack. */
  private reportCloseFailure(file: TFile, error: unknown, consequence: string) {
    console.error(`Could not save ${file.path} before closing it.`, error);
    showNotice(
      `Could not save ${file.path} before closing it: ${describeError(error)} ${consequence}`,
      PERSISTENT_NOTICE_DURATION_MS,
    );
  }

  private async runExclusively(run: () => Promise<unknown>, failurePrefix: string) {
    if (this.isBusy) {
      showNotice('The map is busy saving or loading; try again in a moment.');
      return;
    }

    this.isBusy = true;
    try {
      await run();
    } catch (error) {
      showNotice(`${failurePrefix}: ${describeError(error)}`);
    } finally {
      this.isBusy = false;
    }
  }

  private runInBackground(operation: Promise<unknown>, failurePrefix: string) {
    void operation.catch((error: unknown) => {
      showNotice(`${failurePrefix}: ${describeError(error)}`);
    });
  }
}
