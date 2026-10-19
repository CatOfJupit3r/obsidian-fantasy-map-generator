import { z } from 'zod';

/**
 * The part of FMG's "Export to JSON, Full" the plugin reads (`services/io/export-json.ts` in FMG). Cells must parse,
 * since every fact and crop comes from them; an entity list item that does not parse drops only itself, because
 * FMG keeps placeholders in some lists (the first burg and province are empty).
 */

/** A list that keeps the items `schema` accepts and leaves out the rest. */
function lenientList<TItem>(schema: z.ZodType<TItem>) {
  return z
    .array(z.unknown())
    .catch([])
    .transform((items) =>
      items.flatMap((item) => {
        const parsed = schema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      }),
    );
}

const pointSchema = z.tuple([z.number(), z.number()]);

const optionalNumber = z.number().optional().catch(undefined);
const optionalString = z.string().optional().catch(undefined);
const optionalBoolean = z.boolean().optional().catch(undefined);

const entityBase = {
  i: z.number().int().nonnegative(),
  name: optionalString,
  /** FMG's fill for the entity's area on the map, as a CSS color. */
  color: optionalString,
  removed: optionalBoolean,
};

const packCellSchema = z.object({
  v: z.array(z.number().int()),
  c: z.array(z.number().int()),
  p: pointSchema,
  g: z.number().int(),
  h: z.number(),
  area: z.number(),
  biome: z.number().int(),
  r: z.number().int(),
  pop: z.number(),
  culture: z.number().int(),
  burg: z.number().int(),
  state: z.number().int(),
  religion: z.number().int(),
  province: z.number().int(),
});
export type FmgPackCell = z.infer<typeof packCellSchema>;

const stateSchema = z.object({
  ...entityBase,
  fullName: optionalString,
  capital: optionalNumber,
  neighbors: z.array(z.number().int()).optional().catch(undefined),
});
export type FmgState = z.infer<typeof stateSchema>;

const provinceSchema = z.object({
  ...entityBase,
  fullName: optionalString,
  state: optionalNumber,
  burg: optionalNumber,
});
export type FmgProvince = z.infer<typeof provinceSchema>;

const burgSchema = z.object({
  ...entityBase,
  x: z.number(),
  y: z.number(),
  cell: z.number().int(),
  state: optionalNumber,
  culture: optionalNumber,
  capital: optionalNumber,
  port: optionalNumber,
  population: optionalNumber,
});
export type FmgBurg = z.infer<typeof burgSchema>;

const markerSchema = z.object({
  ...entityBase,
  type: optionalString,
  x: z.number(),
  y: z.number(),
  cell: z.number().int(),
});
export type FmgMarker = z.infer<typeof markerSchema>;

const zoneSchema = z.object({ ...entityBase, type: optionalString, cells: z.array(z.number().int()) });
export type FmgZone = z.infer<typeof zoneSchema>;

const namedEntitySchema = z.object(entityBase);
export type FmgNamedEntity = z.infer<typeof namedEntitySchema>;

const fmgMapDataSchema = z.object({
  info: z.object({ width: z.number().positive(), height: z.number().positive(), mapName: optionalString }),
  settings: z.object({
    distanceUnit: z.string().catch('km'),
    distanceScale: z.number().catch(1),
    areaUnit: z.string().catch('square'),
    temperatureScale: z.string().catch('°C'),
    populationRate: z.number().catch(1000),
    urbanization: z.number().catch(1),
  }),
  pack: z.object({
    cells: z.array(packCellSchema),
    vertices: z.array(z.object({ p: pointSchema })),
    biomes: lenientList(namedEntitySchema),
    burgs: lenientList(burgSchema),
    states: lenientList(stateSchema),
    provinces: lenientList(provinceSchema),
    cultures: lenientList(namedEntitySchema),
    religions: lenientList(namedEntitySchema),
    rivers: lenientList(namedEntitySchema),
    markers: lenientList(markerSchema),
    zones: lenientList(zoneSchema),
  }),
  grid: z.object({ cells: z.array(z.object({ temp: z.number(), prec: z.number() })) }),
});
export type FmgMapData = z.infer<typeof fmgMapDataSchema>;
export type FmgMapSettings = FmgMapData['settings'];
export type FmgPack = FmgMapData['pack'];

/** The map data in a Full JSON export's text; throws when the text is not one. */
export function parseFmgMapData(jsonText: string): FmgMapData {
  const parsed = fmgMapDataSchema.safeParse(JSON.parse(jsonText));
  if (!parsed.success) throw new Error('The JSON export is not an FMG "Full" JSON export.');
  return parsed.data;
}
