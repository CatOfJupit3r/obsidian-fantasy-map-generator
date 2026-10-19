import { cp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { readCachedFmg } from './fmg-cache';
import { injectContentSecurityPolicy } from './fmg-csp';

export interface iFmgBundlePaths {
  /** Holds the FMG checkout and its build, as `build:fmg` left them. */
  cacheDir: string;
  /** The plugin's build output: main.js, manifest.json, styles.css. */
  distDir: string;
  /** The bridge script the plugin build emitted. */
  bridgeScript: string;
}

const BRIDGE_FILE_NAME = 'azgaar-fmg-bridge.js';
const FMG_LICENSE_FILE_NAME = 'LICENSE-FMG';

/** FMG's offline-cache files. Desktop mode registers no service worker, so they would only sit in the plugin folder. */
const OFFLINE_CACHE_FILE_PATTERN =
  /^(?:sw|service-worker|registerSW|workbox-[\w-]+|precache-manifest[\w.-]*)\.js(?:\.map)?$/u;

export class FmgNotBuiltError extends Error {
  public constructor(cacheDir: string) {
    super(`No built FMG in ${cacheDir}. Run "npm run build:fmg" first.`);
  }
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name));
}

async function dropOfflineCacheFiles(fmgDir: string) {
  for (const filePath of await listFiles(fmgDir)) {
    if (OFFLINE_CACHE_FILE_PATTERN.test(path.basename(filePath))) await rm(filePath);
  }
}

async function prepareIndexHtml(fmgDir: string, bridgeScript: string) {
  await cp(bridgeScript, path.join(fmgDir, BRIDGE_FILE_NAME));

  const indexPath = path.join(fmgDir, 'index.html');
  const html = await readFile(indexPath, 'utf8');
  if (!html.includes('</head>')) throw new Error(`${indexPath} has no </head> to put the bridge before.`);

  const withBridge = html.replace('</head>', `  <script src="./${BRIDGE_FILE_NAME}"></script>\n  </head>`);
  await writeFile(indexPath, injectContentSecurityPolicy(withBridge));
}

/** Puts the cached, built FMG, the bridge and FMG's licence next to the plugin's files. Never fetches. */
export async function bundleFmg(paths: iFmgBundlePaths) {
  const cache = await readCachedFmg(paths.cacheDir);
  if (!cache) throw new FmgNotBuiltError(paths.cacheDir);

  const fmgDir = path.join(paths.distDir, 'fmg');
  await rm(fmgDir, { recursive: true, force: true });
  await cp(cache.buildDir, fmgDir, { recursive: true });
  await dropOfflineCacheFiles(fmgDir);
  await prepareIndexHtml(fmgDir, paths.bridgeScript);
  await cp(path.join(cache.sourceDir, 'LICENSE'), path.join(paths.distDir, FMG_LICENSE_FILE_NAME));
}
