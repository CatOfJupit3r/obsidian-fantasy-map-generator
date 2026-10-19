import { describe, expect, it } from 'vitest';

import { turnOffFmgAutosave } from '../../src/fmg-bridge/fmg-stored-options';
import { createFakeStorage } from '../utils/fake-storage';

const AUTOSAVE_OFF = { interval: 0, remind: false };

function readStoredOptions(storage: ReturnType<typeof createFakeStorage>) {
  const stored: unknown = JSON.parse(storage.getItem('fmg-options') ?? '');
  return stored;
}

describe('turnOffFmgAutosave', () => {
  it('keeps every other stored option', () => {
    const stored = {
      app: { performance: { viewportRedraw: 'settled' }, autosave: { interval: 15, remind: true } },
      map: { seed: '42' },
    };
    const storage = createFakeStorage({ 'fmg-options': JSON.stringify(stored) });

    turnOffFmgAutosave(storage);

    expect(readStoredOptions(storage)).toEqual({ ...stored, app: { ...stored.app, autosave: AUTOSAVE_OFF } });
  });

  it('stores only the autosave options when nothing readable is stored', () => {
    for (const text of [null, 'not json', '[1, 2]', '{"app": "broken"}']) {
      const storage = createFakeStorage(text === null ? {} : { 'fmg-options': text });

      turnOffFmgAutosave(storage);

      expect(readStoredOptions(storage)).toMatchObject({ app: { autosave: AUTOSAVE_OFF } });
    }
  });
});
