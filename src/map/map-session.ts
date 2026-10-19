import { TFile } from 'obsidian';

import type { MapExportKind } from './map-export.constants';
import { readMapExportFormat } from './map-export.constants';
import { buildMapCopyPath, buildMapExportPath } from './map-file-paths';
import { MAP_SAVE_OUTCOME_KIND_CASES } from './map.types';
import type { iMapEditor, iMapSaveReport, MapSaveOutcome, MapVault } from './map.types';

/** File systems store modification times coarsely (FAT keeps two seconds), so smaller differences are no change. */
const MTIME_TOLERANCE_MS = 2000;
const MAX_COPY_ATTEMPTS = 100;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface iSaveOptions {
  /** Writes even when the file changed on disk since the session last read or wrote it. */
  shouldOverwrite?: boolean;
}

/** One `.map` file open in one editor: reads it into the editor and writes the editor's map and exports back. */
export class MapSession {
  /** The map's content as last loaded or saved, to tell whether the editor holds unsaved edits. */
  private savedContent: string | null = null;

  /** The file's modification time when the session last read or wrote it. */
  private knownMtime: number | null = null;

  public constructor(
    private readonly vault: MapVault,
    private readonly editor: iMapEditor,
    private readonly readExportKinds: () => MapExportKind[],
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** An empty file is a new map: it keeps the map the editor generated and saves it. */
  public async open(file: TFile): Promise<iMapSaveReport | null> {
    const mapData = await this.vault.readBinary(file);
    if (mapData.byteLength === 0) {
      const outcome = await this.save(file, { shouldOverwrite: true });
      return outcome.kind === MAP_SAVE_OUTCOME_KIND_CASES.SAVED ? outcome.report : null;
    }

    await this.editor.loadMap(mapData);
    this.knownMtime = file.stat.mtime;
    this.savedContent = (await this.editor.serializeMap()).content;
    return null;
  }

  public hasChangedOnDisk(file: TFile): boolean {
    return this.knownMtime !== null && Math.abs(file.stat.mtime - this.knownMtime) > MTIME_TOLERANCE_MS;
  }

  public async hasUnsavedChanges(): Promise<boolean> {
    if (this.savedContent === null) return false;
    return (await this.editor.serializeMap()).content !== this.savedContent;
  }

  /** Writes the map first, so a failing export never loses the map itself. */
  public async save(file: TFile, { shouldOverwrite }: iSaveOptions = {}): Promise<MapSaveOutcome> {
    if (!shouldOverwrite && this.hasChangedOnDisk(file)) return { kind: MAP_SAVE_OUTCOME_KIND_CASES.CONFLICT };

    const serialized = await this.editor.serializeMap();
    const mtime = this.now();
    await this.vault.modify(file, serialized.text, { mtime });
    this.knownMtime = mtime;
    this.savedContent = serialized.content;

    return { kind: MAP_SAVE_OUTCOME_KIND_CASES.SAVED, report: await this.writeExports(file) };
  }

  /** Writes the editor's map next to the file instead of over it, and returns the copy's path. */
  public async saveCopy(file: TFile): Promise<string> {
    const { text } = await this.editor.serializeMap();
    for (let attempt = 0; attempt < MAX_COPY_ATTEMPTS; attempt += 1) {
      const path = buildMapCopyPath(file.path, attempt);
      if (!this.vault.getAbstractFileByPath(path)) {
        await this.vault.create(path, text);
        return path;
      }
    }
    throw new Error(`No free name for a copy of ${file.path}.`);
  }

  private async writeExports(file: TFile): Promise<iMapSaveReport> {
    const exportPaths: string[] = [];
    const kinds = this.readExportKinds();
    try {
      const exportedFiles = kinds.length > 0 ? await this.editor.exportMap(kinds) : [];
      for (const exported of exportedFiles) {
        if (exported.data.byteLength === 0)
          throw new Error(`The ${readMapExportFormat(exported.kind).label} is empty.`);
        const path = buildMapExportPath(file.path, exported.kind);
        await this.writeBinary(path, exported.data);
        exportPaths.push(path);
      }
    } catch (error) {
      return { mapPath: file.path, exportPaths, exportError: describeError(error) };
    }
    return { mapPath: file.path, exportPaths, exportError: null };
  }

  private async writeBinary(path: string, data: ArrayBuffer) {
    const existing = this.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) await this.vault.modifyBinary(existing, data);
    else await this.vault.createBinary(path, data);
  }
}
