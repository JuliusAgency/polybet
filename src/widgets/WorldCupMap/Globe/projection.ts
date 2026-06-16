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

/**
 * Project a lat/lng point on a globe rotated by `phi` (longitude, radians) and
 * tilted by `theta` (viewer latitude, radians) onto a square of side `size`.
 * Mirrors cobe's phi/theta semantics so HTML flag markers track the rendered
 * canvas exactly (both read the same phi/theta each frame).
 *
 * At phi=0, theta=0 a point at (0,0) sits dead-centre facing the viewer; east
 * longitudes fall to the right. Increasing phi spins the globe eastward.
 */
export function projectMarker(
  lat: number,
  lng: number,
  phi: number,
  theta: number,
  size: number,
  radiusScale = 1
): ProjectedMarker {
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;

  const cosLat = Math.cos(latRad);
  const x0 = cosLat * Math.sin(lngRad - phi);
  const y0 = Math.sin(latRad);
  const z0 = cosLat * Math.cos(lngRad - phi);

  // Tilt around the X axis. Negative theta leans the north pole toward the
  // viewer (matches cobe's default downward-looking tilt).
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const y1 = y0 * cosT - z0 * sinT;
  const z1 = y0 * sinT + z0 * cosT;

  const r = (size / 2) * radiusScale;
  const c = size / 2;

  return {
    x: c + x0 * r,
    y: c - y1 * r,
    visible: z1 > 0,
    opacity: Math.max(0, Math.min(1, z1 * 6)),
  };
}
