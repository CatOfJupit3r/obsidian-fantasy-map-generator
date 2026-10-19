import { FileView } from 'obsidian';
import type { TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian';

import type { iMapEntityRef } from '../entities/map-entity.types';
import { mountFmg } from '../fmg/fmg-adapter';
import type { FmgAdapter, iMountedFmg } from '../fmg/fmg-adapter';
import type { iLinkedNotesReport } from '../links/linked-notes-refresher';
import type { iMapBox } from '../map-data/map-geometry.types';
import { showNotice } from '../show-notice';
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
  /** Rewrites the facts blocks and thumbnails of the notes linked to the map, after a save. */
  refreshLinkedNotes: (mapFile: TFile, editor: FmgAdapter) => Promise<iLinkedNotesReport>;
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

function describeLinkedNotes(report: iLinkedNotesReport): string {
  if (report.noteCount === 0 && report.failures.length === 0) return '';
  const refreshed = ` Refreshed ${report.noteCount} linked note(s) and ${report.thumbnailCount} thumbnail(s).`;
  return report.failures.length > 0 ? `${refreshed} Not refreshed: ${report.failures.join('; ')}` : refreshed;
}

/** Shows a vault `.map` file in the bundled FMG and writes FMG's map back on "Save map", Ctrl/Cmd+S or close. */
export class FmgMapView extends FileView {
  private mounted: iMountedFmg | null = null;

  private session: MapSession | null = null;

  private isBusy = false;

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
        await this.reportSave(file, outcome.report);
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
      if (report) await this.reportSave(file, report);
    } catch (error) {
      if (this.mounted === mounted) showNotice(`Could not open ${file.path}: ${describeError(error)}`);
    }
  }

  private async resolveConflict(session: MapSession, file: TFile) {
    const choice = await askMapConflict(this.app, file.path);
    if (choice === MAP_CONFLICT_CHOICES.OVERWRITE) {
      const outcome = await session.save(file, { shouldOverwrite: true });
      if (outcome.kind === MAP_SAVE_OUTCOME_KIND_CASES.SAVED) await this.reportSave(file, outcome.report);
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

  /** Saves unsaved edits before FMG goes away; when the file changed on disk, they go to a copy next to it. */
  private async closeMap(file: TFile) {
    const { session } = this;
    this.session = null;
    if (session && !this.isBusy) {
      try {
        await this.saveBeforeClosing(session, file);
      } catch (error) {
        showNotice(`Could not save ${file.path} before closing it: ${describeError(error)}`);
      }
    }
    this.mounted?.adapter.dispose();
    this.mounted?.frame.remove();
    this.mounted = null;
    this.opening = null;
  }

  /** After a save: refreshes the linked notes from the fresh exports, then says what was written. */
  private async reportSave(file: TFile, report: iMapSaveReport, prefix = '') {
    const { mounted } = this;
    if (report.exportError || !mounted) {
      showNotice(`${prefix}${describeSave(report)}`);
      return;
    }

    try {
      const linkedNotes = await this.host.refreshLinkedNotes(file, mounted.adapter);
      showNotice(`${prefix}${describeSave(report)}${describeLinkedNotes(linkedNotes)}`);
    } catch (error) {
      showNotice(`${prefix}${describeSave(report)} The linked notes were not refreshed: ${describeError(error)}`);
    }
  }

  private async saveBeforeClosing(session: MapSession, file: TFile) {
    if (!(await session.hasUnsavedChanges())) return;

    const outcome = await session.save(file);
    if (outcome.kind === MAP_SAVE_OUTCOME_KIND_CASES.SAVED) {
      await this.reportSave(file, outcome.report, 'Unsaved edits: ');
      return;
    }
    const copyPath = await session.saveCopy(file);
    showNotice(`${file.path} changed on disk, so the unsaved edits went to ${copyPath}.`);
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
