import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeClient } from '../../src/bridge/bridge-client';
import { BridgeFailureError } from '../../src/bridge/bridge-failure.error';
import { BridgeHost } from '../../src/bridge/bridge-host';
import type { iBridgeReply } from '../../src/bridge/bridge-host';
import {
  BRIDGE_CHANNEL,
  BRIDGE_EVENT_KINDS,
  BRIDGE_MESSAGE_KINDS,
  BRIDGE_REQUEST_KINDS,
  bridgeEnvelopeSchema,
  savedMapSchema,
} from '../../src/bridge/bridge-protocol';
import type { BridgeEnvelope } from '../../src/bridge/bridge-protocol';
import { BridgeTimeoutError } from '../../src/bridge/bridge-timeout.error';
import { createFakeWindowPair, flushMessages } from '../utils/fake-window-pair';

const PLUGIN_ORIGIN = 'app://obsidian.md';
const FRAME_ORIGIN = 'app://fmg-resource';
const TIMEOUT_MS = 1_000;

function createIds() {
  let next = 0;
  return () => {
    next += 1;
    return `request-${next}`;
  };
}

/** The frame side without a host: collects the requests it receives so a test answers them by hand. */
function setUpManualFrame() {
  const pair = createFakeWindowPair(PLUGIN_ORIGIN, FRAME_ORIGIN);
  const received: BridgeEnvelope[] = [];
  pair.frameWindow.listen((event) => received.push(bridgeEnvelopeSchema.parse(event.data)));

  const client = new BridgeClient(pair.pluginChannel, createIds());
  const answer = (id: string, payload: unknown, origin = FRAME_ORIGIN) =>
    pair.pluginWindow.deliver({
      data: { channel: BRIDGE_CHANNEL, kind: BRIDGE_MESSAGE_KINDS.RESULT, id, payload },
      origin,
      source: pair.frameSeenByPlugin,
    });

  return { ...pair, received, client, answer };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('BridgeClient', () => {
  it('matches answers to their requests by id, whatever order they arrive in', async () => {
    const { client, received, answer } = setUpManualFrame();

    const first = client.request(BRIDGE_REQUEST_KINDS.SAVE_MAP, {}, savedMapSchema, TIMEOUT_MS);
    const second = client.request(BRIDGE_REQUEST_KINDS.SAVE_MAP, {}, savedMapSchema, TIMEOUT_MS);
    await flushMessages();

    expect(received.map((envelope) => envelope.id)).toEqual(['request-1', 'request-2']);
    answer('request-2', { mapText: 'second map' });
    answer('request-1', { mapText: 'first map' });

    await expect(first).resolves.toEqual({ mapText: 'first map' });
    await expect(second).resolves.toEqual({ mapText: 'second map' });
  });

  it('rejects a request nobody answers once its timeout passes', async () => {
    vi.useFakeTimers();
    const { client } = setUpManualFrame();

    const request = client.request(BRIDGE_REQUEST_KINDS.SAVE_MAP, {}, savedMapSchema, TIMEOUT_MS);
    const assertion = expect(request).rejects.toBeInstanceOf(BridgeTimeoutError);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

    await assertion;
  });

  it('ignores an answer from another origin and keeps waiting for the frame', async () => {
    const { client, answer } = setUpManualFrame();

    const request = client.request(BRIDGE_REQUEST_KINDS.SAVE_MAP, {}, savedMapSchema, TIMEOUT_MS);
    await flushMessages();
    answer('request-1', { mapText: 'forged map' }, 'https://evil.example');
    answer('request-1', { mapText: 'real map' });

    await expect(request).resolves.toEqual({ mapText: 'real map' });
  });

  it('ignores an answer from another window, even from the right origin', async () => {
    const { client, pluginWindow } = setUpManualFrame();

    const request = client.request(BRIDGE_REQUEST_KINDS.SAVE_MAP, {}, savedMapSchema, TIMEOUT_MS);
    await flushMessages();
    pluginWindow.deliver({
      data: { channel: BRIDGE_CHANNEL, kind: BRIDGE_MESSAGE_KINDS.RESULT, id: 'request-1', payload: { mapText: 'x' } },
      origin: FRAME_ORIGIN,
      source: { postMessage: vi.fn() },
    });
    await flushMessages();

    let isSettled = false;
    void request
      .then(
        () => (isSettled = true),
        () => (isSettled = true),
      )
      .catch(() => undefined);
    await flushMessages();
    expect(isSettled).toBe(false);
  });

  it('ignores messages that are not bridge answers to a pending request', async () => {
    const { client, answer, pluginWindow, frameSeenByPlugin } = setUpManualFrame();

    const request = client.request(BRIDGE_REQUEST_KINDS.SAVE_MAP, {}, savedMapSchema, TIMEOUT_MS);
    await flushMessages();
    const deliverFromFrame = (data: unknown) =>
      pluginWindow.deliver({ data, origin: FRAME_ORIGIN, source: frameSeenByPlugin });

    deliverFromFrame('a plain string');
    deliverFromFrame({ channel: 'azgaar-fmg-bridge/v0', kind: BRIDGE_MESSAGE_KINDS.RESULT, id: 'request-1' });
    deliverFromFrame({ channel: BRIDGE_CHANNEL, kind: 'TELEPORT', id: 'request-1', payload: {} });
    answer('request-99', { mapText: 'someone else' });
    answer('request-1', { mapText: 'the answer' });

    await expect(request).resolves.toEqual({ mapText: 'the answer' });
  });

  it('waits for the frame to announce READY, and gives up after the timeout', async () => {
    vi.useFakeTimers();
    const { client, pluginWindow, frameSeenByPlugin } = setUpManualFrame();

    const timedOut = expect(client.waitUntilReady(TIMEOUT_MS)).rejects.toBeInstanceOf(BridgeTimeoutError);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    await timedOut;

    const ready = client.waitUntilReady(TIMEOUT_MS);
    pluginWindow.deliver({
      data: { channel: BRIDGE_CHANNEL, kind: BRIDGE_MESSAGE_KINDS.READY, id: 'ready', payload: {} },
      origin: FRAME_ORIGIN,
      source: frameSeenByPlugin,
    });
    await expect(ready).resolves.toBeUndefined();
  });

  it('fails pending requests and stops listening when disposed', async () => {
    const { client, pluginWindow } = setUpManualFrame();

    const request = client.request(BRIDGE_REQUEST_KINDS.SAVE_MAP, {}, savedMapSchema, TIMEOUT_MS);
    client.dispose();

    await expect(request).rejects.toBeInstanceOf(BridgeFailureError);
    expect(pluginWindow.listenerCount).toBe(0);
  });
});

describe('BridgeHost with BridgeClient', () => {
  function setUpHost(handleSave: () => Promise<iBridgeReply>) {
    const pair = createFakeWindowPair(PLUGIN_ORIGIN, FRAME_ORIGIN);
    const host = new BridgeHost(pair.frameChannel, async (kind) => {
      if (kind !== BRIDGE_REQUEST_KINDS.SAVE_MAP) throw new Error(`unexpected ${kind}`);
      return handleSave();
    });
    return { ...pair, host, client: new BridgeClient(pair.pluginChannel, createIds()) };
  }

  it('answers a request with what its handler returns', async () => {
    const { client } = setUpHost(async () => ({ payload: { mapText: 'saved by the frame' } }));

    await expect(client.request(BRIDGE_REQUEST_KINDS.SAVE_MAP, {}, savedMapSchema, TIMEOUT_MS)).resolves.toEqual({
      mapText: 'saved by the frame',
    });
  });

  it('turns a failing handler into a rejected request with its message', async () => {
    const { client } = setUpHost(async () => {
      throw new Error('Finish the edit first.');
    });

    await expect(client.request(BRIDGE_REQUEST_KINDS.SAVE_MAP, {}, savedMapSchema, TIMEOUT_MS)).rejects.toThrow(
      'Finish the edit first.',
    );
  });

  it('does not run requests that come from another origin', async () => {
    const save = vi.fn(async () => ({ payload: { mapText: 'leaked map' } }));
    const { frameWindow, pluginSeenByFrame } = setUpHost(save);

    frameWindow.deliver({
      data: { channel: BRIDGE_CHANNEL, kind: BRIDGE_MESSAGE_KINDS.SAVE_MAP, id: 'forged', payload: {} },
      origin: 'https://evil.example',
      source: pluginSeenByFrame,
    });
    await flushMessages();

    expect(save).not.toHaveBeenCalled();
  });

  it('does not run requests that come from another window', async () => {
    const save = vi.fn(async () => ({ payload: { mapText: 'leaked map' } }));
    const { frameWindow } = setUpHost(save);

    frameWindow.deliver({
      data: { channel: BRIDGE_CHANNEL, kind: BRIDGE_MESSAGE_KINDS.SAVE_MAP, id: 'forged', payload: {} },
      origin: PLUGIN_ORIGIN,
      source: { postMessage: vi.fn() },
    });
    await flushMessages();

    expect(save).not.toHaveBeenCalled();
  });

  it('tells the plugin when the frame asks for a save', async () => {
    const { host, client } = setUpHost(async () => ({ payload: {} }));
    const onSaveRequested = vi.fn();
    client.onSaveRequested(onSaveRequested);

    host.notify(BRIDGE_EVENT_KINDS.SAVE_REQUESTED);
    await flushMessages();

    expect(onSaveRequested).toHaveBeenCalledOnce();
  });

  it('announces READY to the plugin', async () => {
    const { host, client } = setUpHost(async () => ({ payload: {} }));

    const ready = client.waitUntilReady(TIMEOUT_MS);
    host.notify(BRIDGE_EVENT_KINDS.READY);

    await expect(ready).resolves.toBeUndefined();
  });
});
