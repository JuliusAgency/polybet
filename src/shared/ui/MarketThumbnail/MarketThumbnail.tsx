import { useState } from 'react';

/**
 * Square thumbnail for a market/event. Falls back to first-letter glyph on a
 * deterministic hue derived from the id, so every card has a stable visual anchor.
 */

type Size = 'sm' | 'md' | 'lg';

interface MarketThumbnailProps {
  src: string | null | undefined;
  /** Title used for alt text and the fallback glyph. */
  title: string;
  /** Stable id used to derive the fallback hue. */
  id: string;
  size?: Size;
}

const DIMS: Record<Size, number> = {
  sm: 32,
  md: 40,
  lg: 48,
};

function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

export function MarketThumbnail({ src, title, id, size = 'lg' }: MarketThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const px = DIMS[size];
  const showImage = !!src && !failed;

  if (showImage) {
    return (
      <img
        src={src!}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        width={px}
        height={px}
        onError={() => setFailed(true)}
        className="shrink-0 rounded-md object-cover"
        style={{
          width: px,
          height: px,
          backgroundColor: 'var(--color-bg-base)',
          border: '1px solid var(--color-border-subtle)',
        }}
      />
    );
  }

  const hue = hueFromId(id);
  const letter = title.trim().charAt(0).toUpperCase() || '?';

  return (
    <div
      className="shrink-0 rounded-md"
      aria-hidden="true"
      style={{
        width: px,
        height: px,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `oklch(28% 0.05 ${hue})`,
        border: '1px solid var(--color-border-subtle)',
        color: `oklch(85% 0.09 ${hue})`,
        fontFamily: 'var(--font-sans)',
        fontWeight: 600,
        fontSize: Math.round(px * 0.44),
        lineHeight: 1,
      }}
    >
      {letter}
    </div>
  );
}
