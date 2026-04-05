import { useTranslation } from 'react-i18next';
import { useMarkets } from '@/features/bet';
import { useArchiveMarket } from '@/features/admin/markets/useArchiveMarket';
import { MarketCard } from '@/pages/user/MarketsFeedPage/components/MarketCard';
import type { Market } from '@/features/bet';

const MarketsPage = () => {
  const { t } = useTranslation();
  const { data: markets, isLoading, isError, error } = useMarkets();
  const archiveMarket = useArchiveMarket();

  const handleArchive = (market: Market) => {
    if (!window.confirm(t('markets.archiveConfirm'))) return;
    archiveMarket.mutate({ marketId: market.id });
  };

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      <h1 className="mb-6 text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
        {t('markets.title')}
      </h1>

      {isLoading && (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t('common.loading')}
        </p>
      )}

      {isError && (
        <p className="text-sm" style={{ color: 'var(--color-error)' }}>
          {t('common.error')}: {error?.message}
        </p>
      )}

      {!isLoading && !isError && markets?.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t('markets.noMarkets')}
        </p>
      )}

      {!isLoading && !isError && (markets?.length ?? 0) > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {markets?.map((market) => (
            <MarketCard
              key={market.id}
              market={market}
              mode="readonly"
              onArchive={handleArchive}
              isArchiving={
                archiveMarket.isPending && archiveMarket.variables?.marketId === market.id
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MarketsPage;
