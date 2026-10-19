import { createWindowChannel } from '../bridge/bridge-channel';
import { BridgeClient } from '../bridge/bridge-client';
import {
  BRIDGE_PARENT_ORIGIN_PARAM,
  BRIDGE_REQUEST_KINDS,
  emptyPayloadSchema,
  exportedMapFilesSchema,
  savedMapSchema,
} from '../bridge/bridge-protocol';
import type { iMapEntityRef } from '../entities/map-entity.types';
import type { iMapBox } from '../map-data/map-geometry.types';
import type { MapExportKind } from '../map/map-export.constants';
import type { iExportedMapFile, iMapEditor, iSerializedMap } from '../map/map.types';

/** FMG generates a map on start-up before it can open one, and big maps take a while to load and render. */
const FMG_TIMEOUTS_MS = {
  ready: 120_000,
  load: 120_000,
  save: 60_000,
  export: 180_000,
  showRegion: 10_000,
} satisfies Record<string, number>;

/**
 * Lines of FMG's `.map` text that change when only the view does: the header (it carries the save date) and the SVG
 * (FMG renders only what is in view). Leaving them out tells real edits from zooming and panning.
 */
const FMG_VIEW_LINE_INDEXES = new Set([0, 5]);
const FMG_LINE_SEPARATOR = '\r\n';

function readMapContent(mapText: string): string {
  return mapText
    .split(FMG_LINE_SEPARATOR)
    .filter((_line, index) => !FMG_VIEW_LINE_INDEXES.has(index))
    .join(FMG_LINE_SEPARATOR);
}

/** The plugin's only way into FMG: every request goes over the bridge to the script injected into FMG's page. */
export class FmgAdapter implements iMapEditor {
  public constructor(private readonly client: BridgeClient) {}

  public async waitUntilReady() {
    return this.client.waitUntilReady(FMG_TIMEOUTS_MS.ready);
  }

  public async loadMap(mapData: ArrayBuffer) {
    await this.client.request(BRIDGE_REQUEST_KINDS.LOAD_MAP, { mapData }, emptyPayloadSchema, FMG_TIMEOUTS_MS.load);
  }

  public async serializeMap(): Promise<iSerializedMap> {
    const saved = await this.client.request(BRIDGE_REQUEST_KINDS.SAVE_MAP, {}, savedMapSchema, FMG_TIMEOUTS_MS.save);
    return { text: saved.mapText, content: readMapContent(saved.mapText) };
  }

  /** Ctrl/Cmd+S pressed inside FMG. */
  public onSaveRequested(listener: () => unknown): () => unknown {
    return this.client.onSaveRequested(listener);
  }

  public async exportMap(kinds: MapExportKind[]): Promise<iExportedMapFile[]> {
    const exported = await this.client.request(
      BRIDGE_REQUEST_KINDS.EXPORT_MAP,
      { kinds },
      exportedMapFilesSchema,
      FMG_TIMEOUTS_MS.export,
    );
    return exported.files;
  }

  /** Zooms FMG's view to the box. */
  public async showRegion(box: iMapBox) {
    await this.client.request(BRIDGE_REQUEST_KINDS.SHOW_REGION, { box }, emptyPayloadSchema, FMG_TIMEOUTS_MS.showRegion);
  }

  /** Ctrl/Cmd+click on the map, with the entities under the cursor, the most specific first. */
  public onEntityClicked(listener: (candidates: iMapEntityRef[]) => unknown): () => unknown {
    return this.client.onEntityClicked(listener);
  }

  public dispose() {
    this.client.dispose();
  }
}

export interface iMountedFmg {
  frame: HTMLIFrameElement;
  adapter: FmgAdapter;
}

/** Puts FMG in a frame inside `container` and connects the adapter to it before the page starts. */
export function mountFmg(container: HTMLElement, fmgPageUrl: string): iMountedFmg {
  const hostWindow = container.ownerDocument.defaultView;
  if (!hostWindow) throw new Error('The map view is not attached to a window.');

  const frame = container.ownerDocument.createElement('iframe');
  frame.className = 'azgaar-fmg-frame';
  container.append(frame);

  const { contentWindow } = frame;
  if (!contentWindow) throw new Error('The map editor frame has no window.');

  const channel = createWindowChannel(hostWindow, contentWindow, new URL(fmgPageUrl).origin);
  const adapter = new FmgAdapter(new BridgeClient(channel));
  frame.src = `${fmgPageUrl}#${BRIDGE_PARENT_ORIGIN_PARAM}=${encodeURIComponent(hostWindow.location.origin)}`;

  return { frame, adapter };
}
