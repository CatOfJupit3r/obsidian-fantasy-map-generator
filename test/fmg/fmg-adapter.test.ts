import { describe, expect, it } from 'vitest';

import { BridgeClient } from '../../src/bridge/bridge-client';
import { BridgeHost } from '../../src/bridge/bridge-host';
import { FmgAdapter } from '../../src/fmg/fmg-adapter';
import { createFakeWindowPair } from '../utils/fake-window-pair';

/** FMG's `.map` lines: the header is the first and the SVG the sixth. */
function buildMapText({ header = 'header|saved at 10:00', svg = '<svg view="a"/>', settings = 'settings' } = {}) {
  return [header, 'info', 'cells', 'grid', 'biomes', svg, settings].join('\r\n');
}

/** An adapter on a frame that serialises whatever `current.text` holds. */
function setUpAdapter(current: { text: string }) {
  const pair = createFakeWindowPair('app://obsidian.md', 'app://fmg-resource');
  new BridgeHost(pair.frameChannel, async () => ({ payload: { mapText: current.text } }));
  return new FmgAdapter(new BridgeClient(pair.pluginChannel));
}

describe('FmgAdapter.serializeMap', () => {
  it('keeps the whole text to save but compares without the header and the SVG', async () => {
    const current = { text: buildMapText() };
    const adapter = setUpAdapter(current);
    const before = await adapter.serializeMap();

    current.text = buildMapText({ header: 'header|saved at 10:05', svg: '<svg view="zoomed"/>' });
    const afterViewChange = await adapter.serializeMap();

    expect(afterViewChange.text).not.toBe(before.text);
    expect(afterViewChange.content).toBe(before.content);
  });

  it('sees an edit to the map data as a change', async () => {
    const current = { text: buildMapText() };
    const adapter = setUpAdapter(current);
    const before = await adapter.serializeMap();

    current.text = buildMapText({ settings: 'settings, renamed state' });

    expect((await adapter.serializeMap()).content).not.toBe(before.content);
  });
});
