import { useEffect, useRef, useState } from 'react';
import createGlobe from 'cobe';
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

/**
 * Interactive dotted globe (cobe) with HTML flag markers overlaid at each
 * country's centroid. The canvas and the markers read the same phi/theta refs
 * every frame, so the flags stay locked to their position as the globe spins or
 * is dragged. Lazy-loaded by WorldCupMap so cobe stays out of the main bundle.
 */
export default function Globe({ countries, onSelect, highlightedId }: GlobeProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markerEls = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Imperative rotation state — never triggers a re-render.
  const phiRef = useRef(0);
  const thetaRef = useRef(INITIAL_THETA);
  const draggingRef = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const reduceRef = useRef(false);

  // Latest markers, read by the overlay rAF without re-subscribing on refetch.
  const markersRef = useRef<WorldCupCountry[]>([]);
  const [size, setSize] = useState(0);

  const markers = countries.filter(
    (c): c is WorldCupCountry & { lat: number; lng: number } => c.lat != null && c.lng != null
  );

  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  useEffect(() => {
    reduceRef.current = prefersReducedMotion();
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
        if (!draggingRef.current && !reduceRef.current) {
          phiRef.current += AUTO_SPIN_PER_FRAME;
        }
        state.phi = phiRef.current;
        state.theta = thetaRef.current;
        state.width = size * dpr;
        state.height = size * dpr;
      },
    });

    return () => globe.destroy();
  }, [size, theme]);

  // Overlay rAF: project each marker every frame and write its transform.
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
          MARKER_RADIUS_SCALE
        );
        if (!p.visible) {
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

  // Drag handlers live on the canvas only; flag buttons sit above it and handle
  // their own clicks, so pressing a flag never starts a drag.
  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
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
  const endDrag = (e: React.PointerEvent) => {
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div ref={containerRef} className="wc-map__globe-container">
      <div
        className="wc-map__globe-stage"
        style={{ width: size || '100%', height: size || '100%' }}
      >
        <canvas
          ref={canvasRef}
          className="wc-map__globe-canvas"
          style={{ width: size, height: size, cursor: 'grab', touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
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
                {country.iso2 ? (
                  <span className={`fi fis fi-${country.iso2}`} />
                ) : (
                  <span className="wc-map__marker-dot" />
                )}
                <span className="wc-map__marker-pct">{pct}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
