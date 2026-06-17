import type { ThemeName } from '@/shared/theme';

/** cobe colour config, expressed as RGB triplets in 0..1 — one set per theme. */
export interface GlobeTheme {
  dark: number;
  diffuse: number;
  mapBrightness: number;
  mapBaseBrightness: number;
  baseColor: [number, number, number];
  markerColor: [number, number, number];
  glowColor: [number, number, number];
}

// Light theme: cobe's canonical light preset — a pale dotted sphere on the page
// surface (GitHub/Polymarket look). Dark theme: a deep indigo globe with a faint
// glow. mapBaseBrightness lifts the unlit hemisphere so the globe doesn't read
// as a solid dark disk on the light page.
export const GLOBE_THEME: Record<ThemeName, GlobeTheme> = {
  light: {
    dark: 0,
    diffuse: 0.4,
    mapBrightness: 1.15,
    mapBaseBrightness: 0.18,
    baseColor: [1, 1, 1],
    markerColor: [0.36, 0.42, 0.95],
    glowColor: [1, 1, 1],
  },
  dark: {
    dark: 1,
    diffuse: 1.2,
    mapBrightness: 6,
    mapBaseBrightness: 0,
    baseColor: [0.13, 0.15, 0.26],
    markerColor: [0.55, 0.65, 1],
    glowColor: [0.08, 0.09, 0.16],
  },
};

/** Idle longitude spin, radians/frame (~one slow turn). */
export const AUTO_SPIN_PER_FRAME = 0.0022;

/** Drag sensitivity: screen px → radians. */
export const DRAG_PHI_PER_PX = 0.006;
export const DRAG_THETA_PER_PX = 0.006;

/** Viewer tilt clamp (radians). Wide enough (~±80°) to bring even high-latitude
 *  clusters (e.g. Europe ~46°N, Norway ~62°N) down to the canvas centre, which
 *  is required for centre-zoom to actually magnify them. */
export const THETA_MIN = -1.4;
export const THETA_MAX = 1.4;

/** Initial viewer tilt — looks slightly down onto the northern hemisphere. */
export const INITIAL_THETA = -0.18;

/** Marker radius as a fraction of the globe radius (sits just on the surface). */
export const MARKER_RADIUS_SCALE = 0.92;

/** Max globe canvas side in CSS px (square). */
export const MAX_GLOBE_SIZE = 620;

/** Zoom (cobe `scale`) bounds + step. Zoom is toward the globe centre, so a
 *  dense region is first dragged to the centre and then magnified to declutter
 *  the overlapping flag chips. */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 5;
export const ZOOM_STEP = 0.5;
/** Wheel delta → zoom factor sensitivity (per wheel notch). */
export const ZOOM_WHEEL_SENSITIVITY = 0.0015;
