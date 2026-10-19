import type { TFile } from 'obsidian';

import type { iMapEntitySummary } from '../entities/map-entity.types';
import type { MapEntityCatalog } from '../map-data/map-entity-catalog';
import type { iLinkedNote } from './note-link-index';

export interface iLinkReport {
  /** The map's entities no note stands for. */
  unlinkedEntities: iMapEntitySummary[];
  /** Notes whose link leads nowhere: to an entity this map no longer has, or to a map that is not in the vault. */
  brokenNotes: TFile[];
}

export interface iLinkReportInput {
  mapPath: string;
  catalog: MapEntityCatalog;
  /** Every linked note in the vault, for any map. */
  linkedNotes: iLinkedNote[];
  /** Whether a `.map` file exists at the path, for links to maps other than this one. */
  hasMap: (mapPath: string) => boolean;
}

/** Which of the map's entities have no note, and which linked notes stand for nothing. */
export function buildLinkReport(input: iLinkReportInput): iLinkReport {
  const { mapPath, catalog, linkedNotes } = input;
  const linkedKeys = new Set(
    linkedNotes.filter(({ link }) => link.map === mapPath).map(({ link }) => `${link.kind}:${link.id}`),
  );
  const brokenNotes = linkedNotes
    .filter(({ link }) => (link.map === mapPath ? !catalog.has(link) : !input.hasMap(link.map)))
    .map(({ file }) => file);

  return {
    unlinkedEntities: catalog.listAll().filter((entity) => !linkedKeys.has(`${entity.kind}:${entity.id}`)),
    brokenNotes,
  };
}
