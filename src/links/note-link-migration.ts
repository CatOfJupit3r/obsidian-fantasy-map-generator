import { TFile } from 'obsidian';
import type { FileManager, MetadataCache, Vault } from 'obsidian';
import { z } from 'zod';

import { MAP_ENTITY_KIND_VALUES, mapEntityKindSchema } from '../entities/map-entity.constants';
import { FMG_FACTS_BLOCK_LANGUAGE } from '../facts/fmg-facts-block.schema';
import { buildMapGeneratedFilePrefix, MAP_FILE_EXTENSION } from '../map/map-file-paths';
import { FMG_MINIMAP_BLOCK_LANGUAGE } from '../minimap/fmg-minimap-block.schema';
import type { NoteLinkWriter } from './note-link-writer';

/** The link as plugin versions before the flat properties wrote it: `fmg: { map: Maps/Aster.map, kind: STATE, id: 7 }`. */
const LEGACY_LINK_KEY = 'fmg';
const legacyLinkSchema = z.object({
  map: z.string().trim().min(1),
  kind: mapEntityKindSchema,
  id: z.number().int().nonnegative(),
});
type LegacyLink = z.infer<typeof legacyLinkSchema>;
const legacyFrontmatterSchema = z.object({ [LEGACY_LINK_KEY]: legacyLinkSchema });

/** The fences of the facts callout those versions wrote into each linked note on save. */
const LEGACY_FACTS_BLOCK_START = '<!-- fmg-map-facts:start';
const LEGACY_FACTS_BLOCK_END = '<!-- fmg-map-facts:end -->';
const CODE_FENCE = '```';

/** Those versions' entity thumbnails next to the map: `Maps/Aster.fmg.state-7.png`. */
const LEGACY_THUMBNAIL_EXTENSION = 'png';
const LEGACY_THUMBNAIL_NAME = new RegExp(
  `^(?:${MAP_ENTITY_KIND_VALUES.map((kind) => kind.toLowerCase()).join('|')})-\\d+\\.${LEGACY_THUMBNAIL_EXTENSION}$`,
  'u',
);

export type NoteLinkMigrationVault = Pick<Vault, 'getMarkdownFiles' | 'getFiles' | 'getAbstractFileByPath' | 'process'>;
export type NoteLinkMigrationMetadata = Pick<MetadataCache, 'getFileCache'>;
export type NoteLinkMigrationFileManager = Pick<FileManager, 'processFrontMatter' | 'trashFile'>;

export interface iNoteLinkMigrationReport {
  noteCount: number;
  thumbnailCount: number;
  /** Notes or thumbnails that could not be migrated, each with the reason. */
  failures: string[];
}

/**
 * Moves a vault from the old note layout to the current one: the nested `fmg` link becomes the flat `fmg-*`
 * properties, the written facts callout becomes `fmg-map` and `fmg-facts` blocks in the same place, and the baked thumbnails go to
 * the trash. Notes already in the current layout are left alone, so it runs on every start.
 */
export class NoteLinkMigration {
  public constructor(
    private readonly vault: NoteLinkMigrationVault,
    private readonly metadataCache: NoteLinkMigrationMetadata,
    private readonly fileManager: NoteLinkMigrationFileManager,
    private readonly noteLinkWriter: NoteLinkWriter,
  ) {}

  public async migrate(): Promise<iNoteLinkMigrationReport> {
    const failures: string[] = [];
    let noteCount = 0;
    for (const note of this.vault.getMarkdownFiles()) {
      const legacy = legacyFrontmatterSchema.safeParse(this.metadataCache.getFileCache(note)?.frontmatter);
      if (!legacy.success) continue;
      try {
        await this.migrateNote(note, legacy.data[LEGACY_LINK_KEY]);
        noteCount += 1;
      } catch (error) {
        failures.push(`${note.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    let thumbnailCount = 0;
    for (const thumbnail of this.listLegacyThumbnails()) {
      try {
        await this.fileManager.trashFile(thumbnail);
        thumbnailCount += 1;
      } catch (error) {
        failures.push(`${thumbnail.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { noteCount, thumbnailCount, failures };
  }

  private async migrateNote(note: TFile, legacyLink: LegacyLink) {
    const mapFile = this.vault.getAbstractFileByPath(legacyLink.map);
    const properties = this.noteLinkWriter.buildProperties(
      note,
      mapFile instanceof TFile ? mapFile : legacyLink.map,
      legacyLink,
    );
    await this.fileManager.processFrontMatter(note, (frontmatter: Record<string, unknown>) => {
      delete frontmatter[LEGACY_LINK_KEY];
      Object.assign(frontmatter, properties);
    });
    await this.vault.process(note, (text) => this.replaceFactsCallout(text));
  }

  /**
   * The note with its written callout replaced by the live blocks, or as it is when it has no whole callout: a mini-map
   * for the callout's thumbnail, unless the note already shows one, then the facts.
   */
  private replaceFactsCallout(text: string): string {
    const start = text.indexOf(LEGACY_FACTS_BLOCK_START);
    if (start === -1) return text;
    const end = text.indexOf(LEGACY_FACTS_BLOCK_END, start);
    if (end === -1) return text;

    const hasMinimap = text.includes(`${CODE_FENCE}${FMG_MINIMAP_BLOCK_LANGUAGE}`);
    const liveBlocks = (hasMinimap ? [FMG_FACTS_BLOCK_LANGUAGE] : [FMG_MINIMAP_BLOCK_LANGUAGE, FMG_FACTS_BLOCK_LANGUAGE])
      .map((language) => `${CODE_FENCE}${language}\n${CODE_FENCE}`)
      .join('\n\n');
    return `${text.slice(0, start)}${liveBlocks}${text.slice(end + LEGACY_FACTS_BLOCK_END.length)}`;
  }

  private listLegacyThumbnails(): TFile[] {
    const files = this.vault.getFiles();
    const prefixes = files
      .filter((file) => file.extension === MAP_FILE_EXTENSION)
      .map((mapFile) => buildMapGeneratedFilePrefix(mapFile.path));
    return files.filter(
      (file) =>
        file.extension === LEGACY_THUMBNAIL_EXTENSION &&
        prefixes.some((prefix) => file.path.startsWith(prefix) && LEGACY_THUMBNAIL_NAME.test(file.path.slice(prefix.length))),
    );
  }
}
