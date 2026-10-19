import { em } from 'enumwaii';
import { Modal, Setting } from 'obsidian';
import type { App } from 'obsidian';

const mapConflictChoicesEnumwaii = em(['RELOAD', 'OVERWRITE']);
export const MAP_CONFLICT_CHOICES = mapConflictChoicesEnumwaii.enum;
export type MapConflictChoice = (typeof mapConflictChoicesEnumwaii)['~type'];

/** Asks what to do when the map changed on disk since it was opened: reload it, or overwrite it with FMG's map. */
class MapConflictModal extends Modal {
  private choice: MapConflictChoice | null = null;

  public constructor(
    app: App,
    private readonly mapPath: string,
    private readonly onDone: (choice: MapConflictChoice | null) => unknown,
  ) {
    super(app);
  }

  public onOpen() {
    this.setTitle('The map changed on disk');
    this.contentEl.createEl('p', {
      text: `${this.mapPath} was changed outside this view since it was opened. Reload it and lose the edits made here, or overwrite it with them?`,
    });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText('Reload').onClick(() => this.choose(MAP_CONFLICT_CHOICES.RELOAD)))
      .addButton((button) =>
        button
          .setButtonText('Overwrite')
          .setDestructive()
          .onClick(() => this.choose(MAP_CONFLICT_CHOICES.OVERWRITE)),
      );
  }

  public onClose() {
    this.contentEl.empty();
    this.onDone(this.choice);
  }

  private choose(choice: MapConflictChoice) {
    this.choice = choice;
    this.close();
  }
}

/** Null when the dialog was dismissed. */
export async function askMapConflict(app: App, mapPath: string): Promise<MapConflictChoice | null> {
  return new Promise((resolve) => {
    new MapConflictModal(app, mapPath, resolve).open();
  });
}
