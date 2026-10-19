import type { BridgeHost } from '../bridge/bridge-host';
import { BRIDGE_EVENT_KINDS } from '../bridge/bridge-protocol';
import { MAP_ENTITY_KINDS } from '../entities/map-entity.constants';
import type { iMapEntityRef } from '../entities/map-entity.types';
import { isFmgEditing, readFmgCellAt, readFmgCellOwners } from './fmg-runtime';

/** The part of a DOM element the click resolution walks. */
export interface iClickedElement {
  id: string;
  getAttribute: (name: string) => string | null;
  parentElement: iClickedElement | null;
}

/** FMG's map element; clicks elsewhere in the page land on FMG's dialogs and menus. */
const FMG_MAP_SVG_ID = 'map';
const FMG_BURG_ICONS_ID = 'burgIcons';
const BURG_LABEL_TYPE = 'burg';

/** FMG's element ids for burgs and markers (`ELEMENT_PATTERNS` in FMG's `components/map-entities.ts`). */
const POINT_ELEMENT_PATTERNS = [
  { pattern: /^burg(?:Label)?(\d+)$/u, kind: MAP_ENTITY_KINDS.BURG },
  { pattern: /^marker(\d+)$/u, kind: MAP_ENTITY_KINDS.MARKER },
] as const;

function readAncestors(target: iClickedElement | null): iClickedElement[] {
  const ancestors: iClickedElement[] = [];
  for (let element = target; element; element = element.parentElement) ancestors.push(element);
  return ancestors;
}

function readElementRef(element: iClickedElement, isInBurgIcons: boolean): iMapEntityRef | null {
  const dataId = Number(element.getAttribute('data-id') ?? Number.NaN);
  const isBurgLabel = element.getAttribute('data-label-type') === BURG_LABEL_TYPE;
  if (Number.isInteger(dataId) && (isBurgLabel || isInBurgIcons)) return { kind: MAP_ENTITY_KINDS.BURG, id: dataId };

  for (const { pattern, kind } of POINT_ELEMENT_PATTERNS) {
    const match = pattern.exec(element.id);
    if (match) return { kind, id: Number(match[1]) };
  }
  return null;
}

/** The burg or marker the clicked element draws, or null when it draws neither. */
export function readPointEntityRef(target: iClickedElement | null): iMapEntityRef | null {
  const ancestors = readAncestors(target);
  const isInBurgIcons = ancestors.some((element) => element.id === FMG_BURG_ICONS_ID);
  for (const element of ancestors) {
    const ref = readElementRef(element, isInBurgIcons);
    if (ref) return ref;
  }
  return null;
}

export function isOnFmgMap(target: iClickedElement | null): boolean {
  return readAncestors(target).some((element) => element.id === FMG_MAP_SVG_ID);
}

/**
 * Ctrl/Cmd+click on the map tells the plugin which entities are under the cursor, so it opens the note of the most
 * specific linked one. A plain click stays FMG's: it opens FMG's own editors.
 */
export function forwardEntityClicks(frameWindow: Window, host: BridgeHost) {
  frameWindow.addEventListener(
    'click',
    (event) => {
      if (!(event.ctrlKey || event.metaKey) || isFmgEditing()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!isOnFmgMap(target)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      const point = readPointEntityRef(target);
      const cellId = readFmgCellAt(event.clientX, event.clientY);
      const areas = cellId === null ? [] : readFmgCellOwners(cellId);
      host.notify(BRIDGE_EVENT_KINDS.ENTITY_CLICKED, { candidates: point ? [point, ...areas] : areas });
    },
    { capture: true },
  );
}
