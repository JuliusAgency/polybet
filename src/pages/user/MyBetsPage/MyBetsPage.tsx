import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useMyBets, useUnseenBetsCount, type MyBet } from '@/features/bet';
import { Badge } from '@/shared/ui/Badge';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';
import { Spinner } from '@/shared/ui/Spinner';

const CopyIdCell = ({ id }: { id: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      <span>{`${id.slice(0, 8)}...`}</span>
      <button
        onClick={handleCopy}
        title={id}
        style={{
          color: copied ? 'var(--color-win)' : 'var(--color-text-muted)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          lineHeight: 0,
        }}
      >
        {copied ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
    </div>
  );
};

type Tab = 'open' | 'resolved' | 'history';

function historyBadgeVariant(status: MyBet['status']): 'win' | 'loss' | 'default' {
  if (status === 'won') return 'win';
  if (status === 'lost') return 'loss';
  return 'default';
}

function historyRowBg(status: MyBet['status']): string | undefined {
  if (status === 'won') return 'var(--color-win-bg, rgba(34,197,94,0.08))';
  if (status === 'lost') return 'var(--color-loss-bg, rgba(239,68,68,0.08))';
  return undefined;
}

function renderBetMarketMeta(t: (key: string) => string, bet: MyBet): string | null {
  const market = bet.markets;
  if (!market) return null;

  if (market.winning_outcome_id) {
    return market.winning_outcome_id === bet.outcome_id
      ? t('myBets.finalOutcomeWon')
      : t('myBets.finalOutcomeLost');
  }

  if (market.status === 'closed') {
    return t('myBets.marketClosedAwaitingResolution');
  }

  return null;
}

const BET_TABLE_HEADERS_OPEN = [
  'myBets.betId',
  'myBets.market',
  'myBets.selection',
  'myBets.wager',
  'myBets.potentialPayout',
  'myBets.status',
];
const BET_TABLE_HEADERS_HISTORY = [...BET_TABLE_HEADERS_OPEN, 'myBets.settled'];

const MyBetsPage = () => {
  const { t, i18n } = useTranslation();

  const [activeTab, setActiveTab] = useState<Tab>('open');
  const { data: bets, isLoading } = useMyBets();

  const { session } = useAuth();
  const queryClient = useQueryClient();
  const unseenCount = useUnseenBetsCount();

  const { mutate: markAllSeen, isPending: isMarking } = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('mark_bets_seen');
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['user', 'unseen-bets-count', session?.user.id],
      });
      void queryClient.invalidateQueries({ queryKey: ['user', 'bets', session?.user.id] });
      setActiveTab('history');
    },
    onError: () => {
      toast.error(t('myBets.markAllSeenError'));
    },
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'open', label: t('myBets.openTab') },
    { key: 'resolved', label: t('myBets.resolvedTab') },
    { key: 'history', label: t('myBets.historyTab') },
  ];

  const openBets = (bets ?? []).filter((b) => b.status === 'open');
  const resolvedBets = (bets ?? []).filter(
    (b) => (b.status === 'won' || b.status === 'lost') && b.seen_at === null
  );
  const historyBets = (bets ?? []).filter((b) => b.status !== 'open' && b.seen_at !== null);

  const totalWagered = historyBets.reduce((sum, b) => sum + b.stake, 0);
  const totalWon = historyBets
    .filter((b) => b.status === 'won')
    .reduce((sum, b) => sum + b.potential_payout, 0);
  const pnl = totalWon - totalWagered;

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      <h1 className="mb-6 text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
        {t('myBets.title')}
      </h1>

      {/* Tab switcher */}
      <div
        className="mb-6 flex gap-1 rounded-lg p-1 w-fit"
        style={{ backgroundColor: 'var(--color-bg-surface)' }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="relative rounded-md px-4 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: activeTab === tab.key ? 'var(--color-accent)' : 'transparent',
              color:
                activeTab === tab.key ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              cursor: 'pointer',
              border: 'none',
              outline: 'none',
            }}
          >
            {tab.label}
            {tab.key === 'resolved' && unseenCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '-2px',
                  insetInlineEnd: '-4px',
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-loss)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="md" />
        </div>
      )}

      {/* ── TAB 1: Open Bets ── */}
      {!isLoading && activeTab === 'open' && (
        <>
          {openBets.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)' }}>{t('myBets.noOpenBets')}</p>
          ) : (
            <div
              className="overflow-x-auto rounded-xl border"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--color-bg-surface)' }}>
                    {BET_TABLE_HEADERS_OPEN.map((key) => (
                      <th
                        key={key}
                        className="px-4 py-3 font-medium text-start"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {t(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {openBets.map((bet) => (
                    <tr key={bet.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td
                        className="px-4 py-3 font-mono text-xs"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        <CopyIdCell id={bet.id} />
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                        <div>{bet.markets?.question ?? '—'}</div>
                        {renderBetMarketMeta(t, bet) && (
                          <div
                            className="text-xs mt-1"
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            {renderBetMarketMeta(t, bet)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                        {bet.market_outcomes?.name ?? '—'}
                      </td>
                      <td
                        className="px-4 py-3 font-mono"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {bet.stake.toFixed(2)}
                      </td>
                      <td
                        className="px-4 py-3 font-mono"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {bet.potential_payout.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="open">{t('bet.open')}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── TAB 2: Resolved (unseen) ── */}
      {!isLoading && activeTab === 'resolved' && (
        <>
          {unseenCount > 0 && (
            <button
              onClick={() => markAllSeen()}
              disabled={isMarking}
              className="mb-4 px-4 py-2 rounded-md text-sm font-medium transition-colors"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-text-primary)',
                opacity: isMarking ? 0.6 : 1,
                cursor: isMarking ? 'not-allowed' : 'pointer',
                border: 'none',
              }}
            >
              {t('myBets.markAllSeen', { count: unseenCount })}
            </button>
          )}

          {resolvedBets.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)' }}>{t('myBets.noResolvedBets')}</p>
          ) : (
            <div
              className="overflow-x-auto rounded-xl border"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--color-bg-surface)' }}>
                    {BET_TABLE_HEADERS_HISTORY.map((key) => (
                      <th
                        key={key}
                        className="px-4 py-3 font-medium text-start"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {t(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resolvedBets.map((bet) => (
                    <tr
                      key={bet.id}
                      style={{
                        borderTop: '1px solid var(--color-border)',
                        backgroundColor:
                          bet.status === 'won' ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
                        borderLeft: '3px solid var(--color-accent)',
                      }}
                    >
                      <td
                        className="px-4 py-3 font-mono text-xs"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        <CopyIdCell id={bet.id} />
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                        <div>{bet.markets?.question ?? '—'}</div>
                        {renderBetMarketMeta(t, bet) && (
                          <div
                            className="text-xs mt-1"
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            {renderBetMarketMeta(t, bet)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                        {bet.market_outcomes?.name ?? '—'}
                      </td>
                      <td
                        className="px-4 py-3 font-mono"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {bet.stake.toFixed(2)}
                      </td>
                      <td
                        className="px-4 py-3 font-mono"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {bet.potential_payout.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={historyBadgeVariant(bet.status)}>
                          {bet.status === 'won' ? t('bet.won') : t('bet.lost')}
                        </Badge>
                      </td>
                      <td
                        className="px-4 py-3 font-mono text-xs"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {bet.settled_at ? (
                          <>
                            <div>{new Date(bet.settled_at).toLocaleDateString(i18n.language)}</div>
                            <div>
                              {new Date(bet.settled_at).toLocaleTimeString(i18n.language, {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── TAB 3: History (seen) ── */}
      {!isLoading && activeTab === 'history' && (
        <>
          {historyBets.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)' }}>{t('myBets.noHistory')}</p>
          ) : (
            <>
              <div
                className="overflow-x-auto rounded-xl border"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--color-bg-surface)' }}>
                      {BET_TABLE_HEADERS_HISTORY.map((key) => (
                        <th
                          key={key}
                          className="px-4 py-3 font-medium text-start"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          {t(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {historyBets.map((bet) => (
                      <tr
                        key={bet.id}
                        style={{
                          borderTop: '1px solid var(--color-border)',
                          backgroundColor: historyRowBg(bet.status),
                          borderLeft: '3px solid transparent',
                        }}
                      >
                        <td
                          className="px-4 py-3 font-mono text-xs"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          <CopyIdCell id={bet.id} />
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                          <div>{bet.markets?.question ?? '—'}</div>
                          {renderBetMarketMeta(t, bet) && (
                            <div
                              className="text-xs mt-1"
                              style={{ color: 'var(--color-text-secondary)' }}
                            >
                              {renderBetMarketMeta(t, bet)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                          {bet.market_outcomes?.name ?? '—'}
                        </td>
                        <td
                          className="px-4 py-3 font-mono"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {bet.stake.toFixed(2)}
                        </td>
                        <td
                          className="px-4 py-3 font-mono"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {bet.potential_payout.toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={historyBadgeVariant(bet.status)}>
                            {bet.status === 'won'
                              ? t('bet.won')
                              : bet.status === 'lost'
                                ? t('bet.lost')
                                : t('bet.cancelled')}
                          </Badge>
                        </td>
                        <td
                          className="px-4 py-3 font-mono text-xs"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          {bet.settled_at ? (
                            <>
                              <div>
                                {new Date(bet.settled_at).toLocaleDateString(i18n.language)}
                              </div>
                              <div>
                                {new Date(bet.settled_at).toLocaleTimeString(i18n.language, {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </div>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* P&L summary block */}
              <div
                className="mt-6 flex flex-row gap-6 rounded-xl border p-4"
                style={{
                  backgroundColor: 'var(--color-bg-surface)',
                  borderColor: 'var(--color-border)',
                }}
              >
                <div className="flex flex-col gap-1">
                  <span
                    className="text-xs font-medium"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t('myBets.totalWagered')}
                  </span>
                  <span
                    className="text-lg font-semibold font-mono"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {totalWagered.toFixed(2)}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <span
                    className="text-xs font-medium"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t('myBets.totalWon')}
                  </span>
                  <span
                    className="text-lg font-semibold font-mono"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {totalWon.toFixed(2)}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <span
                    className="text-xs font-medium"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t('myBets.pnl')}
                  </span>
                  <span
                    className="text-lg font-semibold font-mono"
                    style={{ color: pnl >= 0 ? 'var(--color-win)' : 'var(--color-loss)' }}
                  >
                    {pnl >= 0 ? '+' : ''}
                    {pnl.toFixed(2)}
                  </span>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default MyBetsPage;
