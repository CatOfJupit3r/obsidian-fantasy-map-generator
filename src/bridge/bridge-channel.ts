import { BRIDGE_CHANNEL, bridgeEnvelopeSchema } from './bridge-protocol';
import type { BridgeEnvelope, BridgeMessageKind } from './bridge-protocol';

/** The part of a `MessageEvent` the bridge reads. */
export interface iBridgeMessageEvent {
  data: unknown;
  origin: string;
  source: unknown;
}

/** The window on the other side: the frame for the plugin, the parent for the page inside the frame. */
export interface iBridgePeer {
  postMessage: (message: unknown, targetOrigin: string, transfer?: Transferable[]) => void;
}

export interface iBridgeChannel {
  peer: iBridgePeer;
  /** Messages are sent only to this origin, and only messages from it are read. */
  peerOrigin: string;
  /** Starts delivering this window's messages and returns the function that stops it. */
  listen: (listener: (event: iBridgeMessageEvent) => void) => () => void;
}

/** The bridge message in the event, or null when it comes from another window or origin, or is not one. */
export function readBridgeEnvelope(channel: iBridgeChannel, event: iBridgeMessageEvent): BridgeEnvelope | null {
  if (event.source !== channel.peer || event.origin !== channel.peerOrigin) return null;

  const parsed = bridgeEnvelopeSchema.safeParse(event.data);
  return parsed.success ? parsed.data : null;
}

export function postBridgeMessage(
  channel: iBridgeChannel,
  message: { kind: BridgeMessageKind; id: string; payload: unknown },
  transfer: Transferable[] = [],
) {
  const envelope: BridgeEnvelope = { channel: BRIDGE_CHANNEL, ...message };
  channel.peer.postMessage(envelope, channel.peerOrigin, transfer);
}

/** A channel over a real window pair: `listenOn` receives what `peer` sends. */
export function createWindowChannel(listenOn: Window, peer: iBridgePeer, peerOrigin: string): iBridgeChannel {
  return {
    peer,
    peerOrigin,
    listen: (listener) => {
      const onMessage = (event: MessageEvent) => listener(event);
      listenOn.addEventListener('message', onMessage);
      return () => listenOn.removeEventListener('message', onMessage);
    },
  };
}
