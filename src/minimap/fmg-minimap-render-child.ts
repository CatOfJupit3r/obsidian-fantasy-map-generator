import { Keymap, MarkdownRenderChild, parseYaml, TFile } from 'obsidian';
import type { App } from 'obsidian';

import { readMapEntityKindFormat } from '../entities/map-entity.constants';
import type { iMapEntitySummary } from '../entities/map-entity.types';
import type { NoteLinkIndex } from '../links/note-link-index';
import { MAP_EXPORT_KINDS } from '../map/map-export.constants';
import { buildMapExportPath } from '../map/map-file-paths';
import { MINIMAP_HEIGHT_PX, parseMinimapBlockOptions } from './fmg-minimap-block.schema';
import { MinimapSvgBuilder } from './minimap-svg-builder';
import type { iMinimapTarget, MinimapTargetResolver } from './minimap-target-resolver';
import { MinimapViewport } from './minimap-viewport';

/** The view zooms in until it shows this share of the entity's crop, and out to this multiple of the map's width. */
const MIN_VIEW_SHARE_OF_CROP = 0.05;
const MAX_VIEW_SHARE_OF_MAP = 1.5;

/** The exports a block draws from, the crisp SVG first; a change to any of them redraws the block. */
const BACKDROP_EXPORT_KINDS = [MAP_EXPORT_KINDS.SVG, MAP_EXPORT_KINDS.PNG];

export interface iMinimapHost {
  app: App;
  resolver: MinimapTargetResolver;
  noteLinkIndex: NoteLinkIndex;
  /** A page-unique id for the block's SVG mask. */
  createMaskId: () => string;
}

/** One `fmg-map` block: the map's export cropped to an entity, redrawn whenever the map's exports change. */
export class FmgMinimapRenderChild extends MarkdownRenderChild {
  private readonly svgBuilder = new MinimapSvgBuilder();

  private watchedPaths = new Set<string>();

  public constructor(
    containerEl: HTMLElement,
    private readonly source: string,
    private readonly sourcePath: string,
    private readonly host: iMinimapHost,
  ) {
    super(containerEl);
  }

  public onload() {
    const { vault, metadataCache } = this.host.app;
    this.registerEvent(
      vault.on('modify', (file) => {
        if (this.watchedPaths.has(file.path)) this.redraw();
      }),
    );
    this.registerEvent(
      metadataCache.on('changed', (file) => {
        if (file.path === this.sourcePath) this.redraw();
      }),
    );
    this.redraw();
  }

  private redraw() {
    void this.draw().catch((error: unknown) => {
      this.showMessage(error instanceof Error ? error.message : String(error));
    });
  }

  private async draw() {
    const options = parseMinimapBlockOptions(this.readYaml());
    if (typeof options === 'string') {
      this.showMessage(options);
      return;
    }

    const target = await this.host.resolver.resolve(options, this.sourcePath);
    const mapPath = target.mapFile.path;
    this.watchedPaths = new Set(
      [MAP_EXPORT_KINDS.JSON, ...BACKDROP_EXPORT_KINDS].map((kind) => buildMapExportPath(mapPath, kind)),
    );
    const backdrop = this.readBackdrop(mapPath);

    this.containerEl.empty();
    const frame = this.containerEl.createDiv({ cls: 'fmg-minimap' });
    frame.style.setProperty('--fmg-minimap-height', `${options.height ?? MINIMAP_HEIGHT_PX.default}px`);
    this.drawMap(frame, target, backdrop);

    const kindLabel = readMapEntityKindFormat(target.entity.kind).label;
    frame.createDiv({
      cls: 'fmg-minimap-caption',
      text: `${target.entity.name} · ${kindLabel} · scroll to zoom, drag to pan, double-click to reset`,
    });
    if (!backdrop) {
      frame.createDiv({
        cls: 'fmg-minimap-caption',
        text: 'Turn on the SVG or PNG export and save the map to draw the map under the outline.',
      });
    }
  }

  private drawMap(frame: HTMLElement, target: iMinimapTarget, backdrop: TFile | null) {
    const { model, entity, mapFile } = target;
    const cropBox = model.geometry.readCropBox(entity);
    if (!cropBox) throw new Error(`${entity.name} has no place on the map.`);

    const viewportHolder: { viewport: MinimapViewport | null } = { viewport: null };
    const svg = this.svgBuilder.build({
      model,
      ref: entity,
      backdropUrl: backdrop ? this.host.app.vault.getResourcePath(backdrop) : null,
      linkedNeighbours: model.neighbours
        .read(entity)
        .filter((neighbour) => this.host.noteLinkIndex.findNote(mapFile.path, neighbour)),
      onNeighbourClick: (neighbour, event) => {
        if (!viewportHolder.viewport?.wasDragged()) this.openNeighbourNote(mapFile.path, neighbour, event);
      },
      maskId: this.host.createMaskId(),
    });
    frame.append(svg);

    viewportHolder.viewport = new MinimapViewport(svg, cropBox, {
      minWidth: (cropBox.x1 - cropBox.x0) * MIN_VIEW_SHARE_OF_CROP,
      maxWidth: model.data.info.width * MAX_VIEW_SHARE_OF_MAP,
    });
  }

  private openNeighbourNote(mapPath: string, neighbour: iMapEntitySummary, event: MouseEvent) {
    const note = this.host.noteLinkIndex.findNote(mapPath, neighbour);
    if (!note) return;
    void this.host.app.workspace
      .openLinkText(note.path, this.sourcePath, Keymap.isModEvent(event))
      .catch((error: unknown) => {
        this.showMessage(`Could not open ${note.path}: ${error instanceof Error ? error.message : String(error)}`);
      });
  }

  private readBackdrop(mapPath: string): TFile | null {
    for (const kind of BACKDROP_EXPORT_KINDS) {
      const file = this.host.app.vault.getAbstractFileByPath(buildMapExportPath(mapPath, kind));
      if (file instanceof TFile) return file;
    }
    return null;
  }

  /** The block's YAML, or a string that fails the option schema when the YAML does not parse. */
  private readYaml(): unknown {
    if (this.source.trim() === '') return {};
    try {
      const yaml: unknown = parseYaml(this.source);
      return yaml;
    } catch {
      return 'unreadable YAML';
    }
  }

  private showMessage(message: string) {
    this.containerEl.empty();
    this.containerEl.createDiv({ cls: 'fmg-minimap-message', text: message });
  }
}
