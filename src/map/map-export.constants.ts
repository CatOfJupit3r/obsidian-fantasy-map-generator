import { em } from 'enumwaii';
import { emToZodSchema } from 'enumwaii/zod';

/** The files a save can refresh next to the `.map`. */
const mapExportKindsEnumwaii = em(['SVG', 'PNG', 'JSON', 'MARKERS_GEOJSON']);
export const MAP_EXPORT_KINDS = mapExportKindsEnumwaii.enum;
export type MapExportKind = (typeof mapExportKindsEnumwaii)['~type'];
export const mapExportKindSchema = emToZodSchema(mapExportKindsEnumwaii);
export const MAP_EXPORT_KIND_VALUES = mapExportKindsEnumwaii.values;
export const isMapExportKind = (value: unknown): value is MapExportKind => mapExportKindsEnumwaii.is(value);

interface iMapExportFormat {
  /** Appended to the map's path without its `.map` extension. */
  suffix: string;
  label: string;
  description: string;
}

const mapExportFormats = mapExportKindsEnumwaii.derive<iMapExportFormat>()(
  [MAP_EXPORT_KINDS.SVG, { suffix: '.fmg.svg', label: 'SVG render', description: 'The whole map as an SVG image.' }],
  [
    MAP_EXPORT_KINDS.PNG,
    {
      suffix: '.fmg.png',
      label: 'PNG render',
      description: "The whole map as a PNG image at FMG's PNG resolution setting, without scale bar or vignette.",
    },
  ],
  [
    MAP_EXPORT_KINDS.JSON,
    {
      suffix: '.fmg.json',
      label: 'Full JSON',
      description: 'All map data: burgs, markers, states, cells with their climate.',
    },
  ],
  [
    MAP_EXPORT_KINDS.MARKERS_GEOJSON,
    { suffix: '.fmg.markers.geojson', label: 'Markers GeoJSON', description: 'Markers as GeoJSON points.' },
  ],
);
export const readMapExportFormat = (kind: MapExportKind): iMapExportFormat => mapExportFormats.get(kind);

/** The SVG is on so mini-maps stay sharp at any zoom; the PNG's fixed resolution blurs once they zoom in. */
export const DEFAULT_MAP_EXPORT_KINDS: MapExportKind[] = [
  MAP_EXPORT_KINDS.SVG,
  MAP_EXPORT_KINDS.PNG,
  MAP_EXPORT_KINDS.JSON,
  MAP_EXPORT_KINDS.MARKERS_GEOJSON,
];
