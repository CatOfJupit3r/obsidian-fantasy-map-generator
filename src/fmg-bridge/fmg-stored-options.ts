import { z } from 'zod';

/** Where FMG keeps its options; at start-up it merges what is stored there over its defaults. */
const FMG_OPTIONS_STORAGE_KEY = 'fmg-options';

/** The vault file holds the map, so FMG's autosave to its own storage and its "save to desktop" reminder only cost. */
const FMG_AUTOSAVE_OFF = { interval: 0, remind: false };

const storedRecordSchema = z.record(z.string(), z.unknown());

function readStoredRecord(text: string | null) {
  if (text === null) return {};
  try {
    return storedRecordSchema.catch({}).parse(JSON.parse(text));
  } catch {
    return {};
  }
}

/** Runs before FMG's scripts, so FMG starts with its autosave and save reminder already off. */
export function turnOffFmgAutosave(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  const stored = readStoredRecord(storage.getItem(FMG_OPTIONS_STORAGE_KEY));
  const app = storedRecordSchema.catch({}).parse(stored.app ?? {});
  storage.setItem(FMG_OPTIONS_STORAGE_KEY, JSON.stringify({ ...stored, app: { ...app, autosave: FMG_AUTOSAVE_OFF } }));
}
