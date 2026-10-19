import { TFile, TFolder } from 'obsidian';
import type { DataWriteOptions, TAbstractFile } from 'obsidian';

import type { MapVault } from '../../src/map/map.types';

/** The clock the vault stamps writes with, unless a write names its own time. */
export const FAKE_VAULT_START_MS = 1_700_000_000_000;

function createFile(path: string, mtime: number): TFile {
  const file = new TFile();
  const name = path.split('/').at(-1) ?? path;
  const extensionStart = name.lastIndexOf('.');
  file.path = path;
  file.name = name;
  file.basename = extensionStart > 0 ? name.slice(0, extensionStart) : name;
  file.extension = extensionStart > 0 ? name.slice(extensionStart + 1) : '';
  file.stat = { ctime: mtime, mtime, size: 0 };
  return file;
}

function createFolder(path: string): TFolder {
  const folder = new TFolder();
  folder.path = path;
  folder.name = path.split('/').at(-1) ?? path;
  return folder;
}

function toBuffer(content: string | ArrayBuffer): ArrayBuffer {
  return typeof content === 'string' ? new TextEncoder().encode(content).buffer : content;
}

/** An in-memory vault with the operations the plugin uses; it fails where Obsidian would. */
export class FakeVault implements MapVault {
  public nowMs = FAKE_VAULT_START_MS;

  private readonly contents = new Map<string, string | ArrayBuffer>();

  private readonly entries = new Map<string, TAbstractFile>();

  public seedFile(path: string, content: string | ArrayBuffer): TFile {
    const file = createFile(path, this.nowMs);
    this.entries.set(path, file);
    this.contents.set(path, content);
    return file;
  }

  public seedFolder(path: string): TFolder {
    const folder = createFolder(path);
    this.entries.set(path, folder);
    return folder;
  }

  /** A change made by another program, as Obsidian's file watcher reports it. */
  public writeExternally(file: TFile, content: string, mtime: number) {
    this.contents.set(file.path, content);
    file.stat.mtime = mtime;
  }

  public readText(path: string): string | undefined {
    const content = this.contents.get(path);
    return typeof content === 'string' ? content : undefined;
  }

  public readBytes(path: string): ArrayBuffer | undefined {
    const content = this.contents.get(path);
    return content instanceof ArrayBuffer ? content : undefined;
  }

  public listPaths(): string[] {
    return [...this.entries.keys()].sort();
  }

  public getAbstractFileByPath(path: string): TAbstractFile | null {
    return this.entries.get(path) ?? null;
  }

  public async readBinary(file: TFile): Promise<ArrayBuffer> {
    return toBuffer(this.contents.get(this.requireFile(file).path) ?? '');
  }

  public async modify(file: TFile, data: string, options?: DataWriteOptions): Promise<void> {
    this.write(file, data, options);
  }

  public async modifyBinary(file: TFile, data: ArrayBuffer, options?: DataWriteOptions): Promise<void> {
    this.write(file, data, options);
  }

  public async create(path: string, data: string): Promise<TFile> {
    return this.add(path, data);
  }

  public async createBinary(path: string, data: ArrayBuffer): Promise<TFile> {
    return this.add(path, data);
  }

  public async createFolder(path: string): Promise<TFolder> {
    if (this.entries.has(path)) throw new Error(`Folder already exists: ${path}`);
    return this.seedFolder(path);
  }

  private write(file: TFile, data: string | ArrayBuffer, options?: DataWriteOptions) {
    this.contents.set(this.requireFile(file).path, data);
    file.stat.mtime = options?.mtime ?? this.nowMs;
  }

  private add(path: string, data: string | ArrayBuffer): TFile {
    if (this.entries.has(path)) throw new Error(`File already exists: ${path}`);

    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    if (folder && !(this.entries.get(folder) instanceof TFolder)) throw new Error(`Folder does not exist: ${folder}`);

    return this.seedFile(path, data);
  }

  private requireFile(file: TFile): TFile {
    if (this.entries.get(file.path) !== file) throw new Error(`File does not exist: ${file.path}`);
    return file;
  }
}
