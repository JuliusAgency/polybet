import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ROUTES } from '@/app/router/routes';
import { useTranslation } from 'react-i18next';
import {
  useEventById,
  useMarketRefresh,
  useMyBets,
  useSimilarEvents,
  useUserBalance,
} from '@/features/bet';
import { useArchiveMarket } from '@/features/admin/markets/useArchiveMarket';
import { useAuth } from '@/shared/hooks/useAuth';
import type { Role } from '@/shared/types';
import type { Market, MarketOutcome } from '@/entities/market';
import { sortMarketsByYesDesc, getYesOutcome, getChartOutcomes } from '@/entities/market';
import { BetSlip, BETSLIP_DOCK_QUERY } from '@/widgets/BetSlip';
import { MarketThumbnail } from '@/shared/ui/MarketThumbnail';
import { Spinner } from '@/shared/ui/Spinner';
import { pickOutcomeColor } from '@/shared/ui/PriceHistoryChart/priceHistoryPalette';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { formatVolume, formatProbability } from '@/shared/utils';
import { SimilarEventsList } from './components/SimilarEventsList';
import { EventUserActivity } from './components/EventUserActivity';
import { EventRules } from './components/EventRules';
import { SingleMarketView } from './components/SingleMarketView';
import { EventMarketRow } from './components/EventMarketRow';
import { EventPriceHistoryChart } from './components/EventPriceHistoryChart';

interface SelectedBet {
  market: Market;
  outcome: MarketOutcome;
}

// Prefer the Yes outcome (buy-win); fall back to the first outcome carrying a
// Polymarket token so the slip can always fetch a live quote.
function pickBettableOutcome(market: Market): MarketOutcome | null {
  const yes = getYesOutcome(market);
  if (yes?.polymarket_token_id != null) return yes;
  return market.market_outcomes.find((o) => o.polymarket_token_id != null) ?? null;
}

interface LegendEntry {
  key: string;
  name: string;
  color: string;
  pct: string | null;
}

// Build the inline outcome legend so its dot colours line up with the chart
// lines. EventPriceHistoryChart plots the top-N markets by VOLUME desc, flattens
// each to its chart outcomes, and colours line `idx` with pickOutcomeColor(idx).
// We mirror that EXACT order/indexing here — same volume sort, same top-N, same
// flat-list index — so dot ↔ line colours match. Presentation only; no fetch.
function buildOutcomeLegend(markets: Market[], topN: number): LegendEntry[] {
  const byVolumeDesc = [...markets].sort(
    (a, b) =>
      (typeof b.volume === 'number' ? b.volume : 0) - (typeof a.volume === 'number' ? a.volume : 0)
  );
  const entries: LegendEntry[] = [];
  let globalIdx = 0;
  byVolumeDesc.slice(0, topN).forEach((market) => {
    const prefix = market.group_label ?? market.question;
    const chartOutcomes = getChartOutcomes(market);
    chartOutcomes.forEach((o) => {
      // A lone chart line is named by the market label alone (matches the chart).
      const name = chartOutcomes.length === 1 ? prefix : `${prefix}: ${o.name}`;
      entries.push({
        key: `${market.id}:${o.id}`,
        name,
        color: pickOutcomeColor(globalIdx),
        pct: o.price != null ? formatProbability(o.price) : null,
      });
      globalIdx += 1;
    });
  });
  return entries;
}

interface EventDetailPageProps {
  // Read-only mode for the super-admin / manager Markets surfaces: no BetSlip,
  // no balance / user-activity, outcome pills rendered as non-bettable, and a
  // role-aware back link. Defaults to the full user betting view.
  readonly?: boolean;
}

const EventDetailPage = ({ readonly = false }: EventDetailPageProps = {}) => {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  const archiveMarket = useArchiveMarket();
  const queryClient = useQueryClient();

  const { data: eventData, isLoading, isError, error } = useEventById(id);
  // Periodically refresh odds from Polymarket so the bet placement page can't be
  // gamed by checking the original site between price ticks. The edge function
  // writes fresh prices into market_outcomes; useMarketRefresh invalidates the
  // exact `['event', id]` cache key after a successful refresh so useEventById
  // immediately picks up fresh prices without a 30s lag.
  const eventPolymarketIds = (eventData?.markets ?? []).map((m) => m.polymarket_id);
  useMarketRefresh(eventPolymarketIds, { eventId: id });
  const { data: bets = [] } = useMyBets();
  const { data: balance } = useUserBalance();
  const { data: similar = [], isLoading: isSimilarLoading } = useSimilarEvents({
    eventId: eventData?.event.id,
    tagSlug: eventData?.event.tag_slug ?? null,
    category: eventData?.event.category ?? null,
  });

  const [selectedBet, setSelectedBet] = useState<SelectedBet | null>(null);
  // Desktop (>= lg) docks the slip as a sticky sidebar column; narrower
  // viewports keep the floating overlay / bottom-sheet.
  const isDesktop = useMediaQuery(BETSLIP_DOCK_QUERY);

  const handleOutcomeClick = useCallback(
    (market: Market, outcome: MarketOutcome) => {
      setSelectedBet({ market, outcome });
    },
    [setSelectedBet]
  );

  // Deep-link pre-selection: the World Cup map opens this page with
  // `?market=<id>` to auto-open the BetSlip on that country's sub-market (Yes
  // outcome = "buy win"; the user can switch to No or Sell inside the slip).
  // Resolved during render (React's recommended alternative to a setState
  // effect — same pattern as MarketsFeedPage's tab-transition state) and tracked
  // by `appliedMarketId` so it fires once per param: closing the slip doesn't
  // reopen it, but navigating to a different ?market= does.
  const [searchParams] = useSearchParams();
  const presetMarketId = searchParams.get('market');
  const [appliedMarketId, setAppliedMarketId] = useState<string | null>(null);
  if (!readonly && presetMarketId && eventData && appliedMarketId !== presetMarketId) {
    const market = eventData.markets.find((m) => m.id === presetMarketId);
    const outcome = market ? pickBettableOutcome(market) : null;
    setAppliedMarketId(presetMarketId);
    if (market && outcome) setSelectedBet({ market, outcome });
  }

  // Desktop docked column: pre-select a default so the trade column starts
  // populated (Polymarket-style). Prefers the top OPEN market's Yes outcome,
  // but falls back to the top market regardless of status so the slip always
  // renders — if that market isn't tradable the slip disables its own CTA
  // (stale book → "quote unavailable"). Fires once on load; because
  // `appliedDefault` stays true, a column the user dismissed via × / Escape
  // stays closed until an outcome is clicked. Skipped when a ?market=
  // deep-link drives it.
  const [appliedDefault, setAppliedDefault] = useState(false);
  // Bumped after a successful trade so the always-on slip remounts with a
  // cleared amount while keeping the same selection (it never closes).
  const [slipNonce, setSlipNonce] = useState(0);
  if (!readonly && isDesktop && !presetMarketId && !selectedBet && !appliedDefault && eventData) {
    const sorted =
      eventData.markets.length > 1 ? sortMarketsByYesDesc(eventData.markets) : eventData.markets;
    const top = sorted.find((m) => m.status === 'open') ?? sorted[0] ?? null;
    const outcome = top ? (pickBettableOutcome(top) ?? top.market_outcomes[0] ?? null) : null;
    setAppliedDefault(true);
    if (top && outcome) setSelectedBet({ market: top, outcome });
  }

  // Archive is an admin-only action available on the read-only detail view for
  // resolved markets. Managers do not archive (mirrors the manager Markets page,
  // which never exposed it), so gate to super_admin.
  const canArchive = readonly && role === 'super_admin';
  const handleArchive = useCallback(
    (market: Market) => {
      if (!window.confirm(t('markets.archiveConfirm'))) return;
      // useArchiveMarket invalidates ['markets']; also refresh THIS event's
      // detail cache so the archived row updates immediately instead of waiting
      // for the next useEventById refetch tick.
      archiveMarket.mutate(
        { marketId: market.id },
        { onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['event', id] }) }
      );
    },
    [archiveMarket, queryClient, id, t]
  );

  // In read-only mode no betting is possible: never wire the outcome click, so
  // the BetSlip can never open and the pills stay inert.
  const outcomeClickHandler = readonly ? undefined : handleOutcomeClick;
  const cardAppearance: 'default' | 'inactive' | undefined = readonly ? 'inactive' : undefined;
  const backTo = readonly ? marketsRouteForRole(role) : ROUTES.USER.MARKETS;
  // Under the admin/manager shells the layout <main> has no padding (unlike
  // UserLayout, which wraps content in max-w-7xl mx-auto px-4 py-6). On those
  // shells the main column is usually narrower than max-w-7xl, so mx-auto adds no
  // gap and the only spacing from the sidebar is this horizontal padding — keep it
  // generous (px-6 -> lg:px-10) so content isn't flush against the sidebar.
  const rootClass = readonly ? 'mx-auto w-full max-w-7xl px-6 py-6 sm:px-8 lg:px-10' : undefined;

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || !eventData) {
    return (
      <div className={rootClass}>
        <BackLink to={backTo} />
        <p className="mt-4 text-sm" style={{ color: 'var(--color-loss)' }}>
          {t('eventDetail.loadError')}
          {error?.message ? `: ${error.message}` : ''}
        </p>
      </div>
    );
  }

  const { event, markets: rawMarkets } = eventData;
  // Multi-outcome events render best with leading candidates at the top —
  // matches Polymarket's layout. Single-market events skip the sort.
  const markets = rawMarkets.length > 1 ? sortMarketsByYesDesc(rawMarkets) : rawMarkets;
  const betByMarketId = new Map(bets.map((b) => [b.market_id, b]));
  const volumeLabel = formatVolume(event.volume ?? null);
  const closesDate = event.close_at
    ? new Date(event.close_at).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  const isSingleMarket = markets.length === 1;
  // On desktop the slip lives in a sticky sidebar column; on narrower viewports
  // it falls back to the floating overlay opened on outcome click.
  const dockColumn = !readonly && isDesktop;

  return (
    <div className={rootClass}>
      <BackLink to={backTo} />

      <header className="mt-4 flex items-start gap-4">
        <MarketThumbnail src={event.image_url} title={event.title} id={event.id} size="lg" />
        <div className="min-w-0 flex-1">
          {/* E5: muted, mixed-case, dot-separated breadcrumb (Polymarket-style).
              Build an array of present items and interleave a muted "·" so there
              is never a leading/trailing dot; flex-wrap + logical gap stays
              RTL-safe and the dot is direction-neutral. */}
          <div
            className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {[
              event.category ? <span key="cat">{event.category}</span> : null,
              <span key="mc">{t('events.marketCount', { count: markets.length })}</span>,
              volumeLabel ? (
                <span key="vol">{t('markets.volumeShort', { value: volumeLabel })}</span>
              ) : null,
              closesDate ? (
                <span key="cl">
                  {event.status === 'open' ? t('markets.closesAt') : t('markets.closedAt')}{' '}
                  {closesDate}
                </span>
              ) : null,
            ]
              .filter(Boolean)
              .map((node, i, arr) => (
                <span key={i} className="flex items-center gap-x-2">
                  {node}
                  {i < arr.length - 1 && (
                    <span aria-hidden style={{ color: 'var(--color-text-muted)' }}>
                      ·
                    </span>
                  )}
                </span>
              ))}
          </div>
          <h1
            className="text-xl font-bold leading-tight sm:text-2xl"
            style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}
          >
            {event.title}
          </h1>
          {/* E6: inline colored-dot legend whose colours match the chart lines.
              Multi-outcome events only — a binary event already shows its % in
              the compact SingleMarketView row. Presentation of plotted data. */}
          {!isSingleMarket && markets.length > 1 && (
            <div
              className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"
              aria-label={t('eventDetail.outcomesLegend', { defaultValue: 'Outcomes' })}
            >
              {buildOutcomeLegend(markets, 3).map((entry) => (
                <span key={entry.key} className="inline-flex items-center gap-1.5 text-xs">
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 9999,
                      backgroundColor: entry.color,
                    }}
                  />
                  <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>
                    {entry.name}
                  </span>
                  {entry.pct && (
                    <span
                      className="tabular-nums font-semibold"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {entry.pct}
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className={dockColumn ? 'flex gap-6' : undefined}>
        <div className={dockColumn ? 'min-w-0 flex-1' : undefined}>
          <div className="mt-6 flex flex-col gap-4">
            {markets.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {t('eventDetail.noMarkets')}
              </p>
            ) : isSingleMarket ? (
              <SingleMarketView
                market={markets[0]}
                userBet={betByMarketId.get(markets[0].id)}
                description={event.description}
                onOutcomeClick={outcomeClickHandler}
                readonly={readonly}
                onArchive={canArchive ? handleArchive : undefined}
                isArchiving={
                  archiveMarket.isPending && archiveMarket.variables?.marketId === markets[0].id
                }
                activitySlot={
                  !readonly ? <EventUserActivity markets={markets} bets={bets} /> : null
                }
              />
            ) : (
              <>
                <EventPriceHistoryChart markets={markets} />

                {/* Your activity sits right below the chart (Polymarket order),
                    above the markets list — only renders once the user has bet. */}
                {!readonly && <EventUserActivity markets={markets} bets={bets} />}

                <section
                  className="flex flex-col"
                  style={{
                    backgroundColor: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                  }}
                >
                  {markets.map((market, idx) => (
                    <EventMarketRow
                      key={market.id}
                      market={market}
                      userBet={betByMarketId.get(market.id)}
                      mode={!readonly && market.status === 'open' ? 'interactive' : 'readonly'}
                      outcomeAppearance={cardAppearance}
                      onOutcomeClick={outcomeClickHandler}
                      onArchive={canArchive ? handleArchive : undefined}
                      isArchiving={
                        archiveMarket.isPending && archiveMarket.variables?.marketId === market.id
                      }
                      isFirst={idx === 0}
                    />
                  ))}
                </section>

                {/* Rules / About — pinned to the bottom, below the markets list
                    (Polymarket order), with long-URL-safe wrapping. */}
                {event.description && <EventRules description={event.description} />}
              </>
            )}
          </div>

          <div className="mt-10">
            <SimilarEventsList events={similar} isLoading={isSimilarLoading} />
          </div>
        </div>

        {/* Desktop docked trade column — pre-populated on load, sticks below the
            header while the left column scrolls. Keyed on market+outcome (+nonce)
            so switching outcome or finishing a trade remounts the slip with a
            fresh amount. The × / Escape clears the selection; `appliedDefault`
            stays true so the auto-select never re-opens a user-dismissed column
            (clicking any outcome re-opens it). */}
        {dockColumn && selectedBet && (
          <aside className="mt-6 w-[360px] shrink-0">
            <BetSlip
              key={`${selectedBet.market.id}:${selectedBet.outcome.id}:${slipNonce}`}
              market={selectedBet.market}
              outcome={selectedBet.outcome}
              availableBalance={balance?.available ?? 0}
              docked
              showClose
              // Trade success keeps the docked column open (onSuccess remounts it
              // cleared); only the user-initiated × / Escape dismisses it.
              onClose={() => {}}
              onRequestClose={() => setSelectedBet(null)}
              onSuccess={() => setSlipNonce((n) => n + 1)}
            />
          </aside>
        )}
      </div>

      {/* Mobile / non-desktop: floating overlay opened on outcome click (no
          backdrop — the page stays interactive). */}
      {!dockColumn && !readonly && selectedBet && (
        <BetSlip
          key={`${selectedBet.market.id}:${selectedBet.outcome.id}`}
          market={selectedBet.market}
          outcome={selectedBet.outcome}
          availableBalance={balance?.available ?? 0}
          onClose={() => setSelectedBet(null)}
          onSuccess={() => setSelectedBet(null)}
        />
      )}
    </div>
  );
};

// Read-only EventDetailPage is mounted under all three role layouts; the back
// link must return to the role's own Markets list, not the user feed.
function marketsRouteForRole(role: Role | null): string {
  switch (role) {
    case 'super_admin':
      return ROUTES.ADMIN.MARKETS;
    case 'manager':
      return ROUTES.MANAGER.MARKETS;
    default:
      return ROUTES.USER.MARKETS;
  }
}

const BackLink = ({ to }: { to: string }) => {
  const { t } = useTranslation();
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 text-sm font-medium"
      style={{ color: 'var(--color-text-secondary)' }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
      {t('eventDetail.back')}
    </Link>
  );
};

export default EventDetailPage;
