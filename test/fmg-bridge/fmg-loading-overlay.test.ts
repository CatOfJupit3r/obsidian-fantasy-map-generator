import { describe, expect, it } from 'vitest';

import { syncLoadingOverlayDisplay } from '../../src/fmg-bridge/fmg-loading-overlay';

describe('syncLoadingOverlayDisplay', () => {
  it('takes the overlay out of rendering once it has faded out', () => {
    const style = { opacity: '0', display: '' };

    syncLoadingOverlayDisplay(style);

    expect(style.display).toBe('none');
  });

  it('brings the overlay back as soon as a fade-in starts, and leaves a shown overlay alone', () => {
    const fadingIn = { opacity: '0.04', display: 'none' };
    const untouched = { opacity: '', display: '' };

    syncLoadingOverlayDisplay(fadingIn);
    syncLoadingOverlayDisplay(untouched);

    expect(fadingIn.display).toBe('');
    expect(untouched.display).toBe('');
  });
});
