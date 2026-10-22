import { access, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { FMG_PIN } from '../src/fmg/fmg-pin';
import { FMG_PATCHES } from './fmg-patches.constants';
import { run } from './fmg-run';

const FMG_PATCHES_DIR = path.join(import.meta.dirname, 'fmg-patches');

export interface iFmgCache {
  /** The checkout of the pinned tag. */
  sourceDir: string;
  /** FMG's own renderer build of the patched source, with a relative base. */
  buildDir: string;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function readCachePaths(cacheDir: string): iFmgCache {
  return {
    sourceDir: path.join(cacheDir, FMG_PIN.tag),
    buildDir: path.join(cacheDir, `build-${FMG_PIN.commit}-patches-${FMG_PATCHES.revision}`),
  };
}

async function readCheckedOutCommit(sourceDir: string): Promise<string> {
  return (await run('git', ['rev-parse', 'HEAD'], { cwd: sourceDir, shouldCaptureOutput: true })).trim();
}

/** The cached build of the pinned commit, or null when `build:fmg` has not produced one. Never touches the network. */
export async function readCachedFmg(cacheDir: string): Promise<iFmgCache | null> {
  const cache = readCachePaths(cacheDir);
  const isCached =
    (await exists(path.join(cache.buildDir, 'index.html'))) && (await exists(path.join(cache.sourceDir, '.git')));
  if (!isCached) return null;
  return (await readCheckedOutCommit(cache.sourceDir)) === FMG_PIN.commit ? cache : null;
}

/** A shallow checkout of the pinned tag, refused unless it is the pinned commit. */
async function ensureSource(cacheDir: string, sourceDir: string) {
  if (!(await exists(path.join(sourceDir, '.git')))) {
    await mkdir(cacheDir, { recursive: true });
    await rm(sourceDir, { recursive: true, force: true });
    await run('git', ['clone', '--depth', '1', '--branch', FMG_PIN.tag, FMG_PIN.repository, sourceDir], {
      cwd: cacheDir,
      env: { GIT_LFS_SKIP_SMUDGE: '1' },
    });
  }

  const commit = await readCheckedOutCommit(sourceDir);
  if (commit !== FMG_PIN.commit) {
    throw new Error(`${FMG_PIN.tag} is at ${commit}, expected ${FMG_PIN.commit}. Delete ${sourceDir} and rebuild.`);
  }
}

/** Puts the checkout back to the pinned commit, then applies the plugin's patches to it. */
async function applyPatches(sourceDir: string) {
  await run('git', ['reset', '--hard', FMG_PIN.commit], { cwd: sourceDir });
  for (const fileName of FMG_PATCHES.fileNames) {
    await run('git', ['apply', path.join(FMG_PATCHES_DIR, fileName)], { cwd: sourceDir });
  }
}

/** Fetches the pinned FMG and builds it, patched, with its own build (its desktop mode), unless the cache holds it. */
export async function fetchAndBuildFmg(cacheDir: string): Promise<iFmgCache> {
  const cache = readCachePaths(cacheDir);
  await ensureSource(cacheDir, cache.sourceDir);
  if (await exists(path.join(cache.buildDir, 'index.html'))) return cache;

  await applyPatches(cache.sourceDir);

  // Dev dependencies hold the bundler, so only the build itself runs as production.
  await run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: cache.sourceDir });
  const viteBin = path.join(cache.sourceDir, 'node_modules', 'vite', 'bin', 'vite.js');
  await run(process.execPath, [viteBin, 'build', '--mode', 'electron', '--base', './', '--outDir', cache.buildDir], {
    cwd: cache.sourceDir,
    env: { NODE_ENV: 'production' },
  });
  return cache;
}
