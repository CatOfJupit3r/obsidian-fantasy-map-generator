import { Modal, Setting } from 'obsidian';
import type { App, TFile } from 'obsidian';

import { MAP_ENTITY_KIND_VALUES, readMapEntityKindFormat } from '../entities/map-entity.constants';
import type { MapEntityKind } from '../entities/map-entity.constants';
import type { iMapEntitySummary } from '../entities/map-entity.types';
import type { iLinkReport } from './link-report';

export interface iLinkReportSource {
  mapPath: string;
  /** Read anew each time the modal redraws, so created notes leave the list. */
  readReport: () => iLinkReport;
  createNote: (entity: iMapEntitySummary) => Promise<TFile>;
  openNote: (file: TFile) => Promise<unknown>;
  showError: (message: string) => unknown;
}

/** The map's entities without a note, each with a button to create one, and the linked notes that lead nowhere. */
export class LinkReportModal extends Modal {
  /** The kind groups the reader opened, kept open across redraws. */
  private readonly openKinds = new Set<MapEntityKind>();

  /** Entities given a note here, and those notes; Obsidian reads a new note's frontmatter a moment after it is written. */
  private readonly createdEntities = new Set<string>();

  private readonly createdNotes = new Set<TFile>();

  public constructor(
    app: App,
    private readonly source: iLinkReportSource,
  ) {
    super(app);
  }

  public onOpen() {
    this.setTitle(`Map links: ${this.source.mapPath}`);
    this.draw();
  }

  public onClose() {
    this.contentEl.empty();
  }

  private draw() {
    const { contentEl } = this;
    contentEl.empty();
    const report = this.source.readReport();
    const unlinkedEntities = report.unlinkedEntities.filter(
      (entity) => !this.createdEntities.has(this.readEntityKey(entity)),
    );
    const brokenNotes = report.brokenNotes.filter((file) => !this.createdNotes.has(file));

    new Setting(contentEl).setName(`Map entities with no note (${unlinkedEntities.length})`).setHeading();
    for (const kind of MAP_ENTITY_KIND_VALUES) {
      const entities = unlinkedEntities.filter((entity) => entity.kind === kind);
      if (entities.length > 0) this.drawEntityGroup(contentEl, kind, entities);
    }

    new Setting(contentEl).setName(`Notes linked to nothing on a map (${brokenNotes.length})`).setHeading();
    const notesList = contentEl.createEl('ul', { cls: 'fmg-link-report-notes' });
    for (const file of brokenNotes) {
      const link = notesList.createEl('li').createEl('a', { text: file.path, href: '#' });
      link.addEventListener('click', (event) => {
        event.preventDefault();
        this.run(this.source.openNote(file), `Could not open ${file.path}`);
      });
    }
  }

  private drawEntityGroup(containerEl: HTMLElement, kind: MapEntityKind, entities: iMapEntitySummary[]) {
    const group = containerEl.createEl('details', { cls: 'fmg-link-report-group' });
    group.open = this.openKinds.has(kind);
    group.addEventListener('toggle', () => {
      if (group.open) this.openKinds.add(kind);
      else this.openKinds.delete(kind);
    });
    group.createEl('summary', { text: `${readMapEntityKindFormat(kind).label} (${entities.length})` });
    for (const entity of entities) {
      new Setting(group).setName(entity.name).addButton((button) =>
        button.setButtonText('Create note').onClick(() => {
          this.run(
            this.source.createNote(entity).then((file) => {
              this.createdEntities.add(this.readEntityKey(entity));
              this.createdNotes.add(file);
              this.draw();
            }),
            `Could not create a note for ${entity.name}`,
          );
        }),
      );
    }
  }

  private readEntityKey(entity: iMapEntitySummary): string {
    return `${entity.kind}:${entity.id}`;
  }

  private run(operation: Promise<unknown>, failurePrefix: string) {
    void operation.catch((error: unknown) => {
      this.source.showError(`${failurePrefix}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
}
