# Obsidian Fantasy Map Generator

An Obsidian plugin that opens vault `.map` files in a bundled, version-pinned build of Azgaar's [Fantasy Map Generator](https://github.com/Azgaar/fantasy-map-generator) (FMG) and saves them back into the vault.

## Build and install

```sh
npm run build:release
```

- `build:fmg` clones FMG at the tag pinned in `src/fmg/fmg-pin.ts` into `node_modules/.cache/obsidian-fmg/`, checks the commit and runs FMG's own build there with a relative base (its desktop mode). The clone and the build get a minimal environment (`PATH`, `HOME`, proxy and certificate settings; `NODE_ENV=production` for the build), not the whole of your shell's.
- `build` bundles the plugin and copies FMG from that cache into `dist/fmg/`, drops FMG's service worker, injects the plugin's bridge script and a Content-Security-Policy, and never touches the network. Without a cached FMG it warns and leaves `dist/fmg/` out.
- `build:release` runs `build:fmg`, then `build`, and fails when FMG is missing.

Copy `dist/` to `<vault>/.obsidian/plugins/azgaar-fantasy-map-generator/` and enable "Azgaar Fantasy Map Generator". `dist/` holds `main.js`, `manifest.json`, `styles.css`, `LICENSE-FMG` and `fmg/`.

## Use

- Open a `.map` file to edit it in FMG. "Save map" (the view's save icon or the command) and Ctrl/Cmd+S inside FMG write it back to the same vault file and refresh the enabled exports. FMG's own "Save to machine" is not used.
- Unsaved edits are saved when the view closes. If the file changed on disk since it was opened (a sync or git, say), they are written to `<name> (unsaved changes).map` next to it instead, and a notice names the copy.
- A save over a file that changed on disk asks whether to reload it or overwrite it. A change on disk with no unsaved edits in FMG reloads the map.
- "New map" creates `Untitled map.map` (or `Untitled map 1.map`, ...) in the maps folder, creating the folder when missing, and saves the map FMG generates for it.
- Settings: the maps folder, the exports to write on save, and the bundled FMG version.

## Exports

Written next to the map, named after it with a `.fmg.` infix so they never clash with your own notes and images. For `Maps/Aster.map`:

| Setting         | File                             | Format                                                                                           | Default |
| --------------- | -------------------------------- | ------------------------------------------------------------------------------------------------ | ------- |
| PNG render      | `Maps/Aster.fmg.png`             | The whole map at FMG's PNG resolution setting, without scale bar or vignette                     | on      |
| SVG render      | `Maps/Aster.fmg.svg`             | FMG's "Export to SVG" of the whole map                                                           | off     |
| Full JSON       | `Maps/Aster.fmg.json`            | FMG's "Export to JSON, Full": `info`, `settings`, `pack` (burgs, markers, states, cells), `grid` | on      |
| Markers GeoJSON | `Maps/Aster.fmg.markers.geojson` | FMG's "Export markers to GeoJSON": a `FeatureCollection` of `Point` features                     | on      |

Burgs are in the JSON under `pack.burgs` (`name`, `x`, `y`, `cell`, `state`, ...), markers under `pack.markers` and in the GeoJSON (`properties.id`, `type`, `name`, `x`, `y`; coordinates are FMG's longitude and latitude). `x` and `y` are map units on a map of `info.width` by `info.height`; both renders show that whole area (the PNG scaled by FMG's PNG resolution setting). Climate per grid cell is in `grid.cells[].temp` and `grid.cells[].prec`.

## Trust and network access

A `.map` file is more than data: FMG runs part of it as code (the goods definitions of a map are evaluated with `new Function`), so a map can run code inside FMG's frame. Open only maps you trust.

FMG's page carries a Content-Security-Policy that limits where data can go: everything loads from the plugin's own files, except the Google font hosts (`fonts.googleapis.com`, `fonts.gstatic.com`) that FMG's exports read. FMG's online features (AI assistant, translation, emblem service) are blocked, and FMG runs in its desktop mode, with no service worker.

While the plugin is loaded, it serves the bundled FMG files from an ephemeral HTTP server bound only to `127.0.0.1`. Obsidian blocks nested assets beneath a plugin `app://` URL, so the loopback server supplies the frame's scripts, styles, fonts and images without accepting connections from the local network; it stops when the plugin unloads.

## Licence

FMG is MIT-licensed by Max Haniyeu (Azgaar); its licence ships as `LICENSE-FMG`.
