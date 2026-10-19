import path from 'node:path';

export const PACKAGE_DIR = path.resolve(import.meta.dirname, '..');
export const DIST_DIR = path.join(PACKAGE_DIR, 'dist');
/** Inside node_modules, so git ignores it and a clean install clears it. */
export const FMG_CACHE_DIR = path.join(PACKAGE_DIR, 'node_modules', '.cache', 'obsidian-fmg');
