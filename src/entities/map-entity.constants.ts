import { em } from 'enumwaii';
import { emToZodSchema } from 'enumwaii/zod';

/** The map entities a vault note can stand for, written in its `fmg-kind` property. */
const mapEntityKindsEnumwaii = em(['STATE', 'PROVINCE', 'BURG', 'CULTURE', 'RELIGION', 'MARKER', 'ZONE']);
export const MAP_ENTITY_KINDS = mapEntityKindsEnumwaii.enum;
export type MapEntityKind = (typeof mapEntityKindsEnumwaii)['~type'];
export const mapEntityKindSchema = emToZodSchema(mapEntityKindsEnumwaii);
export const MAP_ENTITY_KIND_VALUES = mapEntityKindsEnumwaii.values;
/** The kinds as plain strings, the keys of records stored as JSON such as the settings. */
const MAP_ENTITY_KIND_NAMES = mapEntityKindsEnumwaii.rawValues;
type MapEntityKindName = (typeof MAP_ENTITY_KIND_NAMES)[number];

/** Areas are sets of map cells; points sit at one place, so their facts and crops come from around that place. */
const mapEntityShapesEnumwaii = em(['AREA', 'POINT']);
export const MAP_ENTITY_SHAPES = mapEntityShapesEnumwaii.enum;
export type MapEntityShape = (typeof mapEntityShapesEnumwaii)['~type'];

interface iMapEntityKindFormat {
  label: string;
  shape: MapEntityShape;
}

const mapEntityKindFormats = mapEntityKindsEnumwaii.derive<iMapEntityKindFormat>()(
  [MAP_ENTITY_KINDS.STATE, { label: 'State', shape: MAP_ENTITY_SHAPES.AREA }],
  [MAP_ENTITY_KINDS.PROVINCE, { label: 'Province', shape: MAP_ENTITY_SHAPES.AREA }],
  [MAP_ENTITY_KINDS.BURG, { label: 'Burg', shape: MAP_ENTITY_SHAPES.POINT }],
  [MAP_ENTITY_KINDS.CULTURE, { label: 'Culture', shape: MAP_ENTITY_SHAPES.AREA }],
  [MAP_ENTITY_KINDS.RELIGION, { label: 'Religion', shape: MAP_ENTITY_SHAPES.AREA }],
  [MAP_ENTITY_KINDS.MARKER, { label: 'Marker', shape: MAP_ENTITY_SHAPES.POINT }],
  [MAP_ENTITY_KINDS.ZONE, { label: 'Zone', shape: MAP_ENTITY_SHAPES.AREA }],
);
export const readMapEntityKindFormat = (kind: MapEntityKind): iMapEntityKindFormat => mapEntityKindFormats.get(kind);

/**
 * The vault folder the link report creates each kind's notes in. Empty, the default, leaves it to Obsidian's own
 * location for new notes; notes are found by their properties, wherever they are.
 */
export const DEFAULT_MAP_ENTITY_FOLDERS = mapEntityKindsEnumwaii.derive<string>()(
  [MAP_ENTITY_KINDS.STATE, ''],
  [MAP_ENTITY_KINDS.PROVINCE, ''],
  [MAP_ENTITY_KINDS.BURG, ''],
  [MAP_ENTITY_KINDS.CULTURE, ''],
  [MAP_ENTITY_KINDS.RELIGION, ''],
  [MAP_ENTITY_KINDS.MARKER, ''],
  [MAP_ENTITY_KINDS.ZONE, ''],
).record;
export type MapEntityFolders = Readonly<Record<MapEntityKindName, string>>;

export function readMapEntityFolder(folders: MapEntityFolders, kind: MapEntityKind): string {
  const kindName: MapEntityKindName = kind;
  return folders[kindName];
}

/** The folders with `kind`'s replaced. */
export function writeMapEntityFolder(folders: MapEntityFolders, kind: MapEntityKind, folder: string): MapEntityFolders {
  const kindName: MapEntityKindName = kind;
  return { ...folders, [kindName]: folder };
}

/** Each kind's folder from stored settings, or its default when missing or not text. */
export function readStoredMapEntityFolders(stored: Record<string, unknown>): MapEntityFolders {
  const folders: Record<MapEntityKindName, string> = { ...DEFAULT_MAP_ENTITY_FOLDERS };
  for (const kindName of MAP_ENTITY_KIND_NAMES) {
    const folder = stored[kindName];
    if (typeof folder === 'string') folders[kindName] = folder;
  }
  return folders;
}
