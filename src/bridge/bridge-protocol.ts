import { em } from 'enumwaii';
import { emToZodSchema } from 'enumwaii/zod';
import { z } from 'zod';

import { mapEntityKindSchema } from '../entities/map-entity.constants';
import { mapExportKindSchema } from '../map/map-export.constants';

/** Every message carries this channel name; the version in it changes whenever a message shape does. */
export const BRIDGE_CHANNEL = 'azgaar-fmg-bridge/v4';

/** The hash parameter that tells the page inside the frame which origin may talk to it. */
export const BRIDGE_PARENT_ORIGIN_PARAM = 'azgaar-parent-origin';

const bridgeMessageKindsEnumwaii = em([
  'READY',
  'SAVE_REQUESTED',
  'ENTITY_CLICKED',
  'LOAD_MAP',
  'SAVE_MAP',
  'EXPORT_MAP',
  'SHOW_REGION',
  'RESULT',
  'FAILURE',
]);
export const BRIDGE_MESSAGE_KINDS = bridgeMessageKindsEnumwaii.enum;
export type BridgeMessageKind = (typeof bridgeMessageKindsEnumwaii)['~type'];
export const bridgeMessageKindSchema = emToZodSchema(bridgeMessageKindsEnumwaii);

/** The messages the plugin sends and the frame answers with RESULT or FAILURE under the same id. */
const bridgeRequestKindsEnumwaii = bridgeMessageKindsEnumwaii.pick([
  BRIDGE_MESSAGE_KINDS.LOAD_MAP,
  BRIDGE_MESSAGE_KINDS.SAVE_MAP,
  BRIDGE_MESSAGE_KINDS.EXPORT_MAP,
  BRIDGE_MESSAGE_KINDS.SHOW_REGION,
]);
export const BRIDGE_REQUEST_KINDS = bridgeRequestKindsEnumwaii.enum;
export type BridgeRequestKind = (typeof bridgeRequestKindsEnumwaii)['~type'];
export const isBridgeRequestKind = (kind: BridgeMessageKind): kind is BridgeRequestKind =>
  bridgeRequestKindsEnumwaii.is(kind);

/** What the frame announces on its own, with no request behind it. */
const bridgeEventKindsEnumwaii = bridgeMessageKindsEnumwaii.pick([
  BRIDGE_MESSAGE_KINDS.READY,
  BRIDGE_MESSAGE_KINDS.SAVE_REQUESTED,
  BRIDGE_MESSAGE_KINDS.ENTITY_CLICKED,
]);
export const BRIDGE_EVENT_KINDS = bridgeEventKindsEnumwaii.enum;
export type BridgeEventKind = (typeof bridgeEventKindsEnumwaii)['~type'];

export const bridgeEnvelopeSchema = z.object({
  channel: z.literal(BRIDGE_CHANNEL),
  kind: bridgeMessageKindSchema,
  id: z.string().min(1),
  payload: z.unknown(),
});
export type BridgeEnvelope = z.infer<typeof bridgeEnvelopeSchema>;

export const emptyPayloadSchema = z.object({});
/** The `.map` file's bytes: plain, base64 or gzip, as FMG's loader accepts them. */
export const loadMapRequestSchema = z.object({ mapData: z.instanceof(ArrayBuffer) });
export const savedMapSchema = z.object({ mapText: z.string().min(1) });
export const exportMapRequestSchema = z.object({ kinds: z.array(mapExportKindSchema) });
export const exportedMapFilesSchema = z.object({
  files: z.array(z.object({ kind: mapExportKindSchema, data: z.instanceof(ArrayBuffer) })),
});
export const bridgeFailureSchema = z.object({ message: z.string() });

const mapBoxSchema = z.object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() });
export const showRegionRequestSchema = z.object({ box: mapBoxSchema });
/** The entities under a Ctrl/Cmd+click on the map, the most specific first: a burg or marker, then the areas. */
export const entityClickedSchema = z.object({
  candidates: z.array(z.object({ kind: mapEntityKindSchema, id: z.number().int().nonnegative() })),
});
