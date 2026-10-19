import { em } from 'enumwaii';
import { emToZodSchema } from 'enumwaii/zod';
import { z } from 'zod';

import { mapExportKindSchema } from '../map/map-export.constants';

/** Every message carries this channel name; the version in it changes whenever a message shape does. */
export const BRIDGE_CHANNEL = 'azgaar-fmg-bridge/v2';

/** The hash parameter that tells the page inside the frame which origin may talk to it. */
export const BRIDGE_PARENT_ORIGIN_PARAM = 'azgaar-parent-origin';

const bridgeMessageKindsEnumwaii = em([
  'READY',
  'SAVE_REQUESTED',
  'LOAD_MAP',
  'SAVE_MAP',
  'EXPORT_MAP',
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
]);
export const BRIDGE_REQUEST_KINDS = bridgeRequestKindsEnumwaii.enum;
export type BridgeRequestKind = (typeof bridgeRequestKindsEnumwaii)['~type'];
export const isBridgeRequestKind = (kind: BridgeMessageKind): kind is BridgeRequestKind =>
  bridgeRequestKindsEnumwaii.is(kind);

/** What the frame announces on its own, with no request behind it. */
const bridgeEventKindsEnumwaii = bridgeMessageKindsEnumwaii.pick([
  BRIDGE_MESSAGE_KINDS.READY,
  BRIDGE_MESSAGE_KINDS.SAVE_REQUESTED,
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
