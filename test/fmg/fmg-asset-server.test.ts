import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { FmgAssetServer } from '../../src/fmg/fmg-asset-server';

describe('FMG asset server', () => {
  const assetServers: FmgAssetServer[] = [];
  const temporaryFolders: string[] = [];

  afterEach(async () => {
    await Promise.all(assetServers.splice(0).map((assetServer) => assetServer.stop()));
    await Promise.all(temporaryFolders.splice(0).map((temporaryFolder) => rm(temporaryFolder, { force: true, recursive: true })));
  });

  it('serves the FMG entry page and assets from a loopback-only origin', async () => {
    const assetFolder = await createTemporaryAssetFolder();
    await writeFile(join(assetFolder, 'index.html'), '<script src="bundle.js"></script>');
    await writeFile(join(assetFolder, 'bundle.js'), 'globalThis.fmgLoaded = true;');

    const { pageUrl } = await startAssetServer(assetFolder);
    const pageResponse = await fetch(pageUrl);
    const scriptResponse = await fetch(new URL('bundle.js', pageUrl));

    expect(new URL(pageUrl).hostname).toBe('127.0.0.1');
    expect(pageResponse.status).toBe(200);
    expect(pageResponse.headers.get('content-type')).toBe('text/html; charset=utf-8');
    await expect(pageResponse.text()).resolves.toContain('bundle.js');
    expect(scriptResponse.status).toBe(200);
    expect(scriptResponse.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    await expect(scriptResponse.text()).resolves.toBe('globalThis.fmgLoaded = true;');
  });

  it('does not serve files outside the configured FMG folder', async () => {
    const parentFolder = await createTemporaryAssetFolder();
    const assetFolder = join(parentFolder, 'fmg');
    await mkdir(assetFolder);
    await writeFile(join(parentFolder, 'private.txt'), 'vault secret');

    const { pageUrl } = await startAssetServer(assetFolder);
    const response = await fetch(new URL('/..%2Fprivate.txt', pageUrl));

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.not.toContain('vault secret');
  });

  it('reuses the preferred port, so FMG keeps the storage of its origin across sessions', async () => {
    const assetFolder = await createTemporaryAssetFolder();
    const firstServer = await startAssetServer(assetFolder);
    await assetServers.splice(0).at(0)?.stop();

    const secondServer = await startAssetServer(assetFolder, firstServer.port);

    expect(secondServer.port).toBe(firstServer.port);
  });

  it('falls back to a free port when the preferred one is taken', async () => {
    const assetFolder = await createTemporaryAssetFolder();
    const occupyingServer = await startAssetServer(assetFolder);

    const fallbackServer = await startAssetServer(assetFolder, occupyingServer.port);

    expect(fallbackServer.port).not.toBe(occupyingServer.port);
    expect((await fetch(fallbackServer.pageUrl)).status).toBe(404);
  });

  async function createTemporaryAssetFolder() {
    const temporaryFolder = await mkdtemp(join(tmpdir(), 'azgaar-fmg-assets-'));
    temporaryFolders.push(temporaryFolder);
    return temporaryFolder;
  }

  async function startAssetServer(assetFolder: string, preferredPort: number | null = null) {
    const assetServer = new FmgAssetServer(assetFolder);
    assetServers.push(assetServer);
    return assetServer.start(preferredPort);
  }
});
