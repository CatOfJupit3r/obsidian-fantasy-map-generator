import { describe, expect, it } from 'vitest';

import { MAP_EXPORT_KINDS } from '../../src/map/map-export.constants';
import type { MapExportKind } from '../../src/map/map-export.constants';
import { MapSession } from '../../src/map/map-session';
import { MAP_SAVE_OUTCOME_KIND_CASES } from '../../src/map/map.types';
import type { MapSaveOutcome } from '../../src/map/map.types';
import { FakeMapEditor } from '../utils/fake-map-editor';
import { FakeVault } from '../utils/fake-vault';

const MAP_PATH = 'Worlds/Aster/Aster.map';
const ALL_DEFAULT_EXPORTS: MapExportKind[] = [
  MAP_EXPORT_KINDS.PNG,
  MAP_EXPORT_KINDS.JSON,
  MAP_EXPORT_KINDS.MARKERS_GEOJSON,
];

/** The map in its world's folder, as a vault holds it. */
function seedMap(vault: FakeVault, mapText: string) {
  vault.seedFolder('Worlds/Aster');
  return vault.seedFile(MAP_PATH, mapText);
}

function decode(data: ArrayBuffer | undefined): string | undefined {
  return data ? new TextDecoder().decode(data) : undefined;
}

function readReport(outcome: MapSaveOutcome) {
  if (outcome.kind !== MAP_SAVE_OUTCOME_KIND_CASES.SAVED) throw new Error('expected the map to be saved');
  return outcome.report;
}

describe('MapSession.save', () => {
  it('writes the map to the same file and the enabled exports next to it', async () => {
    const vault = new FakeVault();
    const file = seedMap(vault, 'map v1');
    vault.seedFile('Worlds/Aster/Aster.fmg.png', new ArrayBuffer(4));
    const editor = new FakeMapEditor('map v2');

    const report = readReport(await new MapSession(vault, editor, () => ALL_DEFAULT_EXPORTS).save(file));

    expect(vault.readText(MAP_PATH)).toBe('map v2');
    expect(report.exportPaths).toEqual([
      'Worlds/Aster/Aster.fmg.png',
      'Worlds/Aster/Aster.fmg.json',
      'Worlds/Aster/Aster.fmg.markers.geojson',
    ]);
    expect(report.exportError).toBeNull();
    expect(decode(vault.readBytes('Worlds/Aster/Aster.fmg.png'))).toBe('PNG of map v2');
    expect(decode(vault.readBytes('Worlds/Aster/Aster.fmg.json'))).toBe('JSON of map v2');
    expect(decode(vault.readBytes('Worlds/Aster/Aster.fmg.markers.geojson'))).toBe('MARKERS_GEOJSON of map v2');
  });

  it('neither asks for nor writes an export that is turned off', async () => {
    const vault = new FakeVault();
    const file = seedMap(vault, 'map v1');
    const editor = new FakeMapEditor('map v2');

    await new MapSession(vault, editor, () => [MAP_EXPORT_KINDS.JSON]).save(file);

    expect(editor.exportRequests).toEqual([[MAP_EXPORT_KINDS.JSON]]);
    expect(vault.listPaths()).toEqual(['Worlds/Aster', 'Worlds/Aster/Aster.fmg.json', MAP_PATH]);
  });

  it('writes the map before the exports, and reports an export that failed', async () => {
    const vault = new FakeVault();
    const file = seedMap(vault, 'map v1');
    const editor = new FakeMapEditor('map v2');
    editor.exportFailure = new Error('the PNG came back empty');

    const report = readReport(await new MapSession(vault, editor, () => ALL_DEFAULT_EXPORTS).save(file));

    expect(vault.readText(MAP_PATH)).toBe('map v2');
    expect(report.exportError).toBe('the PNG came back empty');
    expect(report.exportPaths).toEqual([]);
  });

  it('does not overwrite a file that changed on disk since it was opened', async () => {
    const vault = new FakeVault();
    const file = seedMap(vault, 'map v1');
    const editor = new FakeMapEditor('generated');
    const session = new MapSession(vault, editor, () => []);
    await session.open(file);
    editor.edit('map v1 with an edit in FMG');

    vault.writeExternally(file, 'map v1 edited by git', file.stat.mtime + 60_000);
    const outcome = await session.save(file);

    expect(outcome.kind).toBe(MAP_SAVE_OUTCOME_KIND_CASES.CONFLICT);
    expect(vault.readText(MAP_PATH)).toBe('map v1 edited by git');

    readReport(await session.save(file, { shouldOverwrite: true }));
    expect(vault.readText(MAP_PATH)).toBe('map v1 with an edit in FMG');
  });

  it('keeps saving without a conflict after its own writes', async () => {
    const vault = new FakeVault();
    const file = seedMap(vault, 'map v1');
    const editor = new FakeMapEditor('generated');
    const session = new MapSession(
      vault,
      editor,
      () => [],
      () => vault.nowMs + 30_000,
    );
    await session.open(file);

    readReport(await session.save(file));
    editor.edit('map v3');

    expect(readReport(await session.save(file)).mapPath).toBe(MAP_PATH);
    expect(vault.readText(MAP_PATH)).toBe('map v3');
  });

  it('puts unsaved edits in a copy next to the map instead of over it', async () => {
    const vault = new FakeVault();
    const file = seedMap(vault, 'map v1');
    vault.seedFile('Worlds/Aster/Aster (unsaved changes).map', 'an older copy');
    const editor = new FakeMapEditor('map v1 with edits');

    const copyPath = await new MapSession(vault, editor, () => []).saveCopy(file);

    expect(copyPath).toBe('Worlds/Aster/Aster (unsaved changes 2).map');
    expect(vault.readText(copyPath)).toBe('map v1 with edits');
    expect(vault.readText(MAP_PATH)).toBe('map v1');
  });
});

describe('MapSession.open', () => {
  it('passes the saved map back to the editor when the file is reopened', async () => {
    const vault = new FakeVault();
    const file = seedMap(vault, 'map as first opened');
    const firstEditor = new FakeMapEditor('generated on start-up');
    const firstSession = new MapSession(vault, firstEditor, () => []);

    await firstSession.open(file);
    firstEditor.edit('map with Ostwick renamed to Ostmere');
    await firstSession.save(file);

    const reopenedEditor = new FakeMapEditor('generated on start-up');
    await new MapSession(vault, reopenedEditor, () => []).open(file);

    expect(firstEditor.loadedTexts).toEqual(['map as first opened']);
    expect(reopenedEditor.loadedTexts).toEqual(['map with Ostwick renamed to Ostmere']);
  });

  it('keeps and saves the generated map when the file is empty', async () => {
    const vault = new FakeVault();
    const file = seedMap(vault, '');
    const editor = new FakeMapEditor('generated on start-up');

    const report = await new MapSession(vault, editor, () => [MAP_EXPORT_KINDS.PNG]).open(file);

    expect(editor.loadedTexts).toEqual([]);
    expect(vault.readText(MAP_PATH)).toBe('generated on start-up');
    expect(report?.exportPaths).toEqual(['Worlds/Aster/Aster.fmg.png']);
  });

  it('passes the file bytes unchanged, so compressed maps reach the editor intact', async () => {
    const vault = new FakeVault();
    vault.seedFolder('Worlds/Aster');
    const gzipBytes = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x01, 0x02]).buffer;
    const file = vault.seedFile(MAP_PATH, gzipBytes);
    const received: ArrayBuffer[] = [];
    const editor = new FakeMapEditor('generated');
    editor.loadMap = async (mapData) => {
      received.push(mapData);
    };

    await new MapSession(vault, editor, () => []).open(file);

    expect([...new Uint8Array(received[0] ?? new ArrayBuffer(0))]).toEqual([0x1f, 0x8b, 0x08, 0x00, 0x01, 0x02]);
  });
});

describe('MapSession.hasUnsavedChanges', () => {
  it('is false after opening and after saving, and true after an edit', async () => {
    const vault = new FakeVault();
    const file = seedMap(vault, 'map v1');
    const editor = new FakeMapEditor('generated');
    const session = new MapSession(vault, editor, () => []);

    await session.open(file);
    expect(await session.hasUnsavedChanges()).toBe(false);

    editor.edit('map v1 with Ostmere');
    expect(await session.hasUnsavedChanges()).toBe(true);

    await session.save(file);
    expect(await session.hasUnsavedChanges()).toBe(false);
  });
});
