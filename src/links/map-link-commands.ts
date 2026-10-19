import { TFile } from 'obsidian';
import type { App, Plugin } from 'obsidian';

import { readMapEntityFolder, readMapEntityKindFormat } from '../entities/map-entity.constants';
import type { MapEntityFolders } from '../entities/map-entity.constants';
import type { iMapEntityRef } from '../entities/map-entity.types';
import type { FmgMapRepository } from '../map-data/fmg-map-repository';
import { FMG_MAP_VIEW_TYPE, FmgMapView } from '../map/fmg-map-view';
import { MAP_FILE_EXTENSION } from '../map/map-file-paths';
import type { MapRenameFollower } from '../map/map-rename-follower';
import { showNotice } from '../show-notice';
import { buildLinkReport } from './link-report';
import { LinkReportModal } from './link-report.modal';
import type { MapEntityPicker } from './map-entity-picker';
import type { NoteLinkIndex } from './note-link-index';
import type { NoteLinkWriter } from './note-link-writer';

const MARKDOWN_EXTENSION = 'md';

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface iMapLinkCommandsDependencies {
  app: App;
  noteLinkIndex: NoteLinkIndex;
  noteLinkWriter: NoteLinkWriter;
  mapRenameFollower: MapRenameFollower;
  mapRepository: FmgMapRepository;
  mapEntityPicker: MapEntityPicker;
  readEntityFolders: () => MapEntityFolders;
}

/** "Link note to map entity", "Show on map" and "Map link report", and the links' side of map clicks and renames. */
export class MapLinkCommands {
  public constructor(private readonly dependencies: iMapLinkCommandsDependencies) {}

  public register(plugin: Plugin) {
    const { app } = this.dependencies;
    plugin.addCommand({
      id: 'link-note-to-map-entity',
      name: 'Link note to map entity',
      checkCallback: (isChecking) => this.runOnActiveNote(isChecking, async (note) => this.linkNote(note)),
    });
    plugin.addCommand({
      id: 'show-note-on-map',
      name: 'Show on map',
      checkCallback: (isChecking) => {
        const note = this.readActiveNote();
        if (!note || !this.dependencies.noteLinkIndex.readLink(note)) return false;
        if (!isChecking) this.runInBackground(this.showOnMap(note), 'Could not show the note on the map');
        return true;
      },
    });
    plugin.addCommand({
      id: 'map-link-report',
      name: 'Map link report',
      callback: () => this.runInBackground(this.openLinkReport(), 'Could not build the link report'),
    });
    plugin.registerEvent(
      app.vault.on('rename', (file, oldPath) => {
        if (!(file instanceof TFile) || file.extension !== MAP_FILE_EXTENSION) return;
        this.runInBackground(
          this.dependencies.mapRenameFollower.follow(file, oldPath),
          `Could not move the exports of ${file.path}`,
        );
      }),
    );
  }

  /** Opens the note of the first entity that has one; the candidates come most specific first. */
  public async openEntityNote(mapPath: string, candidates: iMapEntityRef[]) {
    const { app, noteLinkIndex } = this.dependencies;
    for (const candidate of candidates) {
      const note = noteLinkIndex.findNote(mapPath, candidate);
      if (note) {
        await app.workspace.getLeaf('tab').openFile(note);
        return;
      }
    }

    const [first] = candidates;
    if (!first) return;
    const name = await this.readEntityName(mapPath, first);
    showNotice(`No note is linked to ${name}. Open a note and run "Link note to map entity" to link one.`);
  }

  private async linkNote(note: TFile) {
    const { noteLinkIndex, noteLinkWriter, mapRepository, mapEntityPicker } = this.dependencies;
    const mapFile = await mapEntityPicker.chooseMap(noteLinkIndex.readLink(note)?.map);
    if (!mapFile) return;

    const model = await mapRepository.read(mapFile.path);
    const entity = await mapEntityPicker.chooseEntity(mapFile.path, model);
    if (!entity) return;

    const linkedNote = noteLinkIndex.findNote(mapFile.path, entity);
    if (linkedNote && linkedNote !== note) {
      showNotice(`${entity.name} is already linked to ${linkedNote.path}. Remove its link there first.`);
      return;
    }
    await noteLinkWriter.writeLink(note, mapFile, entity);
    showNotice(`Linked ${note.basename} to ${entity.name}. Add an fmg-facts or fmg-map block to show it.`);
  }

  private async showOnMap(note: TFile) {
    const { app, noteLinkIndex, mapRepository } = this.dependencies;
    const link = noteLinkIndex.readLink(note);
    const mapFile = link ? app.vault.getAbstractFileByPath(link.map) : null;
    if (!link || !(mapFile instanceof TFile)) {
      showNotice(`The map ${link?.map ?? ''} the note links to is not in the vault.`);
      return;
    }

    const box = (await mapRepository.read(mapFile.path)).geometry.readCropBox(link);
    if (!box) {
      showNotice(`${mapFile.path} has no ${readMapEntityKindFormat(link.kind).label} ${link.id}.`);
      return;
    }

    // A background tab restored at start-up is deferred: it has no view yet, only the state naming its file.
    const openLeaf = app.workspace
      .getLeavesOfType(FMG_MAP_VIEW_TYPE)
      .find((leaf) => leaf.getViewState().state?.file === mapFile.path);
    const leaf = openLeaf ?? app.workspace.getLeaf('tab');
    if (openLeaf) await openLeaf.loadIfDeferred();
    else await leaf.openFile(mapFile);
    await app.workspace.revealLeaf(leaf);
    if (!(leaf.view instanceof FmgMapView)) throw new Error(`${mapFile.path} did not open in the map view.`);
    await leaf.view.showRegion(box);
  }

  private async openLinkReport() {
    const { app, noteLinkIndex, noteLinkWriter, mapRepository, mapEntityPicker } = this.dependencies;
    const activeMap = app.workspace.getActiveViewOfType(FmgMapView)?.file ?? null;
    const mapFile = activeMap ?? (await mapEntityPicker.chooseMap(undefined));
    if (!mapFile) return;

    const model = await mapRepository.read(mapFile.path);
    new LinkReportModal(app, {
      mapPath: mapFile.path,
      readReport: () =>
        buildLinkReport({
          mapPath: mapFile.path,
          catalog: model.catalog,
          linkedNotes: noteLinkIndex.listLinkedNotes(),
          hasMap: (mapPath) => app.vault.getAbstractFileByPath(mapPath) instanceof TFile,
        }),
      createNote: async (entity) =>
        noteLinkWriter.createLinkedNote(
          readMapEntityFolder(this.dependencies.readEntityFolders(), entity.kind),
          entity.name,
          mapFile,
          entity,
        ),
      openNote: async (file) => app.workspace.getLeaf('tab').openFile(file),
      showError: (message) => showNotice(message),
    }).open();
  }

  private async readEntityName(mapPath: string, ref: iMapEntityRef): Promise<string> {
    const fallback = `${readMapEntityKindFormat(ref.kind).label} ${ref.id}`;
    try {
      return (await this.dependencies.mapRepository.read(mapPath)).catalog.find(ref)?.name ?? fallback;
    } catch {
      return fallback;
    }
  }

  private readActiveNote(): TFile | null {
    const file = this.dependencies.app.workspace.getActiveFile();
    return file?.extension === MARKDOWN_EXTENSION ? file : null;
  }

  private runOnActiveNote(isChecking: boolean, run: (note: TFile) => Promise<unknown>): boolean {
    const note = this.readActiveNote();
    if (!note) return false;
    if (!isChecking) this.runInBackground(run(note), `Could not link ${note.path}`);
    return true;
  }

  private runInBackground(operation: Promise<unknown>, failurePrefix: string) {
    void operation.catch((error: unknown) => {
      showNotice(`${failurePrefix}: ${describeError(error)}`);
    });
  }
}
