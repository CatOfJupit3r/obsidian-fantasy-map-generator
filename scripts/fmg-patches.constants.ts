/**
 * Changes the plugin makes to FMG's source before building it, as `git diff` files in `scripts/fmg-patches`, applied in
 * this order. Bump the revision whenever a patch is added, removed or edited: the cached build is named after it, so
 * a stale build is never reused.
 */
export const FMG_PATCHES = {
  revision: 1,
  fileNames: ['save-to-host.patch'],
} as const;
