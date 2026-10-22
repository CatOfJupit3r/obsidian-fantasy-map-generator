import { createWindowChannel } from '../bridge/bridge-channel';
import { BridgeHost } from '../bridge/bridge-host';
import type { BridgeRequestHandler, iBridgeReply } from '../bridge/bridge-host';
import {
  BRIDGE_EVENT_KINDS,
  BRIDGE_PARENT_ORIGIN_PARAM,
  BRIDGE_REQUEST_KINDS,
  exportMapRequestSchema,
  loadMapRequestSchema,
  showRegionRequestSchema,
} from '../bridge/bridge-protocol';
import { forwardEntityClicks } from './fmg-entity-click';
import { hideFadedLoadingOverlay } from './fmg-loading-overlay';
import { exportFmgMap, loadFmgMap, onFmgMapShown, serializeFmgMap, showFmgRegion } from './fmg-runtime';
import { turnOffFmgAutosave } from './fmg-stored-options';

/**
 * FMG's desktop build sets this from its Electron preload. In desktop mode FMG sets no "leave this page?" prompt,
 * registers no service worker and hides its Dropbox and desktop-app offers. `saveMap` comes from the plugin's FMG patch
 * (`scripts/fmg-patches/save-to-host.patch`): FMG's "Save to machine" calls it instead of opening a save-file picker,
 * which a cross-origin frame may not open.
 */
function createDesktopBridge(host: BridgeHost) {
  return {
    isElectron: true,
    platform: 'obsidian',
    versions: { electron: '', chrome: '', node: '' },
    saveMap: () => host.notify(BRIDGE_EVENT_KINDS.SAVE_REQUESTED),
  };
}

async function exportFiles(payload: unknown): Promise<iBridgeReply> {
  const files = [];
  for (const kind of exportMapRequestSchema.parse(payload).kinds) {
    files.push({ kind, data: await exportFmgMap(kind) });
  }
  return { payload: { files }, transfer: files.map((file) => file.data) };
}

const handleRequest: BridgeRequestHandler = async (kind, payload) => {
  switch (kind) {
    case BRIDGE_REQUEST_KINDS.LOAD_MAP: {
      await loadFmgMap(loadMapRequestSchema.parse(payload).mapData);
      return { payload: {} };
    }
    case BRIDGE_REQUEST_KINDS.SAVE_MAP:
      return { payload: { mapText: await serializeFmgMap() } };
    case BRIDGE_REQUEST_KINDS.EXPORT_MAP:
      return exportFiles(payload);
    case BRIDGE_REQUEST_KINDS.SHOW_REGION:
      showFmgRegion(showRegionRequestSchema.parse(payload).box);
      return { payload: {} };
    default:
      throw new Error(`Unknown request: ${String(kind)}`);
  }
};

function readParentOrigin(frameWindow: Window): string | null {
  return new URLSearchParams(frameWindow.location.hash.slice(1)).get(BRIDGE_PARENT_ORIGIN_PARAM);
}

/** Ctrl/Cmd+S saves to the vault instead of starting FMG's own "save to machine". */
function forwardSaveShortcut(frameWindow: Window, host: BridgeHost) {
  frameWindow.addEventListener(
    'keydown',
    (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.code !== 'KeyS') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      host.notify(BRIDGE_EVENT_KINDS.SAVE_REQUESTED);
    },
    { capture: true },
  );
}

/**
 * Runs in FMG's page before FMG's own scripts, and only when the page sits in the plugin's frame: the frame URL's hash
 * names the plugin's origin. It answers the plugin's requests with FMG's own load, save and export functions, and
 * announces READY once FMG has its first map on screen.
 */
export function startBridge(frameWindow: Window): BridgeHost | null {
  const parentOrigin = readParentOrigin(frameWindow);
  if (!parentOrigin || frameWindow.parent === frameWindow) return null;

  const host = new BridgeHost(createWindowChannel(frameWindow, frameWindow.parent, parentOrigin), handleRequest);
  Object.assign(frameWindow, { electron: createDesktopBridge(host) });
  turnOffFmgAutosave(frameWindow.localStorage);
  frameWindow.addEventListener('DOMContentLoaded', () => hideFadedLoadingOverlay(frameWindow.document), { once: true });
  forwardSaveShortcut(frameWindow, host);
  forwardEntityClicks(frameWindow, host);
  const stopWaiting = onFmgMapShown(() => {
    stopWaiting();
    host.notify(BRIDGE_EVENT_KINDS.READY);
  });
  return host;
}
