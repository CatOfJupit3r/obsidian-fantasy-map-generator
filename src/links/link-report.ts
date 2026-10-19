import type { TFile } from 'obsidian';

import type { iMapEntitySummary } from '../entities/map-entity.types';
import type { MapEntityCatalog } from '../map-data/map-entity-catalog';
import type { iLinkedNote } from './note-link-index';

export interface iLinkReport {
  /** The map's entities no note stands for. */
  unlinkedEntities: iMapEntitySummary[];
  /** Notes in the entity folders that stand for nothing on any map: no link, or a link to a gone entity or map. */
  unmatchedNotes: TFile[];
}

export interface iLinkReportInput {
  mapPath: string;
  catalog: MapEntityCatalog;
  /** Every linked note in the vault, for any map. */
  linkedNotes: iLinkedNote[];
  /** The notes in the entity folders. */
  folderNotes: TFile[];
  /** Whether a `.map` file exists at the path, for links to maps other than this one. */
  hasMap: (mapPath: string) => boolean;
}

/** Which of the map's entities have no note, and which notes in the entity folders have no entity. */
export function buildLinkReport(input: iLinkReportInput): iLinkReport {
  const { mapPath, catalog } = input;
  const linkedToThisMap = input.linkedNotes.filter(({ link }) => link.map === mapPath);
  const linkedKeys = new Set(linkedToThisMap.map(({ link }) => `${link.kind}:${link.id}`));
  const linkByFile = new Map(input.linkedNotes.map((linkedNote) => [linkedNote.file, linkedNote.link]));

  const unmatchedNotes = input.folderNotes.filter((file) => {
    const link = linkByFile.get(file);
    if (!link) return true;
    return link.map === mapPath ? !catalog.has(link) : !input.hasMap(link.map);
  });

  return {
    unlinkedEntities: catalog.listAll().filter((entity) => !linkedKeys.has(`${entity.kind}:${entity.id}`)),
    unmatchedNotes,
  };
}
