/** FMG's start-up and generation overlay, faded in and out by `showLoading` and `hideLoading`. */
const FMG_LOADING_OVERLAY_ID = 'loading';
const FADED_OUT_OPACITY = '0';
const HIDDEN_DISPLAY = 'none';
const DEFAULT_DISPLAY = '';

type OverlayStyle = Pick<CSSStyleDeclaration, 'opacity' | 'display'>;

/** Out of rendering once faded out, back in as soon as a fade-in starts. */
export function syncLoadingOverlayDisplay(style: OverlayStyle) {
  const display = style.opacity === FADED_OUT_OPACITY ? HIDDEN_DISPLAY : DEFAULT_DISPLAY;
  if (style.display !== display) style.display = display;
}

/**
 * FMG fades its overlay to opacity 0 but leaves it displayed, so the overlay's endless compass and dot animations keep
 * the frame repainting and re-layering every frame while the map is in use.
 */
export function hideFadedLoadingOverlay(frameDocument: Document) {
  const overlay = frameDocument.getElementById(FMG_LOADING_OVERLAY_ID);
  if (!overlay) return;

  new MutationObserver(() => syncLoadingOverlayDisplay(overlay.style)).observe(overlay, {
    attributes: true,
    attributeFilter: ['style'],
  });
  syncLoadingOverlayDisplay(overlay.style);
}
