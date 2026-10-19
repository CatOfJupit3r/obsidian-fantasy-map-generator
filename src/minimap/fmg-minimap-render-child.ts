import { TFile } from 'obsidian';

import { readMapEntityKindFormat } from '../entities/map-entity.constants';
import { MapBlockRenderChild } from '../map-blocks/map-block-render-child';
import type { iMapBlockHost } from '../map-blocks/map-block-render-child';
import type { iMapBlockTarget } from '../map-blocks/map-block-target-resolver';
import { MAP_EXPORT_KINDS } from '../map/map-export.constants';
import { buildMapExportPath } from '../map/map-file-paths';
import { MINIMAP_HEIGHT_PX, parseMinimapBlockOptions } from './fmg-minimap-block.schema';
import type { MinimapBlockOptions } from './fmg-minimap-block.schema';
import type { MinimapAreaPaths } from './minimap-area-paths';
import type { MinimapBackdropVariants } from './minimap-backdrop-variants';
import { MinimapLayerControls } from './minimap-layer-controls';
import {
  HIDDEN_FMG_SELECTORS,
  MINIMAP_LAYER_VALUES,
  OVERLAY_GROUP_IDS,
  readDefaultAreaColoring,
  readDefaultVisibleLayers,
  readMinimapAreaColoringFormat,
  readMinimapLayerFormat,
} from './minimap-layers.constants';
import type { iMinimapLayerState } from './minimap-layers.types';
import { MinimapSvgBuilder } from './minimap-svg-builder';
import type { iMinimapDrawing } from './minimap-svg-builder';
import { MinimapViewport } from './minimap-viewport';

/** The view zooms in until it shows this share of the entity's crop, and out to this multiple of the map's width. */
const MIN_VIEW_SHARE_OF_CROP = 0.05;
const MAX_VIEW_SHARE_OF_MAP = 1.5;

/** The exports a block draws from, the crisp SVG first. */
const BACKDROP_EXPORT_KINDS = [MAP_EXPORT_KINDS.SVG, MAP_EXPORT_KINDS.PNG];
const SVG_EXTENSION = 'svg';

export interface iMinimapHost extends iMapBlockHost {
  /** A page-unique id for the block's SVG mask. */
  createMaskId: () => string;
  backdropVariants: MinimapBackdropVariants;
  areaPaths: MinimapAreaPaths;
}

interface iMinimapLayerImages {
  backdropUrl: string;
  /** Null when no layer above the areas is shown. */
  overlayUrl: string | null;
}

/**
 * One `fmg-map` block: the map's export cropped to an entity, areas filled in their FMG colors, the entity outlined and
 * the rest dimmed. Its layers button changes what is drawn for as long as the note stays open.
 */
export class FmgMinimapRenderChild extends MapBlockRenderChild<MinimapBlockOptions> {
  protected readonly watchedExportKinds = [MAP_EXPORT_KINDS.JSON, ...BACKDROP_EXPORT_KINDS];

  private readonly svgBuilder = new MinimapSvgBuilder();

  /** Kept across redraws, so a save does not undo the reader's choice. */
  private layerState: iMinimapLayerState | null = null;

  /** Numbers the image requests, so a slow one never replaces a newer one. */
  private layerRequestCount = 0;

  public constructor(
    containerEl: HTMLElement,
    source: string,
    sourcePath: string,
    private readonly minimapHost: iMinimapHost,
  ) {
    super(containerEl, source, sourcePath, minimapHost);
  }

  protected parseOptions(yaml: unknown): MinimapBlockOptions | string {
    return parseMinimapBlockOptions(yaml);
  }

  protected render(target: iMapBlockTarget, options: MinimapBlockOptions) {
    const backdrop = this.readBackdrop(target.mapFile.path);
    const frame = this.containerEl.createDiv({ cls: 'fmg-minimap' });
    frame.style.setProperty('--fmg-minimap-height', `${options.height ?? MINIMAP_HEIGHT_PX.default}px`);
    const drawing = this.drawMap(frame, target);

    const layerState = this.layerState ?? this.readDefaultLayerState(target);
    this.layerState = layerState;
    this.applyLayers(drawing, target, backdrop, layerState);
    new MinimapLayerControls(frame, {
      state: layerState,
      canToggleLayers: backdrop?.extension === SVG_EXTENSION,
      onChange: (state) => {
        this.layerState = state;
        this.applyLayers(drawing, target, backdrop, state);
      },
    });

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
    } else if (backdrop.extension !== SVG_EXTENSION) {
      frame.createDiv({
        cls: 'fmg-minimap-caption',
        text: 'Drawn from the PNG export, which blurs when zoomed in and keeps its layers. Turn on the SVG export and save the map for a sharp one.',
      });
    }
  }

  private drawMap(frame: HTMLElement, target: iMapBlockTarget): iMinimapDrawing {
    const { model, entity, mapFile } = target;
    const cropBox = model.geometry.readCropBox(entity);
    if (!cropBox) throw new Error(`${entity.name} has no place on the map.`);

    const viewportHolder: { viewport: MinimapViewport | null } = { viewport: null };
    const drawing = this.svgBuilder.build({
      model,
      ref: entity,
      linkedNeighbours: model.neighbours
        .read(entity)
        .filter((neighbour) => this.host.noteLinkIndex.findNote(mapFile.path, neighbour)),
      onNeighbourClick: (neighbour, event) => {
        if (!viewportHolder.viewport?.wasDragged()) this.openEntityNote(mapFile.path, neighbour, event);
      },
      maskId: this.minimapHost.createMaskId(),
    });
    frame.append(drawing.svg);

    viewportHolder.viewport = new MinimapViewport(drawing.svg, cropBox, {
      minWidth: (cropBox.x1 - cropBox.x0) * MIN_VIEW_SHARE_OF_CROP,
      maxWidth: model.data.info.width * MAX_VIEW_SHARE_OF_MAP,
    });
    return drawing;
  }

  private readDefaultLayerState(target: iMapBlockTarget): iMinimapLayerState {
    const { kind } = target.entity;
    return { areaColoring: readDefaultAreaColoring(kind), visibleLayers: readDefaultVisibleLayers(kind) };
  }

  private applyLayers(drawing: iMinimapDrawing, target: iMapBlockTarget, backdrop: TFile | null, state: iMinimapLayerState) {
    const coloredKind = readMinimapAreaColoringFormat(state.areaColoring).kind;
    this.svgBuilder.fillAreas(drawing.areas, coloredKind ? this.minimapHost.areaPaths.read(target.model, coloredKind) : []);

    this.layerRequestCount += 1;
    if (!backdrop || backdrop.extension !== SVG_EXTENSION) {
      this.svgBuilder.setImage(drawing.backdrop, backdrop ? this.host.app.vault.getResourcePath(backdrop) : null);
      this.svgBuilder.setImage(drawing.overlay, null);
      return;
    }

    const request = this.layerRequestCount;
    void this.readLayerImages(backdrop, state)
      .then(({ backdropUrl, overlayUrl }) => {
        if (request !== this.layerRequestCount) return;
        this.svgBuilder.setImage(drawing.backdrop, backdropUrl);
        this.svgBuilder.setImage(drawing.overlay, overlayUrl);
      })
      .catch((error: unknown) => {
        this.showMessage(`Could not draw ${backdrop.path}: ${error instanceof Error ? error.message : String(error)}`);
      });
  }

  /**
   * The SVG export split in two around the area colors: under them, the shown layers that sit below; over them, the
   * shown burgs and names alone. FMG's own area fills are always left out, since the block draws its own.
   */
  private async readLayerImages(svgFile: TFile, state: iMinimapLayerState): Promise<iMinimapLayerImages> {
    const { backdropVariants } = this.minimapHost;
    // Each image depends only on its own layers, so toggling one never rebuilds the other.
    const readHiddenSelectors = (isAboveAreas: boolean) =>
      MINIMAP_LAYER_VALUES.filter(
        (layer) => readMinimapLayerFormat(layer).isAboveAreas === isAboveAreas && !state.visibleLayers.has(layer),
      ).flatMap((layer) => readMinimapLayerFormat(layer).selectors);
    const overlaySelectors = OVERLAY_GROUP_IDS.map((id) => `#${id}`);

    const backdropUrl = await backdropVariants.readUrl(svgFile, [
      ...HIDDEN_FMG_SELECTORS,
      ...readHiddenSelectors(false),
      ...overlaySelectors,
    ]);
    const hasOverlay = MINIMAP_LAYER_VALUES.some(
      (layer) => readMinimapLayerFormat(layer).isAboveAreas && state.visibleLayers.has(layer),
    );
    if (!hasOverlay) return { backdropUrl, overlayUrl: null };

    const otherGroupSelectors = (await backdropVariants.listGroupIds(svgFile))
      .filter((id) => !OVERLAY_GROUP_IDS.includes(id))
      .map((id) => `#${CSS.escape(id)}`);
    return {
      backdropUrl,
      overlayUrl: await backdropVariants.readUrl(svgFile, [...otherGroupSelectors, ...readHiddenSelectors(true)]),
    };
  }

  private readBackdrop(mapPath: string): TFile | null {
    for (const kind of BACKDROP_EXPORT_KINDS) {
      const file = this.host.app.vault.getAbstractFileByPath(buildMapExportPath(mapPath, kind));
      if (file instanceof TFile) return file;
    }
    return null;
  }
}
