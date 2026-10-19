import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { captureDownload } from '../../src/fmg-bridge/fmg-download-capture';

/** The part of an anchor element FMG's exports use: they set `download` and `href`, then click. */
class FakeAnchor {
  public download = '';

  public href = '';

  public click(): void {
    throw new Error('the browser would save a file');
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const anchor = new FakeAnchor();
  anchor.download = fileName;
  anchor.href = URL.createObjectURL(blob);
  anchor.click();
}

beforeEach(() => {
  vi.stubGlobal('HTMLAnchorElement', FakeAnchor);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('captureDownload', () => {
  it('returns the blob an export downloads, without saving it', async () => {
    const blob = new Blob(['{"info":{}}'], { type: 'application/json' });

    await expect(captureDownload(async () => downloadBlob(blob, 'map.json'))).resolves.toBe(blob);
  });

  it('puts back the functions it replaced, after a success and after a failure', async () => {
    const createObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const click = Object.getOwnPropertyDescriptor(FakeAnchor.prototype, 'click');

    await captureDownload(async () => downloadBlob(new Blob(['x']), 'map.json'));
    await expect(
      captureDownload(async () => {
        throw new Error('export failed');
      }),
    ).rejects.toThrow('export failed');

    expect(Object.getOwnPropertyDescriptor(URL, 'createObjectURL')).toEqual(createObjectUrl);
    expect(Object.getOwnPropertyDescriptor(FakeAnchor.prototype, 'click')).toEqual(click);
  });

  it('fails when the export downloads nothing', async () => {
    await expect(captureDownload(async () => undefined)).rejects.toThrow('did not produce the export');
  });
});
