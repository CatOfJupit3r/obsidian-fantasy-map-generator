import { setIcon } from 'obsidian';

import {
  MINIMAP_AREA_COLORING_VALUES,
  MINIMAP_LAYER_VALUES,
  readMinimapAreaColoringFormat,
  readMinimapLayerFormat,
} from './minimap-layers.constants';
import type { MinimapLayer } from './minimap-layers.constants';
import type { iMinimapLayerState } from './minimap-layers.types';

const CONTROLS_ICON = 'layers';

export interface iMinimapLayerControlsOptions {
  state: iMinimapLayerState;
  /** Whether the backdrop is the SVG export, whose layers can be hidden; the PNG's are baked in. */
  canToggleLayers: boolean;
  onChange: (state: iMinimapLayerState) => unknown;
}

/**
 * The layers button in a mini-map's corner and the panel it opens: what to fill areas by, which layers to show, and
 * whether the view may leave the map.
 */
export class MinimapLayerControls {
  private state: iMinimapLayerState;

  public constructor(
    containerEl: HTMLElement,
    private readonly options: iMinimapLayerControlsOptions,
  ) {
    this.state = options.state;
    const controls = containerEl.createDiv({ cls: 'fmg-minimap-controls' });
    const panel = controls.createDiv({ cls: 'fmg-minimap-controls-panel' });
    panel.hidden = true;

    const button = controls.createEl('button', { cls: 'clickable-icon fmg-minimap-controls-button' });
    button.setAttribute('aria-label', 'Map layers');
    setIcon(button, CONTROLS_ICON);
    button.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      button.toggleClass('is-active', !panel.hidden);
    });

    this.addAreaColoringSelect(panel);
    if (options.canToggleLayers) {
      for (const layer of MINIMAP_LAYER_VALUES) this.addLayerToggle(panel, layer);
    }
    this.addLeaveMapToggle(panel);
  }

  private addLeaveMapToggle(panel: HTMLElement) {
    const row = panel.createEl('label', { cls: 'fmg-minimap-controls-row fmg-minimap-controls-separated' });
    const checkbox = row.createEl('input', { type: 'checkbox' });
    checkbox.checked = this.state.canLeaveMap;
    row.createSpan({ text: 'Show beyond the map edge' });
    checkbox.addEventListener('change', () => this.update({ ...this.state, canLeaveMap: checkbox.checked }));
  }

  private addAreaColoringSelect(panel: HTMLElement) {
    const row = panel.createEl('label', { cls: 'fmg-minimap-controls-row' });
    row.createSpan({ text: 'Fill' });
    const select = row.createEl('select', { cls: 'dropdown' });
    for (const coloring of MINIMAP_AREA_COLORING_VALUES) {
      const option = select.createEl('option', { text: readMinimapAreaColoringFormat(coloring).label, value: coloring });
      option.selected = coloring === this.state.areaColoring;
    }
    select.addEventListener('change', () => {
      const coloring = MINIMAP_AREA_COLORING_VALUES.find((value) => value === select.value);
      if (coloring) this.update({ ...this.state, areaColoring: coloring });
    });
  }

  private addLayerToggle(panel: HTMLElement, layer: MinimapLayer) {
    const row = panel.createEl('label', { cls: 'fmg-minimap-controls-row' });
    const checkbox = row.createEl('input', { type: 'checkbox' });
    checkbox.checked = this.state.visibleLayers.has(layer);
    row.createSpan({ text: readMinimapLayerFormat(layer).label });
    checkbox.addEventListener('change', () => {
      const visibleLayers = new Set(this.state.visibleLayers);
      if (checkbox.checked) visibleLayers.add(layer);
      else visibleLayers.delete(layer);
      this.update({ ...this.state, visibleLayers });
    });
  }

  private update(state: iMinimapLayerState) {
    this.state = state;
    this.options.onChange(state);
  }
}
