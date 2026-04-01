import { useTranslation } from 'react-i18next';
import type { LimitSource } from '@/features/admin/bet-limits';

interface EffectiveLimitBadgeProps {
  limit: number | null;
  source: LimitSource;
}

const sourceColor: Record<NonNullable<LimitSource>, string> = {
  personal: 'var(--color-open)',
  manager: 'var(--color-accent)',
  global: 'var(--color-text-secondary)',
};

const sourceBg: Record<NonNullable<LimitSource>, string> = {
  personal: 'var(--color-open-muted)',
  manager: 'var(--color-accent-muted)',
  global: 'rgba(148,163,184,0.12)',
};

export const EffectiveLimitBadge = ({ limit, source }: EffectiveLimitBadgeProps) => {
  const { t } = useTranslation();

  if (limit == null || source == null) {
    return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
  }

  const color = sourceColor[source];
  const bg = sourceBg[source];
  const sourceKey = `betLimits.source${source.charAt(0).toUpperCase()}${source.slice(1)}` as
    | 'betLimits.sourcePersonal'
    | 'betLimits.sourceManager'
    | 'betLimits.sourceGlobal';
  const label = t(sourceKey);

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono" style={{ color: 'var(--color-text-primary)' }}>
        {limit.toFixed(2)}
      </span>
      <span
        className="rounded px-1.5 py-0.5 text-xs font-medium"
        style={{ color, backgroundColor: bg }}
      >
        {label}
      </span>
    </span>
  );
};
