import { Keymap, MarkdownRenderChild, parseYaml } from 'obsidian';
import type { App } from 'obsidian';

import type { iMapEntitySummary } from '../entities/map-entity.types';
import type { NoteLinkIndex } from '../links/note-link-index';
import type { MapExportKind } from '../map/map-export.constants';
import { buildMapExportPath } from '../map/map-file-paths';
import type { MapBlockTarget } from './map-block-options.schema';
import type { iMapBlockTarget, MapBlockTargetResolver } from './map-block-target-resolver';

export interface iMapBlockHost {
  app: App;
  resolver: MapBlockTargetResolver;
  noteLinkIndex: NoteLinkIndex;
}

/**
 * A code block drawn live from a map's exports: it never writes to the note, and redraws whenever the exports it reads
 * change or its note's frontmatter does.
 */
export abstract class MapBlockRenderChild<TOptions extends MapBlockTarget> extends MarkdownRenderChild {
  /** The exports the block reads; a save that rewrites any of them redraws it. */
  protected abstract readonly watchedExportKinds: MapExportKind[];

  private watchedPaths = new Set<string>();

  public constructor(
    containerEl: HTMLElement,
    private readonly source: string,
    protected readonly sourcePath: string,
    protected readonly host: iMapBlockHost,
  ) {
    super(containerEl);
  }

  public onload() {
    const { vault, metadataCache } = this.host.app;
    this.registerEvent(
      vault.on('modify', (file) => {
        if (this.watchedPaths.has(file.path)) this.redraw();
      }),
    );
    this.registerEvent(
      metadataCache.on('changed', (file) => {
        if (file.path === this.sourcePath) this.redraw();
      }),
    );
    this.redraw();
  }

  /** The block's options from its YAML, or a message naming what is wrong with them. */
  protected abstract parseOptions(yaml: unknown): TOptions | string;

  /** Draws the block into the emptied container. */
  protected abstract render(target: iMapBlockTarget, options: TOptions): void;

  /** Opens the note that stands for the entity, in a new tab with Ctrl/Cmd held. */
  protected openEntityNote(mapPath: string, entity: iMapEntitySummary, event: MouseEvent) {
    const note = this.host.noteLinkIndex.findNote(mapPath, entity);
    if (!note) return;
    void this.host.app.workspace
      .openLinkText(note.path, this.sourcePath, Keymap.isModEvent(event))
      .catch((error: unknown) => {
        this.showMessage(`Could not open ${note.path}: ${error instanceof Error ? error.message : String(error)}`);
      });
  }

  private redraw() {
    void this.draw().catch((error: unknown) => {
      this.showMessage(error instanceof Error ? error.message : String(error));
    });
  }

  private async draw() {
    const options = this.parseOptions(this.readYaml());
    if (typeof options === 'string') {
      this.showMessage(options);
      return;
    }

    const target = await this.host.resolver.resolve(options, this.sourcePath);
    this.watchedPaths = new Set(this.watchedExportKinds.map((kind) => buildMapExportPath(target.mapFile.path, kind)));
    this.containerEl.empty();
    this.render(target, options);
  }

  /** The block's YAML, or a string that fails the option schema when the YAML does not parse. */
  private readYaml(): unknown {
    if (this.source.trim() === '') return {};
    try {
      const yaml: unknown = parseYaml(this.source);
      return yaml;
    } catch {
      return 'unreadable YAML';
    }
  }

  protected showMessage(message: string) {
    this.containerEl.empty();
    this.containerEl.createDiv({ cls: 'fmg-block-message', text: message });
  }
}
