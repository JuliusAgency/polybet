import { useTranslation } from 'react-i18next';
import type { Market } from '@/entities/market';
import { ROUTES, buildPath } from '@/app/router/routes';
import { useArchiveMarket } from '@/features/admin/markets/useArchiveMarket';
import { ReadOnlyMarketsFeed } from '@/widgets/ReadOnlyMarketsFeed';

const eventHref = (id: string) => buildPath(ROUTES.ADMIN.MARKET_DETAIL, { id });

// Super-admin Markets: the shared read-only feed, scoped to the admin detail
// route and wired with archive (admins can archive resolved markets).
const MarketsPage = () => {
  const { t } = useTranslation();
  const archiveMarket = useArchiveMarket();

  const handleArchive = (market: Market) => {
    if (!window.confirm(t('markets.archiveConfirm'))) return;
    archiveMarket.mutate({ marketId: market.id });
  };

  return (
    <ReadOnlyMarketsFeed
      eventHref={eventHref}
      onArchive={handleArchive}
      archivingMarketId={
        archiveMarket.isPending ? (archiveMarket.variables?.marketId ?? null) : null
      }
    />
  );
};

export default MarketsPage;
