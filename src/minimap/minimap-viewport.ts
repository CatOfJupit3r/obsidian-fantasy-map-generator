import type { iMapBox, MapPoint } from '../map-data/map-geometry.types';

/** Wheel steps scale the view by `exp(-deltaY * ZOOM_SPEED)`. */
const ZOOM_SPEED = 0.0015;
/** A pointer that moved less than this many pixels between press and release clicked rather than dragged. */
const DRAG_THRESHOLD_PX = 4;

export interface iZoomLimits {
  minWidth: number;
  maxWidth: number;
}

/** The box scaled by `factor` around `anchor`, which stays where it is on screen, within the width limits. */
export function zoomBox(box: iMapBox, anchor: MapPoint, factor: number, limits: iZoomLimits): iMapBox {
  const width = box.x1 - box.x0;
  const clampedWidth = Math.min(limits.maxWidth, Math.max(limits.minWidth, width * factor));
  const scale = clampedWidth / width;
  const [x, y] = anchor;
  return {
    x0: x - (x - box.x0) * scale,
    y0: y - (y - box.y0) * scale,
    x1: x + (box.x1 - x) * scale,
    y1: y + (box.y1 - y) * scale,
  };
}

export function panBox(box: iMapBox, dx: number, dy: number): iMapBox {
  return { x0: box.x0 - dx, y0: box.y0 - dy, x1: box.x1 - dx, y1: box.y1 - dy };
}

/**
 * The box widened or heightened around its centre to the screen's `aspect` (width over height), so the screen shows
 * exactly it. With `bounds`, it is then shrunk to fit inside them and moved back inside, so nothing past them shows.
 */
export function fitBox(box: iMapBox, aspect: number, bounds: iMapBox | null): iMapBox {
  let width = box.x1 - box.x0;
  let height = box.y1 - box.y0;
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;
  let centerX = (box.x0 + box.x1) / 2;
  let centerY = (box.y0 + box.y1) / 2;

  if (bounds) {
    const scale = Math.min(1, (bounds.x1 - bounds.x0) / width, (bounds.y1 - bounds.y0) / height);
    width *= scale;
    height *= scale;
    centerX = Math.min(bounds.x1 - width / 2, Math.max(bounds.x0 + width / 2, centerX));
    centerY = Math.min(bounds.y1 - height / 2, Math.max(bounds.y0 + height / 2, centerY));
  }
  return { x0: centerX - width / 2, y0: centerY - height / 2, x1: centerX + width / 2, y1: centerY + height / 2 };
}

interface iDrag {
  pointerId: number;
  startClient: MapPoint;
  startBox: iMapBox;
  /** The screen-to-map transform when the drag started; the view moves under the pointer meanwhile. */
  toMap: DOMMatrix;
}

/**
 * Scroll to zoom, drag to pan and double-click to reset an SVG's view box. The view always fills the SVG's shape, and
 * stays inside its bounds while it has any.
 */
export class MinimapViewport {
  private box: iMapBox;

  private bounds: iMapBox | null;

  private drag: iDrag | null = null;

  private hasDragged = false;

  public constructor(
    private readonly svg: SVGSVGElement,
    private readonly initialBox: iMapBox,
    private readonly limits: iZoomLimits,
    bounds: iMapBox | null,
  ) {
    this.bounds = bounds;
    this.box = initialBox;
    this.show(initialBox);
    svg.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
    svg.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    svg.addEventListener('pointermove', (event) => this.onPointerMove(event));
    svg.addEventListener('pointerup', (event) => this.onPointerUp(event));
    svg.addEventListener('pointercancel', (event) => this.onPointerUp(event));
    svg.addEventListener('dblclick', () => this.show(this.initialBox));
    // The SVG has no size until the note lays it out, and changes size with the pane.
    new ResizeObserver(() => this.show(this.box)).observe(svg);
  }

  /** Whether the last press moved the view, so its click is not a click on what lies under it. */
  public wasDragged(): boolean {
    return this.hasDragged;
  }

  /** Keeps the view inside the bounds from now on, or lets it leave them for null. */
  public setBounds(bounds: iMapBox | null) {
    this.bounds = bounds;
    this.show(this.box);
  }

  private onWheel(event: WheelEvent) {
    const anchor = this.toMapPoint(event.clientX, event.clientY, this.svg.getScreenCTM()?.inverse());
    if (!anchor) return;
    event.preventDefault();
    this.show(zoomBox(this.box, anchor, Math.exp(event.deltaY * ZOOM_SPEED), this.limits));
  }

  private onPointerDown(event: PointerEvent) {
    const toMap = this.svg.getScreenCTM()?.inverse();
    if (!toMap || event.button !== 0) return;
    this.drag = { pointerId: event.pointerId, startClient: [event.clientX, event.clientY], startBox: this.box, toMap };
    this.hasDragged = false;
  }

  private onPointerMove(event: PointerEvent) {
    const { drag } = this;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const movedPx = Math.hypot(event.clientX - drag.startClient[0], event.clientY - drag.startClient[1]);
    if (!this.hasDragged && movedPx < DRAG_THRESHOLD_PX) return;
    if (!this.hasDragged) {
      this.hasDragged = true;
      this.svg.setPointerCapture(event.pointerId);
    }

    const start = this.toMapPoint(drag.startClient[0], drag.startClient[1], drag.toMap);
    const current = this.toMapPoint(event.clientX, event.clientY, drag.toMap);
    if (!start || !current) return;
    this.show(panBox(drag.startBox, current[0] - start[0], current[1] - start[1]));
  }

  private onPointerUp(event: PointerEvent) {
    if (this.drag?.pointerId !== event.pointerId) return;
    this.drag = null;
    if (this.svg.hasPointerCapture(event.pointerId)) this.svg.releasePointerCapture(event.pointerId);
  }

  private toMapPoint(clientX: number, clientY: number, toMap: DOMMatrix | undefined): MapPoint | null {
    if (!toMap) return null;
    const point = new DOMPoint(clientX, clientY).matrixTransform(toMap);
    return [point.x, point.y];
  }

  /** Fits the box to the SVG's shape and the bounds, and shows it; before layout, shows it as it is. */
  private show(box: iMapBox) {
    const { clientWidth, clientHeight } = this.svg;
    this.box = clientWidth > 0 && clientHeight > 0 ? fitBox(box, clientWidth / clientHeight, this.bounds) : box;
    const { x0, y0, x1, y1 } = this.box;
    this.svg.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
  }
}
