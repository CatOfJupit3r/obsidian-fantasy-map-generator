import type { iBridgeChannel, iBridgeMessageEvent, iBridgePeer } from '../../src/bridge/bridge-channel';

type Listener = (event: iBridgeMessageEvent) => void;

/** A window's message listeners; `deliver` dispatches an event as the browser would. */
class FakeWindow {
  private readonly listeners = new Set<Listener>();

  public constructor(public readonly origin: string) {}

  public listen(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public deliver(event: iBridgeMessageEvent) {
    for (const listener of this.listeners) listener(event);
  }

  public get listenerCount(): number {
    return this.listeners.size;
  }
}

/** Posting to it delivers to `target` asynchronously, from `sender`, if `targetOrigin` matches `target`. */
function createPeerView(target: FakeWindow, sender: FakeWindow, readSenderView: () => iBridgePeer): iBridgePeer {
  return {
    postMessage: (message, targetOrigin) => {
      if (targetOrigin !== target.origin) return;
      const data: unknown = structuredClone(message);
      queueMicrotask(() => target.deliver({ data, origin: sender.origin, source: readSenderView() }));
    },
  };
}

/** The plugin's window and the frame's window, each with a channel to the other. */
export function createFakeWindowPair(pluginOrigin: string, frameOrigin: string) {
  const pluginWindow = new FakeWindow(pluginOrigin);
  const frameWindow = new FakeWindow(frameOrigin);

  const frameSeenByPlugin: iBridgePeer = createPeerView(frameWindow, pluginWindow, () => pluginSeenByFrame);
  const pluginSeenByFrame: iBridgePeer = createPeerView(pluginWindow, frameWindow, () => frameSeenByPlugin);

  const pluginChannel: iBridgeChannel = {
    peer: frameSeenByPlugin,
    peerOrigin: frameOrigin,
    listen: (listener) => pluginWindow.listen(listener),
  };
  const frameChannel: iBridgeChannel = {
    peer: pluginSeenByFrame,
    peerOrigin: pluginOrigin,
    listen: (listener) => frameWindow.listen(listener),
  };

  return { pluginWindow, frameWindow, frameSeenByPlugin, pluginSeenByFrame, pluginChannel, frameChannel };
}

/** Lets queued deliveries, and the handlers they start, run. */
export async function flushMessages() {
  for (let round = 0; round < 10; round += 1) await Promise.resolve();
}
