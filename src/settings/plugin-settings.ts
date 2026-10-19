import { z } from 'zod';

import { DEFAULT_MAP_ENTITY_FOLDERS, readStoredMapEntityFolders } from '../entities/map-entity.constants';
import type { MapEntityFolders } from '../entities/map-entity.constants';
import { DEFAULT_MAP_EXPORT_KINDS, isMapExportKind } from '../map/map-export.constants';
import type { MapExportKind } from '../map/map-export.constants';

export interface iFmgPluginSettings {
  /** Where "New map" creates `.map` files, as a vault path. */
  mapsFolder: string;
  /** The exports a save refreshes next to the `.map`. */
  exportKinds: MapExportKind[];
  /** The loopback port FMG was served from last time; FMG's own options live in that origin's storage. */
  fmgAssetServerPort: number | null;
  /** The vault folder each entity kind's notes live in: where linked notes are created and the link report looks. */
  entityFolders: MapEntityFolders;
}

export const DEFAULT_PLUGIN_SETTINGS: iFmgPluginSettings = {
  mapsFolder: 'Maps',
  exportKinds: DEFAULT_MAP_EXPORT_KINDS,
  fmgAssetServerPort: null,
  entityFolders: DEFAULT_MAP_ENTITY_FOLDERS,
};

const storedSettingsSchema = z
  .object({
    mapsFolder: z.string().catch(DEFAULT_PLUGIN_SETTINGS.mapsFolder),
    exportKinds: z.array(z.unknown()).optional().catch(undefined),
    fmgAssetServerPort: z.number().int().min(1).max(65_535).nullable().catch(DEFAULT_PLUGIN_SETTINGS.fmgAssetServerPort),
    entityFolders: z.record(z.string(), z.unknown()).optional().catch(undefined),
  })
  .partial();

/** The settings Obsidian stored for the plugin, with defaults for anything missing or unreadable. */
export function readPluginSettings(stored: unknown): iFmgPluginSettings {
  const parsed = storedSettingsSchema.safeParse(stored ?? {});
  const settings = parsed.success ? parsed.data : {};
  return {
    mapsFolder: settings.mapsFolder ?? DEFAULT_PLUGIN_SETTINGS.mapsFolder,
    // One unknown kind, say from a newer plugin version, drops only itself.
    exportKinds: settings.exportKinds
      ? [...new Set(settings.exportKinds.filter(isMapExportKind))]
      : DEFAULT_PLUGIN_SETTINGS.exportKinds,
    fmgAssetServerPort: settings.fmgAssetServerPort ?? DEFAULT_PLUGIN_SETTINGS.fmgAssetServerPort,
    entityFolders: readStoredMapEntityFolders(settings.entityFolders ?? {}),
  };
}


export interface iPluginSettingsStore {
  read: () => iFmgPluginSettings;
  update: (change: Partial<iFmgPluginSettings>) => Promise<void>;
}
