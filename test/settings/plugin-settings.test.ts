import { describe, expect, it } from 'vitest';

import { MAP_ENTITY_KINDS, readMapEntityFolder } from '../../src/entities/map-entity.constants';
import { MAP_EXPORT_KINDS } from '../../src/map/map-export.constants';
import { DEFAULT_PLUGIN_SETTINGS, readPluginSettings } from '../../src/settings/plugin-settings';

describe('readPluginSettings', () => {
  it('drops only the export kinds it does not know', () => {
    const settings = readPluginSettings({
      exportKinds: [MAP_EXPORT_KINDS.SVG, 'KML_FROM_THE_FUTURE', MAP_EXPORT_KINDS.JSON, MAP_EXPORT_KINDS.SVG, 7],
    });

    expect(settings.exportKinds).toEqual([MAP_EXPORT_KINDS.SVG, MAP_EXPORT_KINDS.JSON]);
  });

  it('keeps an empty export list, and uses the defaults for what is missing or unreadable', () => {
    expect(readPluginSettings({ exportKinds: [] }).exportKinds).toEqual([]);
    expect(readPluginSettings(undefined)).toEqual(DEFAULT_PLUGIN_SETTINGS);
    expect(readPluginSettings({ mapsFolder: 12, exportKinds: 'png' })).toEqual(DEFAULT_PLUGIN_SETTINGS);
  });

  it('keeps each stored entity folder, with no folder for a kind missing or not text', () => {
    const { entityFolders } = readPluginSettings({ entityFolders: { STATE: 'World/States', BURG: 3, RIVER: 'x' } });

    expect(readMapEntityFolder(entityFolders, MAP_ENTITY_KINDS.STATE)).toBe('World/States');
    expect(readMapEntityFolder(entityFolders, MAP_ENTITY_KINDS.BURG)).toBe('');
    expect(readMapEntityFolder(entityFolders, MAP_ENTITY_KINDS.ZONE)).toBe('');
    expect(entityFolders).not.toHaveProperty('RIVER');
  });
});
