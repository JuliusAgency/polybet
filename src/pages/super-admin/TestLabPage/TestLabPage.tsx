import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supabase } from '@/shared/api/supabase';
import { Spinner } from '@/shared/ui/Spinner';
import { CreateDemoEventModal } from './components/CreateDemoEventModal';

interface Outcome {
  id: string;
  name: string;
  odds: number;
}

interface Market {
  id: string;
  question: string;
  market_outcomes: Outcome[];
}

interface UserRow {
  id: string;
  username: string;
  balances: { available: number; in_play: number } | null;
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-bg-base)',
  color: 'var(--color-text-primary)',
  fontSize: '14px',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--color-text-secondary)',
};

const fieldStyle: React.CSSProperties = { marginBottom: '14px' };

export const TestLabPage = () => {
  const { t } = useTranslation();

  // Shared data
  const [markets, setMarkets] = useState<Market[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Place bet form
  const [betUserId, setBetUserId] = useState('');
  const [betMarketId, setBetMarketId] = useState('');
  const [betOutcomeId, setBetOutcomeId] = useState('');
  const [betStake, setBetStake] = useState('50');
  const [betLoading, setBetLoading] = useState(false);

  // Settle form
  const [settleMarketId, setSettleMarketId] = useState('');
  const [settleOutcomeId, setSettleOutcomeId] = useState('');
  const [settleLoading, setSettleLoading] = useState(false);
  const [creatingMarket, setCreatingMarket] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);

  const fetchData = async () => {
    setLoadingData(true);
    const [marketsRes, usersRes] = await Promise.all([
      supabase
        .from('markets')
        .select('id, question, market_outcomes!market_outcomes_market_id_fkey(id, name, odds)')
        .eq('status', 'open')
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, username, balances(available, in_play)')
        .eq('role', 'user')
        .eq('is_active', true)
        .order('username'),
    ]);

    if (marketsRes.data) {
      setMarkets(marketsRes.data as unknown as Market[]);
    }
    if (usersRes.data) {
      setUsers(
        (
          usersRes.data as unknown as Array<{
            id: string;
            username: string;
            balances: { available: number; in_play: number }[] | null;
          }>
        ).map((u) => ({
          id: u.id,
          username: u.username,
          balances: Array.isArray(u.balances) ? (u.balances[0] ?? null) : u.balances,
        }))
      );
    }
    setLoadingData(false);
  };

  useEffect(() => {
    void fetchData();
  }, []);

  // Derived: outcomes for selected markets
  const betOutcomes = markets.find((m) => m.id === betMarketId)?.market_outcomes ?? [];
  const settleOutcomes = markets.find((m) => m.id === settleMarketId)?.market_outcomes ?? [];

  const selectedUser = users.find((u) => u.id === betUserId);
  const selectedOutcome = betOutcomes.find((o) => o.id === betOutcomeId);
  const potentialPayout =
    selectedOutcome && betStake ? (parseFloat(betStake) * selectedOutcome.odds).toFixed(2) : null;

  const handleCreateMarket = async () => {
    setCreatingMarket(true);
    const { error } = await supabase.rpc('admin_create_demo_market');
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t('testLab.marketCreated'));
      void fetchData();
    }
    setCreatingMarket(false);
  };

  const handlePlaceBet = async () => {
    setBetLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_place_demo_bet', {
        p_user_id: betUserId,
        p_market_id: betMarketId,
        p_outcome_id: betOutcomeId,
        p_stake: parseFloat(betStake),
      });
      if (error) throw new Error(error.message);
      toast.success(t('testLab.betPlaced', { id: String(data).slice(0, 8) }));
      void fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setBetLoading(false);
    }
  };

  const handleSettle = async () => {
    setSettleLoading(true);
    try {
      const { data, error } = await supabase.rpc('settle_market', {
        p_market_id: settleMarketId,
        p_winning_outcome_id: settleOutcomeId,
      });
      if (error) throw new Error(error.message);
      const res = data as { settled: number; winners: number; losers: number };
      toast.success(
        t('testLab.settled', {
          settled: res.settled,
          winners: res.winners,
          losers: res.losers,
        })
      );
      // Market is now resolved — remove from list and reset
      setMarkets((prev) => prev.filter((m) => m.id !== settleMarketId));
      if (betMarketId === settleMarketId) setBetMarketId('');
      setSettleMarketId('');
      setSettleOutcomeId('');
      void fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setSettleLoading(false);
    }
  };

  const canPlaceBet =
    betUserId && betMarketId && betOutcomeId && parseFloat(betStake) > 0 && !betLoading;
  const canSettle = settleMarketId && settleOutcomeId && !settleLoading;

  return (
    <div className="p-6" style={{ backgroundColor: 'var(--color-bg-base)', minHeight: '100%' }}>
      <div className="mb-6 flex items-center gap-4">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          {t('testLab.title')}
        </h1>
        <button
          disabled={creatingMarket}
          onClick={() => void handleCreateMarket()}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold"
          style={{
            backgroundColor: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
            cursor: creatingMarket ? 'default' : 'pointer',
            opacity: creatingMarket ? 0.7 : 1,
          }}
        >
          {creatingMarket ? <Spinner size="sm" /> : '+ Create Demo Market'}
        </button>
        <button
          onClick={() => setShowEventModal(true)}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold"
          style={{
            backgroundColor: 'var(--color-accent)',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          + Create Demo Event
        </button>
      </div>

      <CreateDemoEventModal
        isOpen={showEventModal}
        onClose={() => setShowEventModal(false)}
        onCreated={() => void fetchData()}
      />

      {loadingData ? (
        <div className="flex justify-center py-12">
          <Spinner size="md" />
        </div>
      ) : markets.length === 0 ? (
        <div
          className="rounded-xl border p-6 flex items-center gap-4"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
        >
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('testLab.noOpenMarkets')}</p>
          <button
            disabled={creatingMarket}
            onClick={() => void handleCreateMarket()}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: '#fff',
              border: 'none',
              cursor: creatingMarket ? 'default' : 'pointer',
              opacity: creatingMarket ? 0.7 : 1,
            }}
          >
            {creatingMarket ? <Spinner size="sm" /> : '+ Create Demo Market'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* ── Card 1: Place Demo Bet ── */}
          <div
            className="rounded-xl border p-6"
            style={{
              backgroundColor: 'var(--color-bg-surface)',
              borderColor: 'var(--color-border)',
            }}
          >
            <h2
              className="mb-5 text-base font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {t('testLab.placeBetCard')}
            </h2>

            {/* User */}
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('testLab.selectUser')}</label>
              <select
                style={selectStyle}
                value={betUserId}
                onChange={(e) => setBetUserId(e.target.value)}
              >
                <option value="">{t('testLab.pickUser')}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username}
                    {u.balances != null
                      ? ` — ${t('testLab.balance')}: ${u.balances.available.toFixed(2)}`
                      : ''}
                  </option>
                ))}
              </select>
              {selectedUser?.balances && (
                <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {t('testLab.balance')}: {selectedUser.balances.available.toFixed(2)} &nbsp;|&nbsp;{' '}
                  {t('testLab.inPlay')}: {selectedUser.balances.in_play.toFixed(2)}
                </p>
              )}
            </div>

            {/* Market */}
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('testLab.selectMarket')}</label>
              <select
                style={selectStyle}
                value={betMarketId}
                onChange={(e) => {
                  setBetMarketId(e.target.value);
                  setBetOutcomeId('');
                }}
              >
                <option value="">{t('testLab.pickMarket')}</option>
                {markets.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.question.length > 60 ? m.question.slice(0, 60) + '…' : m.question}
                  </option>
                ))}
              </select>
            </div>

            {/* Outcome */}
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('testLab.selectOutcome')}</label>
              <select
                style={selectStyle}
                value={betOutcomeId}
                onChange={(e) => setBetOutcomeId(e.target.value)}
                disabled={!betMarketId}
              >
                <option value="">
                  {betMarketId ? t('testLab.pickOutcome') : t('testLab.selectMarketFirst')}
                </option>
                {betOutcomes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} — {o.odds.toFixed(2)}x
                  </option>
                ))}
              </select>
            </div>

            {/* Stake */}
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('testLab.stake')}</label>
              <input
                type="number"
                min="1"
                step="1"
                style={selectStyle}
                value={betStake}
                onChange={(e) => setBetStake(e.target.value)}
              />
              {potentialPayout && (
                <p className="mt-1 text-xs" style={{ color: 'var(--color-accent)' }}>
                  {t('testLab.potentialPayout')}: {potentialPayout}
                </p>
              )}
            </div>

            <button
              disabled={!canPlaceBet}
              onClick={() => void handlePlaceBet()}
              className="w-full rounded-lg py-2.5 text-sm font-semibold transition-opacity"
              style={{
                backgroundColor: canPlaceBet ? 'var(--color-accent)' : 'var(--color-border)',
                color: canPlaceBet ? '#fff' : 'var(--color-text-muted)',
                border: 'none',
                cursor: canPlaceBet ? 'pointer' : 'default',
                opacity: betLoading ? 0.7 : 1,
              }}
            >
              {betLoading ? <Spinner size="sm" /> : t('testLab.placeBet')}
            </button>
          </div>

          {/* ── Card 2: Settle Market ── */}
          <div
            className="rounded-xl border p-6"
            style={{
              backgroundColor: 'var(--color-bg-surface)',
              borderColor: 'var(--color-border)',
            }}
          >
            <h2
              className="mb-5 text-base font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {t('testLab.settleCard')}
            </h2>

            {/* Market */}
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('testLab.selectMarket')}</label>
              <select
                style={selectStyle}
                value={settleMarketId}
                onChange={(e) => {
                  setSettleMarketId(e.target.value);
                  setSettleOutcomeId('');
                }}
              >
                <option value="">{t('testLab.pickMarket')}</option>
                {markets.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.question.length > 60 ? m.question.slice(0, 60) + '…' : m.question}
                  </option>
                ))}
              </select>
            </div>

            {/* Winning outcome */}
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('testLab.winningOutcome')}</label>
              <select
                style={selectStyle}
                value={settleOutcomeId}
                onChange={(e) => setSettleOutcomeId(e.target.value)}
                disabled={!settleMarketId}
              >
                <option value="">
                  {settleMarketId ? t('testLab.pickOutcome') : t('testLab.selectMarketFirst')}
                </option>
                {settleOutcomes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} — {o.odds.toFixed(2)}x
                  </option>
                ))}
              </select>
            </div>

            <button
              disabled={!canSettle}
              onClick={() => void handleSettle()}
              className="w-full rounded-lg py-2.5 text-sm font-semibold transition-opacity"
              style={{
                backgroundColor: canSettle ? '#7c3aed' : 'var(--color-border)',
                color: canSettle ? '#fff' : 'var(--color-text-muted)',
                border: 'none',
                cursor: canSettle ? 'pointer' : 'default',
                opacity: settleLoading ? 0.7 : 1,
              }}
            >
              {settleLoading ? <Spinner size="sm" /> : t('testLab.settle')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
