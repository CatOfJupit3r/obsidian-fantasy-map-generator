import { TFile } from 'obsidian';
import type { Vault } from 'obsidian';

import { MAP_EXPORT_KINDS } from '../map/map-export.constants';
import { buildMapExportPath } from '../map/map-file-paths';
import { parseFmgMapData } from './fmg-map-data.schema';
import { FmgMapModel } from './fmg-map-model';

export type MapDataVault = Pick<Vault, 'getAbstractFileByPath' | 'readBinary'>;

interface iCachedModel {
  mtime: number;
  size: number;
  model: FmgMapModel;
}

/** Reads each map's Full JSON export next to it, and keeps the parsed model until the export changes. */
export class FmgMapRepository {
  private readonly cache = new Map<string, iCachedModel>();

  public constructor(private readonly vault: MapDataVault) {}

  /** The export file the model of the map at `mapPath` comes from. */
  public readExportPath(mapPath: string): string {
    return buildMapExportPath(mapPath, MAP_EXPORT_KINDS.JSON);
  }

  public async read(mapPath: string): Promise<FmgMapModel> {
    const exportPath = this.readExportPath(mapPath);
    const file = this.vault.getAbstractFileByPath(exportPath);
    if (!(file instanceof TFile)) {
      throw new Error(`${exportPath} is missing. Turn on the Full JSON export and save ${mapPath} in FMG.`);
    }

    const cached = this.cache.get(exportPath);
    if (cached && cached.mtime === file.stat.mtime && cached.size === file.stat.size) return cached.model;

    const model = this.parse(await this.vault.readBinary(file));
    this.cache.set(exportPath, { mtime: file.stat.mtime, size: file.stat.size, model });
    return model;
  }

  public parse(jsonData: ArrayBuffer): FmgMapModel {
    return new FmgMapModel(parseFmgMapData(new TextDecoder().decode(jsonData)));
  }
}
