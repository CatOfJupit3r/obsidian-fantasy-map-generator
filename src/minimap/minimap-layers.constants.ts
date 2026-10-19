import { em } from 'enumwaii';

import { MAP_ENTITY_KINDS } from '../entities/map-entity.constants';
import type { MapEntityKind } from '../entities/map-entity.constants';

/** FMG's group of state names, inside its `#labels` group next to the groups of burg names. */
const STATE_LABELS_GROUP_ID = 'labels-state';

/** The children of FMG's `#viewbox` group drawn above the area colors: burg icons and every label. */
export const OVERLAY_GROUP_IDS = ['burgIcons', 'anchors', 'labels'];

/** The parts of FMG's SVG export a mini-map can show or hide. */
const minimapLayersEnumwaii = em(['RIVERS', 'ROUTES', 'BORDERS', 'BURGS', 'STATE_LABELS']);
export const MINIMAP_LAYERS = minimapLayersEnumwaii.enum;
export type MinimapLayer = (typeof minimapLayersEnumwaii)['~type'];
export const MINIMAP_LAYER_VALUES = minimapLayersEnumwaii.values;

interface iMinimapLayerFormat {
  label: string;
  /** CSS selectors of the layer's elements in FMG's SVG export. */
  selectors: string[];
  /** Drawn above the area colors, so they stay readable on top of them; then within `OVERLAY_GROUP_IDS`. */
  isAboveAreas: boolean;
}

const minimapLayerFormats = minimapLayersEnumwaii.derive<iMinimapLayerFormat>()(
  [MINIMAP_LAYERS.RIVERS, { label: 'Rivers and lakes', selectors: ['#rivers', '#lakes'], isAboveAreas: false }],
  [MINIMAP_LAYERS.ROUTES, { label: 'Routes', selectors: ['#routes'], isAboveAreas: false }],
  [MINIMAP_LAYERS.BORDERS, { label: 'Borders', selectors: ['#borders'], isAboveAreas: false }],
  [
    MINIMAP_LAYERS.BURGS,
    {
      label: 'Burgs',
      selectors: ['#burgIcons', '#anchors', `#labels > :not(#${STATE_LABELS_GROUP_ID})`],
      isAboveAreas: true,
    },
  ],
  [
    MINIMAP_LAYERS.STATE_LABELS,
    { label: 'State names', selectors: [`#${STATE_LABELS_GROUP_ID}`], isAboveAreas: true },
  ],
);
export const readMinimapLayerFormat = (layer: MinimapLayer): iMinimapLayerFormat => minimapLayerFormats.get(layer);

/**
 * FMG's own area fills and frame, always left out: the mini-map draws the areas itself, from the JSON export, so they
 * show whatever layers were on in FMG at save.
 */
export const HIDDEN_FMG_SELECTORS = ['#regions', '#provs', '#cults', '#relig', '#scaleBar', '#vignette'];

/** What the mini-map fills areas by: nothing, or the entities of one area kind in FMG's colors. */
const minimapAreaColoringsEnumwaii = em(['NONE', 'STATE', 'PROVINCE', 'CULTURE', 'RELIGION']);
export const MINIMAP_AREA_COLORINGS = minimapAreaColoringsEnumwaii.enum;
export type MinimapAreaColoring = (typeof minimapAreaColoringsEnumwaii)['~type'];
export const MINIMAP_AREA_COLORING_VALUES = minimapAreaColoringsEnumwaii.values;

interface iMinimapAreaColoringFormat {
  label: string;
  /** The entity kind whose areas are filled, or null for none. */
  kind: MapEntityKind | null;
}

const minimapAreaColoringFormats = minimapAreaColoringsEnumwaii.derive<iMinimapAreaColoringFormat>()(
  [MINIMAP_AREA_COLORINGS.NONE, { label: 'No areas', kind: null }],
  [MINIMAP_AREA_COLORINGS.STATE, { label: 'States', kind: MAP_ENTITY_KINDS.STATE }],
  [MINIMAP_AREA_COLORINGS.PROVINCE, { label: 'Provinces', kind: MAP_ENTITY_KINDS.PROVINCE }],
  [MINIMAP_AREA_COLORINGS.CULTURE, { label: 'Cultures', kind: MAP_ENTITY_KINDS.CULTURE }],
  [MINIMAP_AREA_COLORINGS.RELIGION, { label: 'Religions', kind: MAP_ENTITY_KINDS.RELIGION }],
);
export const readMinimapAreaColoringFormat = (coloring: MinimapAreaColoring): iMinimapAreaColoringFormat =>
  minimapAreaColoringFormats.get(coloring);

/** A mini-map of an area entity colors areas of its own kind; one of a point or zone colors states. */
const DEFAULT_AREA_COLORINGS = new Map<MapEntityKind, MinimapAreaColoring>([
  [MAP_ENTITY_KINDS.STATE, MINIMAP_AREA_COLORINGS.STATE],
  [MAP_ENTITY_KINDS.PROVINCE, MINIMAP_AREA_COLORINGS.PROVINCE],
  [MAP_ENTITY_KINDS.CULTURE, MINIMAP_AREA_COLORINGS.CULTURE],
  [MAP_ENTITY_KINDS.RELIGION, MINIMAP_AREA_COLORINGS.RELIGION],
]);

export function readDefaultAreaColoring(kind: MapEntityKind): MinimapAreaColoring {
  return DEFAULT_AREA_COLORINGS.get(kind) ?? MINIMAP_AREA_COLORINGS.STATE;
}

/** State names would label the wrong areas on a map of cultures, religions or provinces, so those start without them. */
const KINDS_WITHOUT_STATE_LABELS = new Set<MapEntityKind>([
  MAP_ENTITY_KINDS.PROVINCE,
  MAP_ENTITY_KINDS.CULTURE,
  MAP_ENTITY_KINDS.RELIGION,
]);

export function readDefaultVisibleLayers(kind: MapEntityKind): Set<MinimapLayer> {
  return new Set(
    MINIMAP_LAYER_VALUES.filter(
      (layer) => layer !== MINIMAP_LAYERS.STATE_LABELS || !KINDS_WITHOUT_STATE_LABELS.has(kind),
    ),
  );
}
