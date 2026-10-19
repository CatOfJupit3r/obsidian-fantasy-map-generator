import { FuzzySuggestModal } from 'obsidian';
import type { App } from 'obsidian';

interface iChoiceOptions<TItem> {
  items: TItem[];
  readText: (item: TItem) => string;
  placeholder: string;
}

/** A fuzzy picker that resolves with the chosen item, or null when dismissed. */
class ChoiceSuggestModal<TItem> extends FuzzySuggestModal<TItem> {
  private isSettled = false;

  public constructor(
    app: App,
    private readonly options: iChoiceOptions<TItem>,
    private readonly onDone: (item: TItem | null) => unknown,
  ) {
    super(app);
    this.setPlaceholder(options.placeholder);
  }

  public getItems(): TItem[] {
    return this.options.items;
  }

  public getItemText(item: TItem): string {
    return this.options.readText(item);
  }

  public onChooseItem(item: TItem) {
    this.settle(item);
  }

  public onClose() {
    super.onClose();
    // Obsidian closes the modal before it reports the choice, so a dismissal is known only once that has had its turn.
    window.setTimeout(() => this.settle(null), 0);
  }

  private settle(item: TItem | null) {
    if (this.isSettled) return;
    this.isSettled = true;
    this.onDone(item);
  }
}

export async function chooseFromSuggestions<TItem>(app: App, options: iChoiceOptions<TItem>): Promise<TItem | null> {
  return new Promise((resolve) => {
    new ChoiceSuggestModal(app, options, resolve).open();
  });
}
