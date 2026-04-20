import { useTranslation } from 'react-i18next';
import { Card } from '@/shared/ui/Card';
import { Spinner } from '@/shared/ui/Spinner';
import { useUserStats } from '@/features/stats';

const StatsPage = () => {
  const { t } = useTranslation();
  const { stats, isLoading, error } = useUserStats();

  if (isLoading) {
    return (
      <div>
        <div className="flex justify-center py-12">
          <Spinner size="md" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <p style={{ color: 'var(--color-error)' }}>{error.message}</p>
      </div>
    );
  }

  const statCards = [
    { key: 'turnover', label: t('stats.turnover'), value: stats.turnover.toFixed(2) },
    { key: 'openExposure', label: t('stats.openExposure'), value: stats.open_exposure.toFixed(2) },
    {
      key: 'netPnl',
      label: t('stats.netPnl'),
      value: `${stats.net_pnl >= 0 ? '+' : ''}${stats.net_pnl.toFixed(2)}`,
      valueColor: stats.net_pnl >= 0 ? 'var(--color-win)' : 'var(--color-loss)',
    },
    { key: 'winRate', label: t('stats.winRate'), value: `${stats.win_rate.toFixed(1)}%` },
    { key: 'settledBets', label: t('stats.settledBets'), value: String(stats.settled_bets) },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
        {t('stats.title')}
      </h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((card) => (
          <Card key={card.key}>
            <p
              className="mb-1 text-sm font-medium"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {card.label}
            </p>
            <p
              className="text-2xl font-bold font-mono"
              style={{ color: card.valueColor ?? 'var(--color-text-primary)' }}
            >
              {card.value}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default StatsPage;
