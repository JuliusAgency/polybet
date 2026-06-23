import { ROUTES, buildPath } from '@/app/router/routes';
import { ReadOnlyMarketsFeed } from '@/widgets/ReadOnlyMarketsFeed';

const eventHref = (id: string) => buildPath(ROUTES.MANAGER.MARKET_DETAIL, { id });

// Manager Markets: the shared read-only feed, scoped to the manager detail
// route. Managers have no archive capability, so no archive handler is passed.
const MarketsPage = () => {
  return <ReadOnlyMarketsFeed eventHref={eventHref} />;
};

export default MarketsPage;
