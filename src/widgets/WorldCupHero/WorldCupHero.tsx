import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import 'flag-icons/css/flag-icons.min.css';
import { useWorldCupWinner } from '@/features/bet';
import { formatProbability } from '@/shared/utils';
import {
  WORLD_CUP_FLAGS,
  PLACEHOLDER_PERCENT,
  MAX_HERO_FLAGS,
  MIN_HERO_FLAGS,
  WHEEL_RADIUS,
  AUTO_SPIN_DEG_PER_SEC,
  INERTIA_DECAY_PER_SEC,
  FLING_SCALE,
  MAX_FLING_DEG_PER_SEC,
} from './const';
import './worldCupHero.css';

interface HeroFlag {
  country: string;
  iso2: string;
  /** Formatted win probability, e.g. "18%" (or the static placeholder). */
  pct: string;
}

/** Normalise an angle delta to the shortest signed value in (-180, 180]. */
function shortestDelta(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Animated World Cup hero. A wheel of country flags auto-rotates and follows the
 * user's drag direction — after a fling it keeps spinning the way the user
 * pushed it. Each flag is labelled with the country's live win probability from
 * the "World Cup Winner" event, falling back to a static roster + placeholder
 * until that event loads.
 */
export function WorldCupHero() {
  const { t, i18n } = useTranslation();
  // In RTL the wheel is mirrored via scaleX(-1) (see worldCupHero.css), which
  // visually inverts rotation. The drag handler negates its delta to compensate
  // so dragging the wheel still follows the pointer.
  const isRTL = i18n.language === 'he';

  // Live win probabilities from the "World Cup Winner" event (same source as the
  // Map tab globe/list). Take the leading countries that resolve to a flag and
  // label each with its real odds; fall back to the static roster + placeholder
  // until the event has loaded (or if it isn't synced yet).
  const { countries } = useWorldCupWinner();
  const flags = useMemo<HeroFlag[]>(() => {
    // De-duplicate by flag code: the live event can carry two sub-markets that
    // resolve to the same country (e.g. "USA" and "United States" → `us`).
    // `countries` is sorted by probability DESC, so the first hit is the one we
    // keep — this also guards the React key (flag.country) against collisions.
    const seen = new Set<string>();
    const live: HeroFlag[] = [];
    for (const c of countries) {
      if (!c.iso2 || seen.has(c.iso2)) continue;
      seen.add(c.iso2);
      live.push({
        country: c.name,
        iso2: c.iso2,
        pct: formatProbability(c.probability, 0),
      });
      if (live.length >= MAX_HERO_FLAGS) break;
    }
    if (live.length >= MIN_HERO_FLAGS) return live;
    return WORLD_CUP_FLAGS.map<HeroFlag>((f) => ({
      country: f.country,
      iso2: f.iso2,
      pct: PLACEHOLDER_PERCENT,
    }));
  }, [countries]);
  // Angular gap between adjacent flags depends on how many we actually render.
  const stepDeg = 360 / flags.length;

  const layerRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  // Imperative animation state — kept in refs so the rAF loop never re-renders.
  const angleRef = useRef(0); // current wheel rotation, degrees
  const dirRef = useRef(1); // last interaction direction: +1 / -1
  const draggingRef = useRef(false);
  const pointerAngleRef = useRef(0); // last pointer angle around the centre
  const velocityRef = useRef(AUTO_SPIN_DEG_PER_SEC); // deg/sec
  const lastMoveRef = useRef({ delta: 0, time: 0 });

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const baseSpeed = reduce ? 0 : AUTO_SPIN_DEG_PER_SEC;
    velocityRef.current = baseSpeed * dirRef.current;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05); // clamp big gaps (tab blur)
      last = now;

      if (!draggingRef.current) {
        angleRef.current += velocityRef.current * dt;
        // Relax velocity back toward the base auto-spin in the last direction.
        const target = baseSpeed * dirRef.current;
        const decay = Math.pow(INERTIA_DECAY_PER_SEC, dt);
        velocityRef.current = target + (velocityRef.current - target) * decay;
      }

      if (wheelRef.current) {
        wheelRef.current.style.transform = `rotate(${angleRef.current}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const centreAngle = (e: React.PointerEvent): number => {
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    pointerAngleRef.current = centreAngle(e);
    lastMoveRef.current = { delta: 0, time: performance.now() };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const current = centreAngle(e);
    const raw = shortestDelta(current - pointerAngleRef.current);
    // RTL wheel is mirrored (scaleX(-1)), so invert the drag delta.
    const delta = isRTL ? -raw : raw;
    pointerAngleRef.current = current;
    angleRef.current += delta;
    if (delta !== 0) dirRef.current = delta > 0 ? 1 : -1;
    lastMoveRef.current = { delta, time: performance.now() };
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    // Fling velocity from the final movement: scaled down for a gentler launch
    // and capped to a sane spin. It then decays quickly back to the idle speed.
    const { delta, time } = lastMoveRef.current;
    const dt = Math.max((performance.now() - time) / 1000, 1 / 1000);
    const raw = (delta / dt) * FLING_SCALE;
    const fling = Math.max(-MAX_FLING_DEG_PER_SEC, Math.min(MAX_FLING_DEG_PER_SEC, raw));
    if (Math.abs(fling) > AUTO_SPIN_DEG_PER_SEC) {
      velocityRef.current = fling;
    }
  };

  return (
    <section className="wc-hero" aria-label={t('worldCup.heroTitle')}>
      <div
        ref={layerRef}
        className="wc-hero__wheel-layer"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div ref={wheelRef} className="wc-wheel" aria-hidden="true">
          {flags.map((flag, i) => (
            <div
              key={flag.country}
              className="wc-flag"
              style={{
                transform: `rotate(${i * stepDeg}deg) translate(0, ${-WHEEL_RADIUS}px)`,
              }}
            >
              <div className="wc-flag__inner">
                <div className="wc-flag__card" title={flag.country}>
                  <span className={`fi fis fi-${flag.iso2}`} />
                </div>
                <span className="wc-flag__pct">{flag.pct}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="wc-hero__title-layer">
        <h1 className="wc-hero__title">{t('worldCup.heroTitle')}</h1>
        <p className="wc-hero__subtitle">{t('worldCup.heroSubtitle')}</p>
      </div>
    </section>
  );
}
