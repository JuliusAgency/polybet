import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMyBets } from '@/features/bet';

interface ActiveBetsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ActiveBetsDrawer = ({ isOpen, onClose }: ActiveBetsDrawerProps) => {
  const { t, i18n } = useTranslation();
  const { data: bets, isLoading } = useMyBets();

  const openBets = (bets ?? []).filter((b) => b.status === 'open');
  const totalLocked = openBets.reduce((sum, b) => sum + b.stake, 0);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        style={{ zIndex: 40, backgroundColor: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className="fixed top-0 bottom-0 flex flex-col"
        style={{
          insetInlineEnd: 0,
          zIndex: 41,
          width: '100%',
          maxWidth: '420px',
          backgroundColor: 'var(--color-bg-elevated)',
          borderInlineStart: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-lg)',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {t('wallet.inPlay')}
          </h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-lg"
            style={{ color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading && (
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {t('common.loading')}
            </p>
          )}

          {!isLoading && openBets.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {t('markets.noActiveBets')}
            </p>
          )}

          {!isLoading && openBets.length > 0 && (
            <div className="flex flex-col gap-3">
              {openBets.map((bet) => (
                <div
                  key={bet.id}
                  className="rounded-lg p-3"
                  style={{
                    backgroundColor: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {/* Market question */}
                  <p
                    className="mb-2 text-sm font-medium"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {bet.markets?.question ?? '—'}
                  </p>

                  {/* Outcome */}
                  <p className="mb-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {bet.market_outcomes?.name ?? '—'}
                  </p>

                  {/* Stake / Odds / Payout row */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {t('myBets.wager')}
                      </span>
                      <span className="font-mono text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        {bet.stake.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        @
                      </span>
                      <span className="font-mono text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
                        {bet.locked_odds.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {t('myBets.potentialPayout')}
                      </span>
                      <span className="font-mono text-xs font-semibold" style={{ color: 'var(--color-win)' }}>
                        {bet.potential_payout.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Placed at */}
                  <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {new Date(bet.placed_at).toLocaleString(i18n.language, {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer: total locked */}
        {!isLoading && openBets.length > 0 && (
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ borderTop: '1px solid var(--color-border)' }}
          >
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t('markets.totalLocked')}
            </span>
            <span className="font-mono text-sm font-semibold" style={{ color: 'var(--color-accent)' }}>
              {totalLocked.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </>
  );
};
