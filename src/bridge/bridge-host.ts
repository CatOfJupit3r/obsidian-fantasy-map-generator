import { postBridgeMessage, readBridgeEnvelope } from './bridge-channel';
import type { iBridgeChannel } from './bridge-channel';
import { BRIDGE_MESSAGE_KINDS, isBridgeRequestKind } from './bridge-protocol';
import type { BridgeEnvelope, BridgeEventKind, BridgeRequestKind } from './bridge-protocol';

export interface iBridgeReply {
  payload: unknown;
  /** Buffers in the payload handed over instead of copied. */
  transfer?: Transferable[];
}

export type BridgeRequestHandler = (kind: BridgeRequestKind, payload: unknown) => Promise<iBridgeReply>;

/** The frame's end of the bridge: answers each request with RESULT or FAILURE under the request's id. */
export class BridgeHost {
  private readonly stopListening: () => unknown;

  private eventCount = 0;

  public constructor(
    private readonly channel: iBridgeChannel,
    private readonly handleRequest: BridgeRequestHandler,
  ) {
    this.stopListening = channel.listen((event) => {
      const envelope = readBridgeEnvelope(channel, event);
      if (envelope) {
        void this.answer(envelope).catch((error: unknown) => {
          console.error('The FMG bridge could not answer a request.', error);
        });
      }
    });
  }

  /** Tells the plugin something happened in the frame; events need no answer. */
  public notify(kind: BridgeEventKind, payload: object = {}) {
    this.eventCount += 1;
    postBridgeMessage(this.channel, { kind, id: `event-${this.eventCount}`, payload });
  }

  public dispose() {
    this.stopListening();
  }

  private async answer(envelope: BridgeEnvelope) {
    const { kind, id } = envelope;
    if (!isBridgeRequestKind(kind)) return;

    try {
      const reply = await this.handleRequest(kind, envelope.payload);
      postBridgeMessage(
        this.channel,
        { kind: BRIDGE_MESSAGE_KINDS.RESULT, id, payload: reply.payload },
        reply.transfer,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      postBridgeMessage(this.channel, { kind: BRIDGE_MESSAGE_KINDS.FAILURE, id, payload: { message } });
    }
  }
}
