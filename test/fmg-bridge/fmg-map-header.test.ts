import { describe, expect, it } from 'vitest';

import { isRequestedFmgMap, readFmgMapHeader } from '../../src/fmg-bridge/fmg-map-header';

const MAP_TEXT = '1.154.2|licence|2026-10-19|seed-42|1920|1080|1760000000000\r\nsettings\r\nmore lines';
const EXPECTED_HEADER = { seed: 'seed-42', mapId: 1_760_000_000_000 };

const encode = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer;

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

describe('readFmgMapHeader', () => {
  it('reads a plain map', async () => {
    await expect(readFmgMapHeader(encode(MAP_TEXT))).resolves.toEqual(EXPECTED_HEADER);
  });

  it('reads a base64 map', async () => {
    await expect(readFmgMapHeader(encode(btoa(encodeURIComponent(MAP_TEXT))))).resolves.toEqual(EXPECTED_HEADER);
  });

  it('reads a gzip map', async () => {
    await expect(readFmgMapHeader(await gzip(MAP_TEXT))).resolves.toEqual(EXPECTED_HEADER);
  });

  it('rejects a file that is not an FMG map', async () => {
    await expect(readFmgMapHeader(encode('# My notes\nnothing to see'))).resolves.toBeNull();
  });

  it('has no map id for a map saved before FMG wrote one', async () => {
    await expect(readFmgMapHeader(encode('1.0|licence|date|seed-7|10|10\r\nrest'))).resolves.toEqual({
      seed: 'seed-7',
      mapId: null,
    });
  });
});

describe('isRequestedFmgMap', () => {
  it('accepts the map with the file seed and id, and refuses another map', () => {
    const header = { seed: 'seed-42', mapId: 5 };

    expect(isRequestedFmgMap(header, { seed: 'seed-42', mapId: 5 })).toBe(true);
    expect(isRequestedFmgMap(header, { seed: 'other', mapId: 5 })).toBe(false);
    expect(isRequestedFmgMap(header, { seed: 'seed-42', mapId: 6 })).toBe(false);
  });
});
