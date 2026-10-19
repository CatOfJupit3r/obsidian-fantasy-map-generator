import type { MinimapAreaColoring, MinimapLayer } from './minimap-layers.constants';

/** What a mini-map shows: kept while its note is open, reset when it is opened again. */
export interface iMinimapLayerState {
  areaColoring: MinimapAreaColoring;
  visibleLayers: ReadonlySet<MinimapLayer>;
}
