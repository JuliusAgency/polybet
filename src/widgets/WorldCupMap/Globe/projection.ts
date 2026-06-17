export interface ProjectedMarker {
  /** Screen x within the square container, in CSS px. */
  x: number;
  /** Screen y within the square container, in CSS px. */
  y: number;
  /** True when the point is on the near (front) hemisphere. */
  visible: boolean;
  /** 0..1 — fades toward 0 near the limb so markers don't pop at the edge. */
  opacity: number;
}

const DEG = Math.PI / 180;

/**
 * Project a lat/lng point to screen so the HTML flag markers land exactly on
 * cobe's dotted continents at any rotation. Both the base vector and the screen
 * projection are taken from cobe's own shader/source, so flags == cobe markers
 * == continents:
 *
 *  - Base vector (cobe `x()`): e = (cos(lat)·cos(λ), sin(lat), −cos(lat)·sin(λ)),
 *    λ = lng·π/180.
 *  - cobe's fragment shader builds the view ray `l = (screenXY, +z)` and compares
 *    `l·L` (= Lᵀ·l) to each marker e, where L = J(theta,phi) = Rx(theta)·Ry(phi).
 *    A marker shows where Lᵀ·l = e, i.e. l = L·e — so the screen position is
 *    (L·e).xy and it is front-facing when (L·e).z > 0. (GL's y is up; CSS y is
 *    down, hence the y flip.)
 */
export function projectMarker(
  lat: number,
  lng: number,
  phi: number,
  theta: number,
  size: number,
  radiusScale = 1
): ProjectedMarker {
  const latRad = lat * DEG;
  const lngRad = lng * DEG;
  const cosLat = Math.cos(latRad);

  // cobe marker base vector (globe-local frame).
  const ex = cosLat * Math.cos(lngRad);
  const ey = Math.sin(latRad);
  const ez = -cosLat * Math.sin(lngRad);

  // screen = L·e, L = Rx(theta)·Ry(phi).
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  const sx = cosP * ex + sinP * ez; // (L·e).x
  const b = sinP * ex - cosP * ez; // helper: sinφ·ex − cosφ·ez
  const sy = cosT * ey + sinT * b; // (L·e).y
  const sz = sinT * ey - cosT * b; // (L·e).z

  const r = (size / 2) * radiusScale;
  const c = size / 2;

  return {
    x: c + sx * r,
    y: c - sy * r,
    visible: sz > 0,
    opacity: Math.max(0, Math.min(1, sz * 6)),
  };
}
