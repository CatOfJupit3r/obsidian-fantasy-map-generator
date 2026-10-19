import { TFile } from 'obsidian';
import type { CachedMetadata, FrontmatterLinkCache, TFolder } from 'obsidian';

import type { FakeVault } from './fake-vault';

/** A wikilink as a whole property value, as Obsidian reads `fmg-map: "[[Maps/Aster.map]]"` into `frontmatterLinks`. */
const FRONTMATTER_WIKILINK = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/u;

/** Obsidian's metadata cache and the file manager's frontmatter writer and trash, over one in-memory store. */
export class FakeMetadata {
  public readonly trashedPaths: string[] = [];

  private readonly frontmatterByPath = new Map<string, Record<string, unknown>>();

  public constructor(private readonly vault: FakeVault) {}

  public setFrontmatter(file: TFile, frontmatter: Record<string, unknown>) {
    this.frontmatterByPath.set(file.path, frontmatter);
  }

  public readFrontmatter(file: TFile): Record<string, unknown> | undefined {
    return this.frontmatterByPath.get(file.path);
  }

  public getFileCache(file: TFile): CachedMetadata | null {
    const frontmatter = this.frontmatterByPath.get(file.path);
    if (!frontmatter) return null;

    const frontmatterLinks = Object.entries(frontmatter).flatMap(([key, value]): FrontmatterLinkCache[] => {
      if (typeof value !== 'string') return [];
      const match = FRONTMATTER_WIKILINK.exec(value);
      return match?.[1] ? [{ key, link: match[1], original: value }] : [];
    });
    return { frontmatter, frontmatterLinks };
  }

  /** The file at the vault path, else the first file with that name; a link without an extension is to a note. */
  public getFirstLinkpathDest(linkpath: string): TFile | null {
    const candidates = linkpath.includes('.') ? [linkpath] : [linkpath, `${linkpath}.md`];
    for (const candidate of candidates) {
      const exact = this.vault.getAbstractFileByPath(candidate);
      if (exact instanceof TFile) return exact;
      const named = this.vault.getFiles().find((file) => file.name === candidate);
      if (named) return named;
    }
    return null;
  }

  public fileToLinktext(file: TFile): string {
    return file.path.replace(/\.md$/u, '');
  }

  public async processFrontMatter(file: TFile, change: (frontmatter: Record<string, unknown>) => void) {
    const frontmatter = { ...this.frontmatterByPath.get(file.path) };
    change(frontmatter);
    this.frontmatterByPath.set(file.path, frontmatter);
  }

  public getNewFileParent(): TFolder {
    return this.vault.getRoot();
  }

  public async trashFile(file: TFile) {
    this.vault.removeFile(file);
    this.trashedPaths.push(file.path);
  }
}
