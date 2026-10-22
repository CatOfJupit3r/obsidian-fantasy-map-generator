import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { BRIDGE_CHANNEL, BRIDGE_MESSAGE_KINDS, BRIDGE_PARENT_ORIGIN_PARAM } from '../../src/bridge/bridge-protocol';
import { createFakeStorage } from '../utils/fake-storage';

const PLUGIN_ORIGIN = 'app://obsidian.md';

type Listener = (event: unknown) => void;

/** A page window: records the listeners added to it, and the messages it posts to its parent. */
function createFakePage(hash: string, hasParent: boolean) {
  const listeners = new Map<string, Listener[]>();
  const posted: { message: unknown; targetOrigin: string }[] = [];
  const parent = { postMessage: (message: unknown, targetOrigin: string) => posted.push({ message, targetOrigin }) };

  const storage = createFakeStorage();
  const page: Record<string, unknown> = {
    location: { hash },
    localStorage: storage,
    addEventListener: (type: string, listener: Listener) =>
      listeners.set(type, [...(listeners.get(type) ?? []), listener]),
    removeEventListener: vi.fn(),
  };
  page.parent = hasParent ? parent : page;

  const press = (init: Record<string, unknown>) => {
    const event = { preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), ...init };
    for (const listener of listeners.get('keydown') ?? []) listener(event);
    return event;
  };
  return { page, listeners, posted, press, storage };
}

const desktopBridgeSchema = z.object({
  isElectron: z.literal(true),
  saveMap: z.custom<() => unknown>((value) => typeof value === 'function'),
});

const parentHash =`#${BRIDGE_PARENT_ORIGIN_PARAM}=${encodeURIComponent(PLUGIN_ORIGIN)}`;

/** The module reads `window` when it loads, so it is imported once the fake page stands in for it. */
async function loadStartBridge(page: object) {
  vi.stubGlobal('window', page);
  vi.resetModules();
  return (await import('../../src/fmg-bridge/fmg-bridge-start')).startBridge;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('startBridge', () => {
  it('does nothing in a page that was not opened with the plugin origin', async () => {
    const { page, listeners } = createFakePage('', true);
    const startBridge = await loadStartBridge(page);

    expect(startBridge(page as unknown as Window)).toBeNull();
    expect(listeners.size).toBe(0);
    expect(page).not.toHaveProperty('electron');
  });

  it('does nothing in a page that is not inside a frame', async () => {
    const { page, listeners } = createFakePage(parentHash, false);
    const startBridge = await loadStartBridge(page);

    expect(startBridge(page as unknown as Window)).toBeNull();
    expect(listeners.size).toBe(0);
  });

  it('tells the plugin to save on Ctrl+S and Cmd+S, and keeps FMG from seeing the key', async () => {
    const { page, posted, press } = createFakePage(parentHash, true);
    const startBridge = await loadStartBridge(page);
    startBridge(page as unknown as Window);

    const ctrl = press({ ctrlKey: true, code: 'KeyS' });
    const cmd = press({ metaKey: true, code: 'KeyS' });

    expect(posted).toHaveLength(2);
    expect(posted[0]?.targetOrigin).toBe(PLUGIN_ORIGIN);
    expect(posted[0]?.message).toMatchObject({ channel: BRIDGE_CHANNEL, kind: BRIDGE_MESSAGE_KINDS.SAVE_REQUESTED });
    expect(ctrl.preventDefault).toHaveBeenCalled();
    expect(cmd.stopImmediatePropagation).toHaveBeenCalled();
  });

  it('gives FMG a saveMap hook, which its patched "Save to machine" calls, that tells the plugin to save', async () => {
    const { page, posted } = createFakePage(parentHash, true);
    const startBridge = await loadStartBridge(page);
    startBridge(page as unknown as Window);

    desktopBridgeSchema.parse(page.electron).saveMap();

    expect(posted.map(({ message }) => message)).toEqual([
      expect.objectContaining({ channel: BRIDGE_CHANNEL, kind: BRIDGE_MESSAGE_KINDS.SAVE_REQUESTED }),
    ]);
  });

  it('starts FMG with its autosave and save reminder off', async () => {
    const { page, storage } = createFakePage(parentHash, true);
    const startBridge = await loadStartBridge(page);
    startBridge(page as unknown as Window);

    const stored: unknown = JSON.parse(storage.getItem('fmg-options') ?? '');
    expect(stored).toEqual({ app: { autosave: { interval: 0, remind: false } } });
  });

  it('leaves other keys to FMG', async () => {
    const { page, posted, press } = createFakePage(parentHash, true);
    const startBridge = await loadStartBridge(page);
    startBridge(page as unknown as Window);

    const plainS = press({ code: 'KeyS' });
    const ctrlZ = press({ ctrlKey: true, code: 'KeyZ' });

    expect(posted).toHaveLength(0);
    expect(plainS.preventDefault).not.toHaveBeenCalled();
    expect(ctrlZ.preventDefault).not.toHaveBeenCalled();
  });
});
