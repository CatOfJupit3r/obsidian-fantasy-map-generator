import { em } from 'enumwaii';
import type { Vault } from 'obsidian';

import type { iMapBox } from '../map-data/map-geometry.types';
import type { MapExportKind } from './map-export.constants';

/** The vault operations the plugin uses. */
export type MapVault = Pick<
  Vault,
  'readBinary' | 'modify' | 'create' | 'createBinary' | 'modifyBinary' | 'createFolder' | 'getAbstractFileByPath'
>;

export interface iExportedMapFile {
  kind: MapExportKind;
  data: ArrayBuffer;
}

export interface iSerializedMap {
  /** The `.map` file's text. */
  text: string;
  /** The text without what changes when only the view changes (zoom, save date); equal content means no edits. */
  content: string;
}

/** A part of the map drawn into a PNG of `width` by `height` pixels. */
export interface iMapRegionImage {
  box: iMapBox;
  width: number;
  height: number;
}

/** The map editor running in the view, as the plugin sees it. */
export interface iMapEditor {
  /** Opens a map from the bytes of a `.map` file. */
  loadMap: (mapData: ArrayBuffer) => Promise<void>;
  serializeMap: () => Promise<iSerializedMap>;
  exportMap: (kinds: MapExportKind[]) => Promise<iExportedMapFile[]>;
  /** One PNG per region, in the same order. */
  renderRegions: (regions: iMapRegionImage[]) => Promise<ArrayBuffer[]>;
}

export interface iMapSaveReport {
  mapPath: string;
  exportPaths: string[];
  /** Set when the map was written but an export was not. */
  exportError: string | null;
}

const mapSaveOutcomeKindsEnumwaii = em(['SAVED', 'CONFLICT']);
export const MAP_SAVE_OUTCOME_KIND_CASES = mapSaveOutcomeKindsEnumwaii.cases;

interface iMapSaved {
  kind: typeof MAP_SAVE_OUTCOME_KIND_CASES.SAVED;
  report: iMapSaveReport;
}

/** The file changed on disk since the session last read or wrote it; nothing was written. */
interface iMapSaveConflict {
  kind: typeof MAP_SAVE_OUTCOME_KIND_CASES.CONFLICT;
}

export type MapSaveOutcome = iMapSaved | iMapSaveConflict;
