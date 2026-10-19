/**
 * The first line of FMG's `.map` text, as `Save.prepareMapData` writes it:
 * `version|licence|date|seed|width|height|mapId`, where the map id is the time the map was created.
 */
export interface iFmgMapHeader {
  seed: string;
  /** Null for maps saved before FMG wrote the id. */
  mapId: number | null;
}

/** What FMG's `map:generated` event says about the map now on screen. */
export interface iShownFmgMap {
  seed: string;
  mapId: number;
}

const HEADER_SEED_INDEX = 3;
const HEADER_MAP_ID_INDEX = 6;
const DELIMITER_PROBE_LENGTH = 10;

const isDelimited = (text: string) => text.slice(0, DELIMITER_PROBE_LENGTH).includes('|');

async function gunzip(data: ArrayBuffer): Promise<string | null> {
  try {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  } catch {
    return null;
  }
}

/** The `.map` text from its bytes, which FMG accepts plain, base64-encoded or gzip-compressed. */
async function decodeMapText(data: ArrayBuffer): Promise<string | null> {
  const text = new TextDecoder().decode(data);
  if (isDelimited(text)) return text;

  try {
    const decoded = decodeURIComponent(atob(text.trim()));
    return isDelimited(decoded) ? decoded : null;
  } catch {
    const unzipped = await gunzip(data);
    return unzipped !== null && isDelimited(unzipped) ? unzipped : null;
  }
}

/** The header of a `.map` file, or null when the bytes are not an FMG map. */
export async function readFmgMapHeader(data: ArrayBuffer): Promise<iFmgMapHeader | null> {
  const text = await decodeMapText(data);
  if (!text) return null;

  const fields = (text.split(/\r?\n/u, 1)[0] ?? '').split('|');
  const seed = fields[HEADER_SEED_INDEX];
  if (!seed) return null;

  const mapId = Number(fields[HEADER_MAP_ID_INDEX]);
  return { seed, mapId: Number.isFinite(mapId) && mapId > 0 ? mapId : null };
}

/** Whether FMG shows the map the header describes, and not, say, a new random map made after a failed load. */
export function isRequestedFmgMap(header: iFmgMapHeader, shown: iShownFmgMap): boolean {
  if (shown.seed !== header.seed) return false;
  return header.mapId === null || shown.mapId === header.mapId;
}
