import type { z } from 'zod';

import { postBridgeMessage, readBridgeEnvelope } from './bridge-channel';
import type { iBridgeChannel } from './bridge-channel';
import { BridgeFailureError } from './bridge-failure.error';
import { BRIDGE_MESSAGE_KINDS, bridgeFailureSchema } from './bridge-protocol';
import type { BridgeEnvelope, BridgeRequestKind } from './bridge-protocol';
import { BridgeTimeoutError } from './bridge-timeout.error';

interface iPendingRequest {
  resolve: (envelope: BridgeEnvelope) => void;
  reject: (error: Error) => void;
}

/**
 * Resolves with what `start` resolves with, or rejects with a timeout. `cancel` runs when the time runs out or `start`
 * fails, so nothing waits for an answer that will not come.
 */
async function withTimeout<T>(
  what: string,
  timeoutMs: number,
  start: (resolve: (value: T) => unknown, reject: (error: Error) => unknown) => unknown,
  cancel: () => unknown,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => clearTimeout(timer);
    timer = setTimeout(() => {
      cancel();
      reject(new BridgeTimeoutError(what, timeoutMs));
    }, timeoutMs);
    const fail = (error: Error) => {
      finish();
      cancel();
      reject(error);
    };
    try {
      start((value) => {
        finish();
        resolve(value);
      }, fail);
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/** The plugin's end of the bridge: sends requests to the frame and matches each answer to its request by id. */
export class BridgeClient {
  private readonly pending = new Map<string, iPendingRequest>();

  private readonly readyListeners = new Set<() => unknown>();

  private readonly saveRequestListeners = new Set<() => unknown>();

  private hasPeerAnnouncedReady = false;

  private readonly stopListening: () => unknown;

  public constructor(
    private readonly channel: iBridgeChannel,
    private readonly createRequestId: () => string = () => crypto.randomUUID(),
  ) {
    this.stopListening = channel.listen((event) => {
      const envelope = readBridgeEnvelope(channel, event);
      if (envelope) this.receive(envelope);
    });
  }

  public async waitUntilReady(timeoutMs: number) {
    if (this.hasPeerAnnouncedReady) return;

    const listener = { onReady: () => {} };
    await withTimeout<boolean>(
      'Waiting for the map editor',
      timeoutMs,
      (resolve) => {
        listener.onReady = () => resolve(true);
        this.readyListeners.add(listener.onReady);
      },
      () => this.readyListeners.delete(listener.onReady),
    );
  }

  public async request<TResponse>(
    kind: BridgeRequestKind,
    payload: unknown,
    responseSchema: z.ZodType<TResponse>,
    timeoutMs: number,
  ): Promise<TResponse> {
    const id = this.createRequestId();
    const envelope = await withTimeout<BridgeEnvelope>(
      `The ${kind} request`,
      timeoutMs,
      (resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        postBridgeMessage(this.channel, { kind, id, payload });
      },
      () => this.pending.delete(id),
    );

    const parsed = responseSchema.safeParse(envelope.payload);
    if (!parsed.success) throw new BridgeFailureError(`The ${kind} answer is malformed.`);
    return parsed.data;
  }

  /** Runs `listener` whenever the frame asks for a save, for example on Ctrl/Cmd+S inside it. */
  public onSaveRequested(listener: () => unknown): () => unknown {
    this.saveRequestListeners.add(listener);
    return () => this.saveRequestListeners.delete(listener);
  }

  /** Stops listening and fails every request still waiting for an answer. */
  public dispose() {
    this.stopListening();
    this.readyListeners.clear();
    this.saveRequestListeners.clear();
    for (const request of this.pending.values()) request.reject(new BridgeFailureError('The map editor was closed.'));
    this.pending.clear();
  }

  private receive(envelope: BridgeEnvelope) {
    switch (envelope.kind) {
      case BRIDGE_MESSAGE_KINDS.READY:
        this.markReady();
        break;
      case BRIDGE_MESSAGE_KINDS.SAVE_REQUESTED:
        for (const listener of this.saveRequestListeners) listener();
        break;
      case BRIDGE_MESSAGE_KINDS.RESULT:
        this.takePending(envelope.id)?.resolve(envelope);
        break;
      case BRIDGE_MESSAGE_KINDS.FAILURE:
        this.takePending(envelope.id)?.reject(new BridgeFailureError(this.readFailureMessage(envelope)));
        break;
      default:
    }
  }

  private markReady() {
    this.hasPeerAnnouncedReady = true;
    for (const listener of this.readyListeners) listener();
    this.readyListeners.clear();
  }

  private readFailureMessage(envelope: BridgeEnvelope): string {
    const failure = bridgeFailureSchema.safeParse(envelope.payload);
    return failure.success ? failure.data.message : 'The map editor failed.';
  }

  private takePending(id: string): iPendingRequest | undefined {
    const request = this.pending.get(id);
    this.pending.delete(id);
    return request;
  }
}
