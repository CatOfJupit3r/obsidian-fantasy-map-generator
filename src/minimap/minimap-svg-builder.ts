import type { iMapEntityRef, iMapEntitySummary } from '../entities/map-entity.types';
import type { FmgMapModel } from '../map-data/fmg-map-model';
import type { MapPoint } from '../map-data/map-geometry.types';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
/** The highlight ring and the undimmed circle around a point entity, as shares of its crop radius. */
const POINT_RING_SHARE = 0.12;
const POINT_HOLE_SHARE = 0.45;
const NEIGHBOUR_POINT_SHARE = 0.08;
const COORDINATE_DIGITS = 1;

export interface iMinimapScene {
  model: FmgMapModel;
  ref: iMapEntityRef;
  /** The map's SVG or PNG export, drawn under everything; null draws the cells' outline on an empty map. */
  backdropUrl: string | null;
  /** The neighbours that have a note: they open it on click. */
  linkedNeighbours: iMapEntitySummary[];
  onNeighbourClick: (neighbour: iMapEntitySummary, event: MouseEvent) => unknown;
  /** Unique within the page, since every block on it has its own mask. */
  maskId: string;
}

/** Draws the mini-map: the map export, a dimming layer with a hole over the entity, its outline, its neighbours. */
export class MinimapSvgBuilder {
  public build(scene: iMinimapScene): SVGSVGElement {
    const { width, height } = scene.model.data.info;
    const svg = this.createElement('svg', {
      class: 'fmg-minimap-svg',
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
    });

    if (scene.backdropUrl) {
      svg.append(
        this.createElement('image', { href: scene.backdropUrl, x: 0, y: 0, width, height, preserveAspectRatio: 'none' }),
      );
    }

    const point = scene.model.geometry.readPoint(scene.ref);
    svg.append(this.buildDimLayer(scene, point));
    svg.append(point ? this.buildPointRing(scene, point) : this.buildOutline(scene));
    for (const neighbour of scene.linkedNeighbours) svg.append(this.buildNeighbour(scene, neighbour));
    return svg;
  }

  /** Everything is dimmed except the entity: its cells, or a circle around a point. */
  private buildDimLayer(scene: iMinimapScene, point: MapPoint | null): SVGGElement {
    const { width, height } = scene.model.data.info;
    const outside = { x: -width, y: -height, width: width * 3, height: height * 3 };
    const mask = this.createElement('mask', { id: scene.maskId, maskUnits: 'userSpaceOnUse', ...outside });
    mask.append(this.createElement('rect', { ...outside, fill: 'white' }));
    if (point) {
      const radius = scene.model.geometry.readPointRadius() * POINT_HOLE_SHARE;
      mask.append(this.createElement('circle', { cx: point[0], cy: point[1], r: radius, fill: 'black' }));
    } else {
      // The stroke closes the hairline seams anti-aliasing leaves between neighbouring cells.
      mask.append(
        this.createElement('path', {
          d: this.buildCellsPath(scene.model, scene.model.geometry.readCells(scene.ref)),
          fill: 'black',
          stroke: 'black',
          'stroke-width': 1,
        }),
      );
    }

    const group = this.createElement('g', {});
    group.append(
      mask,
      this.createElement('rect', { ...outside, class: 'fmg-minimap-dim', mask: `url(#${scene.maskId})` }),
    );
    return group;
  }

  private buildOutline(scene: iMinimapScene): SVGPathElement {
    const segments = scene.model.geometry.readOutline(scene.model.geometry.readCells(scene.ref));
    const d = segments.map(([start, end]) => `M${this.formatPoint(start)}L${this.formatPoint(end)}`).join('');
    return this.createElement('path', { class: 'fmg-minimap-outline', d });
  }

  private buildPointRing(scene: iMinimapScene, point: MapPoint): SVGCircleElement {
    const radius = scene.model.geometry.readPointRadius() * POINT_RING_SHARE;
    return this.createElement('circle', { class: 'fmg-minimap-outline', cx: point[0], cy: point[1], r: radius });
  }

  private buildNeighbour(scene: iMinimapScene, neighbour: iMapEntitySummary): SVGElement {
    const { geometry } = scene.model;
    const point = geometry.readPoint(neighbour);
    const shape = point
      ? this.createElement('circle', {
          cx: point[0],
          cy: point[1],
          r: geometry.readPointRadius() * NEIGHBOUR_POINT_SHARE,
        })
      : this.createElement('path', { d: this.buildCellsPath(scene.model, geometry.readCells(neighbour)) });
    shape.classList.add('fmg-minimap-neighbour');

    const title = this.createElement('title', {});
    title.textContent = `${neighbour.name}: open its note`;
    shape.append(title);
    shape.addEventListener('click', (event) => scene.onNeighbourClick(neighbour, event));
    return shape;
  }

  private buildCellsPath(model: FmgMapModel, cells: number[]): string {
    return cells
      .map((cell) => {
        const polygon = model.geometry.readCellPolygon(cell);
        return polygon.length > 2 ? `M${polygon.map((point) => this.formatPoint(point)).join('L')}Z` : '';
      })
      .join('');
  }

  private formatPoint([x, y]: MapPoint): string {
    return `${x.toFixed(COORDINATE_DIGITS)} ${y.toFixed(COORDINATE_DIGITS)}`;
  }

  private createElement<TTag extends keyof SVGElementTagNameMap>(
    tag: TTag,
    attributes: Record<string, string | number>,
  ): SVGElementTagNameMap[TTag] {
    const element = document.createElementNS(SVG_NAMESPACE, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
    return element;
  }
}
