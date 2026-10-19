import { rm } from 'node:fs/promises';
import path from 'node:path';

import { FMG_PIN } from '../src/fmg/fmg-pin';
import { bundleFmg } from './fmg-bundle';
import { DIST_DIR, FMG_CACHE_DIR } from './fmg-paths';

/**
 * Runs after tsdown and only copies: FMG comes from the cache `build:fmg` fills, never from the network. Without a
 * cached build it warns and leaves FMG out, so the workspace build still passes; `--require-fmg` makes that a failure,
 * for builds meant to be installed.
 */
const BRIDGE_DIR = path.join(DIST_DIR, 'bridge');
const shouldRequireFmg = process.argv.includes('--require-fmg');

try {
  await bundleFmg({
    cacheDir: FMG_CACHE_DIR,
    distDir: DIST_DIR,
    bridgeScript: path.join(BRIDGE_DIR, 'azgaar-fmg-bridge.js'),
  });
  console.log(`Bundled FMG ${FMG_PIN.tag} into ${path.join(DIST_DIR, 'fmg')}.`);
} catch (error) {
  if (shouldRequireFmg) throw error;
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`FMG ${FMG_PIN.tag} was not bundled, so dist/ cannot open maps yet: ${message}`);
} finally {
  await rm(BRIDGE_DIR, { recursive: true, force: true });
}
