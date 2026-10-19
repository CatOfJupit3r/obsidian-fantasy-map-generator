import type { CachedMetadata, TFile } from 'obsidian';

/** Obsidian's frontmatter cache and the file manager's frontmatter writer, over one in-memory store. */
export class FakeMetadata {
  private readonly frontmatterByPath = new Map<string, Record<string, unknown>>();

  public setFrontmatter(file: TFile, frontmatter: Record<string, unknown>) {
    this.frontmatterByPath.set(file.path, frontmatter);
  }

  public readFrontmatter(file: TFile): Record<string, unknown> | undefined {
    return this.frontmatterByPath.get(file.path);
  }

  public getFileCache(file: TFile): CachedMetadata | null {
    const frontmatter = this.frontmatterByPath.get(file.path);
    return frontmatter ? { frontmatter } : null;
  }

  public fileToLinktext(file: TFile): string {
    return file.path.replace(/\.md$/u, '');
  }

  public async processFrontMatter(file: TFile, change: (frontmatter: Record<string, unknown>) => void) {
    const frontmatter = { ...this.frontmatterByPath.get(file.path) };
    change(frontmatter);
    this.frontmatterByPath.set(file.path, frontmatter);
  }
}
