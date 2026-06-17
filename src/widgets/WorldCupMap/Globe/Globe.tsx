import { useCallback, useEffect, useRef, useState } from 'react';
import createGlobe from 'cobe';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/shared/hooks/useTheme';
import { formatProbability } from '@/shared/utils';
import type { WorldCupCountry } from '@/features/bet';
import {
  GLOBE_THEME,
  AUTO_SPIN_PER_FRAME,
  DRAG_PHI_PER_PX,
  DRAG_THETA_PER_PX,
  THETA_MIN,
  THETA_MAX,
  INITIAL_THETA,
  MARKER_RADIUS_SCALE,
  MAX_GLOBE_SIZE,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  ZOOM_WHEEL_SENSITIVITY,
} from '../const';
import { projectMarker } from './projection';

interface GlobeProps {
  /** Country rows — only those with lat/lng are rendered as markers. */
  countries: WorldCupCountry[];
  onSelect: (country: WorldCupCountry) => void;
  highlightedId?: string | null;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

/**
 * Interactive dotted globe (cobe) with HTML flag markers overlaid at each
 * country's centroid. The canvas and the markers read the same phi/theta/zoom
 * refs every frame, so the flags stay locked to their position as the globe
 * spins, is dragged, or is zoomed. Zoom is toward the centre — drag a dense
 * region (e.g. Europe) to the middle, then magnify it to separate the chips.
 * Lazy-loaded by WorldCupMap so cobe stays out of the main bundle.
 */
export default function Globe({ countries, onSelect, highlightedId }: GlobeProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markerEls = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Imperative view state — never triggers a re-render.
  const phiRef = useRef(0);
  const thetaRef = useRef(INITIAL_THETA);
  const zoomRef = useRef(ZOOM_MIN);
  const draggingRef = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const reduceRef = useRef(false);
  // Active pointers for pinch-zoom (id → position).
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);

  // Latest markers, read by the overlay rAF without re-subscribing on refetch.
  const markersRef = useRef<WorldCupCountry[]>([]);
  const [size, setSize] = useState(0);
  // Mirrors zoomRef for the +/- button disabled states (not read in the loop).
  const [zoom, setZoom] = useState(ZOOM_MIN);

  const markers = countries.filter(
    (c): c is WorldCupCountry & { lat: number; lng: number } => c.lat != null && c.lng != null
  );

  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  useEffect(() => {
    reduceRef.current = prefersReducedMotion();
  }, []);

  const applyZoom = useCallback((next: number) => {
    const z = clampZoom(next);
    zoomRef.current = z;
    setZoom(z);
  }, []);

  // Track the container width → square globe side (capped).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => {
      const next = Math.min(el.clientWidth, MAX_GLOBE_SIZE);
      setSize(next > 0 ? next : 0);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Create / recreate the cobe globe when size or theme changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const palette = GLOBE_THEME[theme];

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: size * dpr,
      height: size * dpr,
      phi: 0,
      theta: INITIAL_THETA,
      dark: palette.dark,
      diffuse: palette.diffuse,
      mapSamples: 16000,
      mapBrightness: palette.mapBrightness,
      mapBaseBrightness: palette.mapBaseBrightness,
      baseColor: palette.baseColor,
      markerColor: palette.markerColor,
      glowColor: palette.glowColor,
      markers: [],
      onRender: (state) => {
        if (!draggingRef.current && !reduceRef.current && zoomRef.current <= ZOOM_MIN) {
          phiRef.current += AUTO_SPIN_PER_FRAME;
        }
        state.phi = phiRef.current;
        state.theta = thetaRef.current;
        state.scale = zoomRef.current;
        state.width = size * dpr;
        state.height = size * dpr;
      },
    });

    return () => globe.destroy();
  }, [size, theme]);

  // Overlay rAF: project each marker every frame and write its transform. Reads
  // the same phi/theta/zoom refs as cobe so flags track the canvas exactly.
  useEffect(() => {
    if (size <= 0) return;
    let raf = 0;
    const tick = () => {
      const list = markersRef.current;
      for (const country of list) {
        const el = markerEls.current.get(country.marketId);
        if (!el || country.lat == null || country.lng == null) continue;
        const p = projectMarker(
          country.lat,
          country.lng,
          phiRef.current,
          thetaRef.current,
          size,
          MARKER_RADIUS_SCALE,
          zoomRef.current
        );
        // Hide back-facing markers and any that the zoom has pushed off-canvas.
        const offCanvas = p.x < 0 || p.x > size || p.y < 0 || p.y > size;
        if (!p.visible || offCanvas) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          el.style.zIndex = '0';
        } else {
          el.style.opacity = String(p.opacity);
          el.style.pointerEvents = p.opacity > 0.4 ? 'auto' : 'none';
          el.style.zIndex = String(Math.round(p.opacity * 100));
        }
        el.style.transform = `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  // Wheel zoom — native non-passive listener so we can preventDefault and not
  // scroll the page while zooming the globe.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * ZOOM_WHEEL_SENSITIVITY);
      applyZoom(zoomRef.current * factor);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyZoom]);

  // Pointer handlers on the canvas: 1 pointer rotates, 2 pointers pinch-zoom.
  // Flag buttons sit above the canvas and handle their own clicks, so pressing a
  // flag never starts a drag.
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2) {
      // Second finger down → start a pinch; stop rotating.
      draggingRef.current = false;
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: zoomRef.current };
    } else {
      draggingRef.current = true;
      lastPointer.current = { x: e.clientX, y: e.clientY };
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* setPointerCapture can throw for already-released pointers; ignore. */
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (pinchStart.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart.current.dist > 0) {
        applyZoom(pinchStart.current.zoom * (dist / pinchStart.current.dist));
      }
      return;
    }
    if (!draggingRef.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    phiRef.current += dx * DRAG_PHI_PER_PX;
    thetaRef.current = Math.max(
      THETA_MIN,
      Math.min(THETA_MAX, thetaRef.current + dy * DRAG_THETA_PER_PX)
    );
  };
  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) draggingRef.current = false;
  };

  return (
    <div ref={containerRef} className="wc-map__globe-container">
      <div
        ref={stageRef}
        className="wc-map__globe-stage"
        style={{ width: size || '100%', height: size || '100%' }}
      >
        <canvas
          ref={canvasRef}
          className="wc-map__globe-canvas"
          style={{ width: size, height: size, cursor: 'grab', touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        />
        <div className="wc-map__markers" aria-hidden>
          {markers.map((country) => {
            const pct = formatProbability(country.probability);
            return (
              <button
                key={country.marketId}
                type="button"
                ref={(el) => {
                  if (el) markerEls.current.set(country.marketId, el);
                  else markerEls.current.delete(country.marketId);
                }}
                className={`wc-map__marker${
                  highlightedId === country.marketId ? ' wc-map__marker--active' : ''
                }`}
                style={{ opacity: 0 }}
                onClick={() => onSelect(country)}
                title={`${country.name} · ${pct}`}
                tabIndex={-1}
              >
                <span className="wc-map__marker-flag">
                  {country.iso2 ? (
                    <span className={`fi fis fi-${country.iso2}`} />
                  ) : (
                    <span className="wc-map__marker-dot" />
                  )}
                </span>
                <span className="wc-map__marker-pct">{pct}</span>
              </button>
            );
          })}
        </div>

        <div className="wc-map__zoom" role="group" aria-label={t('worldCup.map.zoom')}>
          <button
            type="button"
            className="wc-map__zoom-btn"
            onClick={() => applyZoom(zoomRef.current + ZOOM_STEP)}
            disabled={zoom >= ZOOM_MAX}
            aria-label={t('worldCup.map.zoomIn')}
          >
            +
          </button>
          <button
            type="button"
            className="wc-map__zoom-btn"
            onClick={() => applyZoom(zoomRef.current - ZOOM_STEP)}
            disabled={zoom <= ZOOM_MIN}
            aria-label={t('worldCup.map.zoomOut')}
          >
            −
          </button>
        </div>
      </div>
    </div>
  );
}
