import { readMapEntityKindFormat } from '../entities/map-entity.constants';
import type { iMapEntitySummary } from '../entities/map-entity.types';
import { MapBlockRenderChild } from '../map-blocks/map-block-render-child';
import type { MapBlockTarget } from '../map-blocks/map-block-options.schema';
import type { iMapBlockTarget } from '../map-blocks/map-block-target-resolver';
import { MAP_EXPORT_KINDS } from '../map/map-export.constants';
import { parseFactsBlockOptions } from './fmg-facts-block.schema';
import { MapFactsCalculator } from './map-facts.calculator';
import { MAP_FACT_PART_KIND_CASES } from './map-facts.types';
import type { MapFactPart } from './map-facts.types';

const PART_SEPARATOR = ', ';

/** One `fmg-facts` block: what the map knows about an entity, read from its Full JSON export whenever it changes. */
export class FmgFactsRenderChild extends MapBlockRenderChild<MapBlockTarget> {
  protected readonly watchedExportKinds = [MAP_EXPORT_KINDS.JSON];

  protected parseOptions(yaml: unknown): MapBlockTarget | string {
    return parseFactsBlockOptions(yaml);
  }

  protected render({ model, entity, mapFile }: iMapBlockTarget) {
    const frame = this.containerEl.createDiv({ cls: 'fmg-facts' });
    frame.createDiv({
      cls: 'fmg-facts-title',
      text: `${entity.name} · ${readMapEntityKindFormat(entity.kind).label}`,
    });

    const facts = new MapFactsCalculator(model).calculate(entity) ?? [];
    if (facts.length === 0) {
      frame.createDiv({ cls: 'fmg-block-message', text: `The map holds no facts about ${entity.name}.` });
      return;
    }

    const list = frame.createEl('dl', { cls: 'fmg-facts-list' });
    for (const fact of facts) {
      list.createEl('dt', { text: fact.label });
      const value = list.createEl('dd');
      for (const [index, part] of fact.parts.entries()) {
        if (index > 0) value.appendText(PART_SEPARATOR);
        this.renderPart(value, mapFile.path, part);
      }
    }
  }

  private renderPart(containerEl: HTMLElement, mapPath: string, part: MapFactPart) {
    switch (part.kind) {
      case MAP_FACT_PART_KIND_CASES.TEXT:
        containerEl.appendText(part.text);
        return;
      case MAP_FACT_PART_KIND_CASES.ENTITY:
        this.renderEntity(containerEl, mapPath, part.entity);
        return;
      default:
        return;
    }
  }

  /** An entity with a note is a link to it; one without is its name. */
  private renderEntity(containerEl: HTMLElement, mapPath: string, entity: iMapEntitySummary) {
    const note = this.host.noteLinkIndex.findNote(mapPath, entity);
    if (!note) {
      containerEl.appendText(entity.name);
      return;
    }

    const link = containerEl.createEl('a', { cls: 'internal-link', text: entity.name, href: note.path });
    link.dataset.href = note.path;
    link.addEventListener('click', (event) => {
      // Reading view opens `.internal-link` clicks itself; the block opens the note once, the way Ctrl/Cmd asks.
      event.preventDefault();
      event.stopPropagation();
      this.openEntityNote(mapPath, entity, event);
    });
  }
}
