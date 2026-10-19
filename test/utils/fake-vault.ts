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

  private readonly root = createFolder('/');

  public seedFile(path: string, content: string | ArrayBuffer): TFile {
    const file = createFile(path, this.nowMs);
    this.entries.set(path, file);
    this.contents.set(path, content);
    this.readParentFolder(path)?.children.push(file);
    return file;
  }

  public seedFolder(path: string): TFolder {
    const folder = createFolder(path);
    this.entries.set(path, folder);
    this.readParentFolder(path)?.children.push(folder);
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

  public getRoot(): TFolder {
    return this.root;
  }

  public getFiles(): TFile[] {
    return [...this.entries.values()].filter((entry): entry is TFile => entry instanceof TFile);
  }

  /** Takes the file out of the vault, as moving it to the trash does. */
  public removeFile(file: TFile) {
    const folder = this.readParentFolder(this.requireFile(file).path);
    if (folder) folder.children = folder.children.filter((child) => child !== file);
    this.entries.delete(file.path);
    this.contents.delete(file.path);
  }

  public getMarkdownFiles(): TFile[] {
    return [...this.entries.values()].filter((entry): entry is TFile => entry instanceof TFile && entry.extension === 'md');
  }

  public async process(file: TFile, change: (data: string) => string): Promise<string> {
    const content = this.contents.get(this.requireFile(file).path);
    const changed = change(typeof content === 'string' ? content : '');
    this.write(file, changed);
    return changed;
  }

  /** Moves a file within existing folders, as `Vault.rename` does. */
  public async rename(file: TAbstractFile, newPath: string): Promise<void> {
    if (!(file instanceof TFile)) throw new Error('The fake vault renames files only.');
    if (this.entries.has(newPath)) throw new Error(`File already exists: ${newPath}`);
    const content = this.contents.get(this.requireFile(file).path) ?? '';
    const oldFolder = this.readParentFolder(file.path);
    if (oldFolder) oldFolder.children = oldFolder.children.filter((child) => child !== file);
    this.entries.delete(file.path);
    this.contents.delete(file.path);

    const moved = createFile(newPath, file.stat.mtime);
    Object.assign(file, { path: moved.path, name: moved.name, basename: moved.basename, extension: moved.extension });
    this.entries.set(newPath, file);
    this.contents.set(newPath, content);
    this.readParentFolder(newPath)?.children.push(file);
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

  private readParentFolder(path: string): TFolder | null {
    const separator = path.lastIndexOf('/');
    if (separator === -1) return path === '/' ? null : this.root;
    const parent = this.entries.get(path.slice(0, separator));
    return parent instanceof TFolder ? parent : null;
  }

  private requireFile(file: TFile): TFile {
    if (this.entries.get(file.path) !== file) throw new Error(`File does not exist: ${file.path}`);
    return file;
  }
}
