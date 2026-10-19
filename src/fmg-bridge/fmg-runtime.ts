import { z } from 'zod';

import { MAP_ENTITY_KINDS } from '../entities/map-entity.constants';
import type { iMapEntityRef } from '../entities/map-entity.types';
import type { iMapBox } from '../map-data/map-geometry.types';
import { MAP_EXPORT_KINDS } from '../map/map-export.constants';
import type { MapExportKind } from '../map/map-export.constants';
import { captureDownload } from './fmg-download-capture';
import { isRequestedFmgMap, readFmgMapHeader } from './fmg-map-header';
import type { iShownFmgMap } from './fmg-map-header';

/** A map-space box drawn into an image of the given pixel size, as FMG's `ExportMap.getRegionImage` takes it. */
interface iFmgRegion {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  height: number;
}

/**
 * The FMG services the bridge calls, from `src/services/index.ts`. FMG publishes the registry on `window.Services`;
 * every method returns a promise because the registry loads each module on first use.
 */
interface iFmgServices {
  Load: { uploadMap: (file: Blob) => Promise<void> };
  Save: { prepareMapData: () => Promise<string> };
  ExportMap: {
    getMapURL: (type: 'svg', config: { fullMap: boolean }) => Promise<string>;
    getRegionImage: (region: iFmgRegion, scale: number) => Promise<string>;
    saveGeoJsonMarkers: () => Promise<void>;
  };
  ExportJson: { exportToJson: (type: 'Full') => Promise<void> };
}

/** The cell arrays of FMG's packed graph that say which area entity holds each cell. */
interface iFmgPack {
  cells: Record<'state' | 'province' | 'culture' | 'religion', ArrayLike<number>>;
  zones?: { i: number; cells: number[]; hidden?: boolean }[];
}

interface iFmgGlobals {
  Services?: iFmgServices;
  pack?: iFmgPack;
  Pack?: { findCell: (x: number, y: number) => number | undefined };
  zoomTo?: (x: number, y: number, scale: number, durationMs: number) => void;
  /** Non-zero while an FMG editing tool is active; FMG refuses to save or export then. */
  customization?: number;
  options?: { map: { graph: { width: number; height: number } }; app: { export: { pngResolution: number } } };
  clearMainTip?: () => void;
}

/** FMG fires it on `window` whenever a map is on screen: generated at start-up, generated anew, or loaded. */
const FMG_MAP_READY_EVENT = 'map:generated';
const shownMapSchema = z.object({ seed: z.string(), mapId: z.number() });

/** FMG's message dialog, which it opens instead of loading an invalid, newer or ancient file, or on a load error. */
const FMG_ALERT_ID = 'alert';
const FMG_ALERT_MESSAGE_ID = 'alertMessage';
const ALERT_POLL_MS = 250;

/** FMG's map element and the group its pan and zoom transform applies to. */
const FMG_MAP_SVG_ID = 'map';
const FMG_VIEWBOX_ID = 'viewbox';
/** Like FMG's own "reveal": the box fills this share of the view, between these zoom scales. */
const SHOW_REGION_FILL = 0.65;
const SHOW_REGION_SCALES = { min: 1, max: 20 } as const;
const SHOW_REGION_DURATION_MS = 1500;

/** The area kinds read from the cell arrays, the most specific first; zones come before them. */
const CELL_OWNER_KINDS = [
  { kind: MAP_ENTITY_KINDS.PROVINCE, cells: 'province' },
  { kind: MAP_ENTITY_KINDS.STATE, cells: 'state' },
  { kind: MAP_ENTITY_KINDS.CULTURE, cells: 'culture' },
  { kind: MAP_ENTITY_KINDS.RELIGION, cells: 'religion' },
] as const;

/** What each export must be: FMG answers some failures with an empty or differently typed blob. */
function readExpectedMimeType(kind: MapExportKind): string {
  switch (kind) {
    case MAP_EXPORT_KINDS.SVG:
      return 'image/svg+xml';
    case MAP_EXPORT_KINDS.PNG:
      return 'image/png';
    default:
      return 'application/json';
  }
}

// FMG keeps its state in page globals for its legacy scripts; this module only runs inside FMG's own page.
const fmgWindow = window as Window & iFmgGlobals;

function readServices(): iFmgServices {
  if (!fmgWindow.Services) throw new Error('FMG has not started yet.');
  return fmgWindow.Services;
}

function assertNotEditing() {
  if (fmgWindow.customization) throw new Error('Finish the edit in FMG (close the editing tool) and save again.');
}

/** Runs `listener` with the map FMG put on screen, each time it does. */
export function onFmgMapShown(listener: (shown: iShownFmgMap | null) => unknown) {
  const onEvent = (event: Event) => {
    const parsed = shownMapSchema.safeParse(event instanceof CustomEvent ? event.detail : null);
    listener(parsed.success ? parsed.data : null);
  };
  window.addEventListener(FMG_MAP_READY_EVENT, onEvent);
  return () => window.removeEventListener(FMG_MAP_READY_EVENT, onEvent);
}

/** FMG's alert text while its alert dialog is open, else null. */
function readOpenAlert(): string | null {
  const dialog = document.getElementById(FMG_ALERT_ID)?.closest('.ui-dialog');
  if (!(dialog instanceof HTMLElement) || dialog.style.display === 'none') return null;
  return document.getElementById(FMG_ALERT_MESSAGE_ID)?.textContent?.trim() ?? '';
}

/** The next map FMG shows, or a rejection as soon as FMG opens a new alert instead. */
async function waitForShownMap(): Promise<iShownFmgMap | null> {
  const alertBefore = readOpenAlert();
  return new Promise((resolve, reject) => {
    const stoppers: (() => unknown)[] = [];
    const stop = () => {
      for (const stopper of stoppers) stopper();
    };

    stoppers.push(
      onFmgMapShown((shown) => {
        stop();
        resolve(shown);
      }),
    );
    const poll = setInterval(() => {
      const alert = readOpenAlert();
      if (alert === null || alert === alertBefore) return;
      stop();
      reject(new Error(`FMG did not open the map: ${alert || 'it showed an error.'}`));
    }, ALERT_POLL_MS);
    stoppers.push(() => clearInterval(poll));
  });
}

/** Opens the map through FMG's own loader and checks that the map FMG then shows is the one in the file. */
export async function loadFmgMap(mapData: ArrayBuffer) {
  const header = await readFmgMapHeader(mapData);
  if (!header) throw new Error('The file is not an FMG map.');

  const shown = waitForShownMap();
  await readServices().Load.uploadMap(new Blob([mapData]));
  const shownMap = await shown;
  if (!shownMap || !isRequestedFmgMap(header, shownMap)) {
    throw new Error(
      `FMG shows a different map (seed ${shownMap?.seed ?? 'unknown'}) than the file's (${header.seed}).`,
    );
  }
}

/** The open map as FMG's own `.map` serialisation, the same text as FMG's "Save to machine". */
export async function serializeFmgMap(): Promise<string> {
  assertNotEditing();
  return readServices().Save.prepareMapData();
}

async function readUrl(url: string): Promise<Blob> {
  const response = await fetch(url);
  return response.blob();
}

async function readObjectUrl(url: string): Promise<Blob> {
  try {
    return await readUrl(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function readFullMapRegion(): { region: iFmgRegion; scale: number } {
  const { options } = fmgWindow;
  if (!options) throw new Error('FMG has not started yet.');

  const { width, height } = options.map.graph;
  return {
    region: { x0: 0, y0: 0, x1: width, y1: height, width, height },
    scale: options.app.export.pngResolution || 1,
  };
}

async function renderFullMapPng(): Promise<Blob> {
  const { region, scale } = readFullMapRegion();
  return readUrl(await readServices().ExportMap.getRegionImage(region, scale));
}

async function runFmgExport(kind: MapExportKind): Promise<Blob> {
  const services = readServices();
  switch (kind) {
    case MAP_EXPORT_KINDS.SVG:
      return readObjectUrl(await services.ExportMap.getMapURL('svg', { fullMap: true }));
    case MAP_EXPORT_KINDS.PNG:
      return renderFullMapPng();
    case MAP_EXPORT_KINDS.JSON:
      return captureDownload(async () => services.ExportJson.exportToJson('Full'));
    case MAP_EXPORT_KINDS.MARKERS_GEOJSON:
      return captureDownload(async () => services.ExportMap.saveGeoJsonMarkers());
    default:
      throw new Error(`Unknown export: ${String(kind)}`);
  }
}

/** Each export through FMG's own export function, in the format FMG's export menu writes. */
export async function exportFmgMap(kind: MapExportKind): Promise<ArrayBuffer> {
  assertNotEditing();
  const blob = await runFmgExport(kind);
  fmgWindow.clearMainTip?.();

  const mimeType = readExpectedMimeType(kind);
  if (blob.size === 0 || !blob.type.startsWith(mimeType)) {
    throw new Error(`FMG's ${kind} export came back empty or as ${blob.type || 'an unknown type'}.`);
  }
  return blob.arrayBuffer();
}

/** Zooms FMG's view so the box fills most of it. */
export function showFmgRegion(box: iMapBox) {
  const svg = document.getElementById(FMG_MAP_SVG_ID);
  if (!svg || !fmgWindow.zoomTo) throw new Error('FMG has not started yet.');

  const fit = Math.min(
    (svg.clientWidth * SHOW_REGION_FILL) / Math.max(1, box.x1 - box.x0),
    (svg.clientHeight * SHOW_REGION_FILL) / Math.max(1, box.y1 - box.y0),
  );
  const scale = Math.min(SHOW_REGION_SCALES.max, Math.max(SHOW_REGION_SCALES.min, fit));
  fmgWindow.zoomTo((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, scale, SHOW_REGION_DURATION_MS);
}

/** Whether an FMG editing tool is active; clicks then belong to that tool. */
export function isFmgEditing(): boolean {
  return Boolean(fmgWindow.customization);
}

/** The map cell under a point of the page, or null outside the map. */
export function readFmgCellAt(clientX: number, clientY: number): number | null {
  const viewbox = document.getElementById(FMG_VIEWBOX_ID);
  const matrix = viewbox instanceof SVGGraphicsElement ? viewbox.getScreenCTM() : null;
  if (!matrix || !fmgWindow.Pack) return null;

  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  return fmgWindow.Pack.findCell(point.x, point.y) ?? null;
}

/** The area entities holding a cell: visible zones first, then province, state, culture and religion. */
export function readFmgCellOwners(cellId: number): iMapEntityRef[] {
  const { pack } = fmgWindow;
  if (!pack) return [];

  const zones = (pack.zones ?? [])
    .filter((zone) => !zone.hidden && zone.cells.includes(cellId))
    .map((zone) => ({ kind: MAP_ENTITY_KINDS.ZONE, id: zone.i }));
  const areas = CELL_OWNER_KINDS.flatMap(({ kind, cells }) => {
    const id = pack.cells[cells][cellId] ?? 0;
    return id > 0 ? [{ kind, id }] : [];
  });
  return [...zones, ...areas];
}
