import { useTranslation } from 'react-i18next';
import type { Market, MyBet } from '@/features/bet';

interface EventUserActivityProps {
  markets: Market[];
  bets: MyBet[];
}

export const EventUserActivity = ({ markets, bets }: EventUserActivityProps) => {
  const { t } = useTranslation();
  const marketIds = new Set(markets.map((m) => m.id));
  const relevant = bets.filter((b) => marketIds.has(b.market_id));
  if (relevant.length === 0) return null;

  const totalStake = relevant.reduce((acc, b) => acc + b.stake, 0);
  const openPotential = relevant
    .filter((b) => b.status === 'open')
    .reduce((acc, b) => acc + b.potential_payout, 0);
  const openCount = relevant.filter((b) => b.status === 'open').length;

  return (
    <section
      className="flex flex-col gap-2 p-4"
      style={{
        backgroundColor: 'color-mix(in oklch, var(--color-accent) 8%, var(--color-bg-surface))',
        border: '1px solid color-mix(in oklch, var(--color-accent) 24%, transparent)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <h2
        className="text-sm font-semibold uppercase tracking-wide"
        style={{ color: 'var(--color-accent)' }}
      >
        {t('eventDetail.yourActivity', { defaultValue: 'Your activity on this event' })}
      </h2>
      <dl
        className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4"
        style={{ color: 'var(--color-text-primary)' }}
      >
        <Stat
          label={t('eventDetail.betsCount', { defaultValue: 'Bets' })}
          value={relevant.length.toString()}
        />
        <Stat
          label={t('eventDetail.totalStake', { defaultValue: 'Total stake' })}
          value={totalStake.toFixed(2)}
        />
        <Stat
          label={t('eventDetail.openBets', { defaultValue: 'Open' })}
          value={openCount.toString()}
        />
        <Stat
          label={t('eventDetail.potentialPayout', { defaultValue: 'Potential payout' })}
          value={openPotential.toFixed(2)}
        />
      </dl>
    </section>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-[11px] uppercase" style={{ color: 'var(--color-text-secondary)' }}>
      {label}
    </dt>
    <dd className="mt-0.5 font-mono text-base">{value}</dd>
  </div>
);
