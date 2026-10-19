import { normalizePath } from 'obsidian';

import type { iMapEntityRef } from '../entities/map-entity.types';
import { readMapExportFormat } from './map-export.constants';
import type { MapExportKind } from './map-export.constants';

export const MAP_FILE_EXTENSION = 'map';
export const NEW_MAP_BASE_NAME = 'Untitled map';

const MAP_EXTENSION_PATTERN = /\.map$/iu;

/** `Maps/Aster.map` exports to `Maps/Aster.fmg.png`, `Maps/Aster.fmg.markers.geojson` and so on. */
export function buildMapExportPath(mapPath: string, kind: MapExportKind): string {
  return `${mapPath.replace(MAP_EXTENSION_PATTERN, '')}${readMapExportFormat(kind).suffix}`;
}

/** The configured maps folder as a vault path, with the empty string for the vault root. */
export function normalizeMapsFolder(folder: string): string {
  const normalized = normalizePath(folder.trim());
  return normalized === '/' ? '' : normalized;
}

/** `Untitled map.map`, then `Untitled map 1.map`, `Untitled map 2.map` and so on. */
export function buildNewMapPath(folder: string, attempt: number): string {
  const name = attempt === 0 ? NEW_MAP_BASE_NAME : `${NEW_MAP_BASE_NAME} ${attempt}`;
  const fileName = `${name}.${MAP_FILE_EXTENSION}`;
  return folder ? `${folder}/${fileName}` : fileName;
}

/** Where unsaved edits go when the file changed on disk: `Aster (unsaved changes).map`, then `... 2.map` and so on. */
export function buildMapCopyPath(mapPath: string, attempt: number): string {
  const marker = attempt === 0 ? 'unsaved changes' : `unsaved changes ${attempt + 1}`;
  return `${mapPath.replace(MAP_EXTENSION_PATTERN, '')} (${marker}).${MAP_FILE_EXTENSION}`;
}

/** Every file the plugin writes for `Maps/Aster.map` starts with `Maps/Aster.fmg.`: its exports and thumbnails. */
export function buildMapGeneratedFilePrefix(mapPath: string): string {
  return `${mapPath.replace(MAP_EXTENSION_PATTERN, '')}.fmg.`;
}

/** `Maps/Aster.map` keeps the thumbnail of its state 7 as `Maps/Aster.fmg.state-7.png`. */
export function buildEntityThumbnailPath(mapPath: string, ref: iMapEntityRef): string {
  return `${buildMapGeneratedFilePrefix(mapPath)}${ref.kind.toLowerCase()}-${ref.id}.png`;
}
