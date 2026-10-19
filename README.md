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
- FMG's own autosave to browser storage and its "save to desktop" reminders are off: the vault file is where the map lives.
- A save over a file that changed on disk asks whether to reload it or overwrite it. A change on disk with no unsaved edits in FMG reloads the map.
- "New map" creates `Untitled map.map` (or `Untitled map 1.map`, ...) in the maps folder, creating the folder when missing, and saves the map FMG generates for it.
- Settings: the maps folder, the exports to write on save, the folder per kind for notes the link report creates, and the bundled FMG version.

## Linked notes

A note stands for a map entity through three flat properties, by FMG's own id, so renaming the note or the entity in FMG keeps the link. `fmg-map` is a real link: the Properties view shows it as one, and Obsidian updates it when the `.map` file moves (with "Automatically update internal links" on). The properties work in Bases and Dataview like any others:

```yaml
fmg-map: "[[Maps/Aster.map]]"
fmg-kind: state # state, province, burg, culture, religion, marker or zone
fmg-id: 7
```

- "Link note to map entity" links the active note: it picks the map (the one already linked, the vault's only map, or one you choose) and the entity from the map's Full JSON export.
- "Show on map" opens the linked map in FMG and zooms to the entity.
- Ctrl/Cmd+click on the FMG map opens the note of the most specific linked entity under the cursor: a burg or marker first, then a zone, province, state, culture and religion. A plain click still opens FMG's own editors.
- "Map link report" lists the map's entities that have no note, each with a button that creates one, and the linked notes that lead nowhere: to an entity the map no longer has, or to a map that is not in the vault. Linked notes are found by their properties, in any folder. New notes go to Obsidian's default location for new notes, or to a folder you set per kind in the settings.
- Renaming or moving a `.map` moves its exports with it.

The plugin never writes into a note's text. What a note shows of the map is up to the note: put the blocks below where you want them, or in your templates.

### Embedding anywhere

Both blocks show the entity their own note links to when left empty, and any entity when they name one, so a travelogue or a session log can show a country it has no link to. A block names its entity in one of two ways:

````markdown
```fmg-map
note: "[[Ostmark]]" # borrows that note's link; stays right when the entity is renamed in FMG
```

```fmg-facts
kind: state # with id or name
name: Ostmark
map: "[[Aster.map]]" # needed only when the vault has more than one map
```
````

`map` and `note` take a link, quoted or not, or a plain path. "Insert mini-map" and "Insert map facts" pick a map and an entity and insert a block that names it: by its note when it has one, else by kind and id.

### Map facts

An `fmg-facts` code block lists what the map knows about the note's linked entity, in the map's own units: area, population, capital, state and province, neighbours (linked to their notes), rivers, dominant biomes, and the temperature and precipitation range. It reads the Full JSON export and redraws whenever a save rewrites it. An empty block shows the linked entity; it takes the same `map`, `note`, `kind`, `id` and `name` options as `fmg-map` to show another one:

````markdown
```fmg-facts
```
````

### Mini-map

An `fmg-map` code block draws the map's SVG export (or its PNG export when the SVG export is off) cropped to the note's linked entity, with the entity outlined and the rest dimmed. Scroll to zoom, drag to pan, double-click to reset; clicking a neighbour that has a note opens it. It reads only the exports, never FMG itself, and redraws when a save refreshes them. Every option is optional:

The layers button in the mini-map's corner picks what areas are filled with, in FMG's own colors (states, provinces, cultures, religions or none), and shows or hides rivers and lakes, routes, borders, burgs and state names. The areas are drawn from the Full JSON export, so they don't depend on which layers were on in FMG when you saved; FMG's own area fills are left out. By default a mini-map fills areas of its entity's kind (states for burgs, markers and zones), and maps of provinces, cultures and religions start without state names. The choice lasts while the note is open. Layers can be toggled only with the SVG export, whose parts stay sharp at any zoom; the PNG export has its layers baked in.

````markdown
```fmg-map
map: "[[Aster.map]]" # defaults to the linked map, or the vault's only map
kind: state # with id or name, shows that entity instead of the linked one
name: Ostmark
height: 400 # in pixels, 120 to 1200; 320 by default
```
````

### From earlier versions

Earlier versions linked notes with a nested `fmg: { map, kind, id }` property, wrote a `[!map-facts]` callout into each linked note on save, and baked a PNG thumbnail per entity (`Maps/Aster.fmg.state-7.png`). On start, the plugin moves such notes to the flat properties, replaces the callout with empty `fmg-map` and `fmg-facts` blocks in the same place, and moves the thumbnails to the trash. Notes already in the current shape are left alone.

## Exports

Written next to the map, named after it with a `.fmg.` infix so they never clash with your own notes and images. For `Maps/Aster.map`:

| Setting         | File                             | Format                                                                                           | Default |
| --------------- | -------------------------------- | ------------------------------------------------------------------------------------------------ | ------- |
| PNG render      | `Maps/Aster.fmg.png`             | The whole map at FMG's PNG resolution setting, without scale bar or vignette                     | on      |
| SVG render      | `Maps/Aster.fmg.svg`             | FMG's "Export to SVG" of the whole map; mini-maps draw from it, sharp at any zoom               | on      |
| Full JSON       | `Maps/Aster.fmg.json`            | FMG's "Export to JSON, Full": `info`, `settings`, `pack` (burgs, markers, states, cells), `grid` | on      |
| Markers GeoJSON | `Maps/Aster.fmg.markers.geojson` | FMG's "Export markers to GeoJSON": a `FeatureCollection` of `Point` features                     | on      |

Burgs are in the JSON under `pack.burgs` (`name`, `x`, `y`, `cell`, `state`, ...), markers under `pack.markers` and in the GeoJSON (`properties.id`, `type`, `name`, `x`, `y`; coordinates are FMG's longitude and latitude). `x` and `y` are map units on a map of `info.width` by `info.height`; both renders show that whole area (the PNG scaled by FMG's PNG resolution setting). Climate per grid cell is in `grid.cells[].temp` and `grid.cells[].prec`.

## Trust and network access

A `.map` file is more than data: FMG runs part of it as code (the goods definitions of a map are evaluated with `new Function`), so a map can run code inside FMG's frame. Open only maps you trust.

FMG's page carries a Content-Security-Policy that limits where data can go: everything loads from the plugin's own files, except the Google font hosts (`fonts.googleapis.com`, `fonts.gstatic.com`) that FMG's exports read. FMG's online features (AI assistant, translation, emblem service) are blocked, and FMG runs in its desktop mode, with no service worker.

While the plugin is loaded, it serves the bundled FMG files from an HTTP server bound only to `127.0.0.1`. Obsidian blocks nested assets beneath a plugin `app://` URL, so the loopback server supplies the frame's scripts, styles, fonts and images without accepting connections from the local network; it stops when the plugin unloads. The plugin remembers the server's port and reuses it, because FMG keeps its own options (performance preset, layer presets and the like) in that origin's storage; when the port is taken it picks a free one, and FMG starts once with its default options.

## Licence

FMG is MIT-licensed by Max Haniyeu (Azgaar); its licence ships as `LICENSE-FMG`.
