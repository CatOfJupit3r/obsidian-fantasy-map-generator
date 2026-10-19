import { afterAll, describe, expect, it, vi } from 'vitest';

import { MAP_ENTITY_KINDS } from '../../src/entities/map-entity.constants';
import type { iClickedElement } from '../../src/fmg-bridge/fmg-entity-click';

// The module reads FMG's page globals through `window` when it loads.
vi.stubGlobal('window', {});
const { isOnFmgMap, readPointEntityRef } = await import('../../src/fmg-bridge/fmg-entity-click');

afterAll(() => {
  vi.unstubAllGlobals();
});

interface iFakeElementSpec {
  id?: string;
  attributes?: Record<string, string>;
}

/** An element chain, innermost first, the way a click target sits in FMG's map. */
function buildChain(...specs: iFakeElementSpec[]): iClickedElement {
  return specs.reduceRight<iClickedElement | null>(
    (parentElement, spec) => ({
      id: spec.id ?? '',
      getAttribute: (name) => spec.attributes?.[name] ?? null,
      parentElement,
    }),
    null,
  ) ?? { id: '', getAttribute: () => null, parentElement: null };
}

describe('readPointEntityRef', () => {
  it('reads a burg icon by its data-id inside #burgIcons', () => {
    const icon = buildChain({ attributes: { 'data-id': '12' } }, { id: 'towns' }, { id: 'burgIcons' }, { id: 'map' });

    expect(readPointEntityRef(icon)).toEqual({ kind: MAP_ENTITY_KINDS.BURG, id: 12 });
  });

  it('reads a burg label and a marker by their FMG ids', () => {
    const label = buildChain({ attributes: { 'data-label-type': 'burg', 'data-id': '4' } }, { id: 'labels' });
    const marker = buildChain({ id: '' }, { id: 'marker7' }, { id: 'markers' });

    expect(readPointEntityRef(label)).toEqual({ kind: MAP_ENTITY_KINDS.BURG, id: 4 });
    expect(readPointEntityRef(marker)).toEqual({ kind: MAP_ENTITY_KINDS.MARKER, id: 7 });
  });

  it('reads nothing from a state label or the map background, so the areas under the cursor decide', () => {
    const stateLabel = buildChain({ id: 'stateLabel3', attributes: { 'data-label-type': 'state', 'data-id': '3' } });

    expect(readPointEntityRef(stateLabel)).toBeNull();
    expect(readPointEntityRef(buildChain({ id: 'landmass' }, { id: 'map' }))).toBeNull();
  });
});

describe('isOnFmgMap', () => {
  it('tells clicks on the map from clicks on dialogs', () => {
    expect(isOnFmgMap(buildChain({ id: 'statesBody' }, { id: 'viewbox' }, { id: 'map' }))).toBe(true);
    expect(isOnFmgMap(buildChain({ id: 'burgEditor' }, { id: 'dialogs' }))).toBe(false);
  });
});
