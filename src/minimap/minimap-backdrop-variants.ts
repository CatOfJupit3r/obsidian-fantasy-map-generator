import type { TFile, Vault } from 'obsidian';

const SVG_MIME_TYPE = 'image/svg+xml';
/** The group of FMG's SVG export that holds every layer. */
const FMG_VIEWBOX_GROUP_ID = 'viewbox';
/** Variants kept per map export; each is a whole copy of the export, about a megabyte for a mid-sized map. */
const MAX_VARIANTS_PER_EXPORT = 8;

export type BackdropVariantsVault = Pick<Vault, 'cachedRead'>;

interface iParsedExport {
  mtime: number;
  document: Promise<Document>;
  /** Object URLs by the sorted selectors of what each leaves out, oldest first. */
  urlsByRemovedSelectors: Map<string, string>;
}

/**
 * FMG's SVG export with some of its layer groups left out, as object URLs for `<image>` elements. The export stays an
 * image, so its styles and ids never reach the note's page.
 */
export class MinimapBackdropVariants {
  private readonly exportsByPath = new Map<string, iParsedExport>();

  public constructor(private readonly vault: BackdropVariantsVault) {}

  /** The ids of the export's layer groups, the children of its `#viewbox` group. */
  public async listGroupIds(svgFile: TFile): Promise<string[]> {
    const viewbox = (await this.readExport(svgFile).document).getElementById(FMG_VIEWBOX_GROUP_ID);
    return viewbox ? [...viewbox.children].map((child) => child.id).filter((id) => id !== '') : [];
  }

  /** The export without the elements the CSS selectors match. */
  public async readUrl(svgFile: TFile, removedSelectors: string[]): Promise<string> {
    const parsed = this.readExport(svgFile);
    const key = [...new Set(removedSelectors)].sort().join(', ');
    const cached = parsed.urlsByRemovedSelectors.get(key);
    if (cached) return cached;

    const variant = (await parsed.document).documentElement.cloneNode(true);
    if (!(variant instanceof Element)) throw new Error(`${svgFile.path} is not an SVG image.`);
    for (const selector of removedSelectors) {
      for (const element of variant.querySelectorAll(selector)) element.remove();
    }

    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(variant)], { type: SVG_MIME_TYPE }));
    parsed.urlsByRemovedSelectors.set(key, url);
    this.evictOldest(parsed.urlsByRemovedSelectors);
    return url;
  }

  /** Lets go of every variant; the URLs stop working. */
  public dispose() {
    for (const parsed of this.exportsByPath.values()) this.revoke(parsed);
    this.exportsByPath.clear();
  }

  /** The parsed export, read anew once the file changes. */
  private readExport(svgFile: TFile): iParsedExport {
    const cached = this.exportsByPath.get(svgFile.path);
    if (cached?.mtime === svgFile.stat.mtime) return cached;
    if (cached) this.revoke(cached);

    const parsed: iParsedExport = {
      mtime: svgFile.stat.mtime,
      document: this.parse(svgFile),
      urlsByRemovedSelectors: new Map(),
    };
    this.exportsByPath.set(svgFile.path, parsed);
    return parsed;
  }

  private async parse(svgFile: TFile): Promise<Document> {
    const document = new DOMParser().parseFromString(await this.vault.cachedRead(svgFile), SVG_MIME_TYPE);
    if (document.querySelector('parsererror')) throw new Error(`${svgFile.path} is not a readable SVG image.`);
    return document;
  }

  private evictOldest(urls: Map<string, string>) {
    for (const [key, url] of urls) {
      if (urls.size <= MAX_VARIANTS_PER_EXPORT) return;
      URL.revokeObjectURL(url);
      urls.delete(key);
    }
  }

  private revoke(parsed: iParsedExport) {
    for (const url of parsed.urlsByRemovedSelectors.values()) URL.revokeObjectURL(url);
    parsed.urlsByRemovedSelectors.clear();
  }
}
