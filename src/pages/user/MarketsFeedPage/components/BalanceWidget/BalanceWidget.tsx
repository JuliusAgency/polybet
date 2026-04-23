import { useTranslation } from 'react-i18next';
import { Spinner } from '@/shared/ui/Spinner';

interface BalanceWidgetProps {
  available: number;
  inPlay: number;
  openBetsCount: number;
  isLoading: boolean;
  onOpenDrawer: () => void;
  onOpenSaved?: () => void;
  savedCount?: number;
}

export const BalanceWidget = ({
  available,
  inPlay,
  openBetsCount,
  isLoading,
  onOpenDrawer,
  onOpenSaved,
  savedCount,
}: BalanceWidgetProps) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div
        className="mb-4 flex items-center gap-4 rounded-lg px-4 py-2.5"
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
        }}
      >
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg px-4 py-2.5"
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* Available balance */}
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {t('wallet.available')}
        </span>
        <span
          className="font-mono text-sm font-semibold"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {available.toFixed(2)}
        </span>
      </div>

      {/* Divider */}
      <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--color-border)' }} />

      {/* In-play balance — clickable */}
      <button
        onClick={onOpenDrawer}
        className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          outline: 'none',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-bg-elevated)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
        }}
      >
        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {t('wallet.inPlay')}
        </span>
        <span
          className="font-mono text-sm font-semibold"
          style={{ color: inPlay > 0 ? 'var(--color-accent)' : 'var(--color-text-primary)' }}
        >
          {inPlay.toFixed(2)}
        </span>
        {openBetsCount > 0 && (
          <span
            className="rounded-full px-1.5 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-bg-base)',
            }}
          >
            {t('markets.activeBets_other', { count: openBetsCount })}
          </span>
        )}
        {/* chevron-down icon */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Saved markets — pinned to the inline-end edge */}
      {onOpenSaved && (
        <button
          onClick={onOpenSaved}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            outline: 'none',
            marginInlineStart: 'auto',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              'var(--color-bg-elevated)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
          }}
          aria-label={t('markets.savedButton')}
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
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {t('markets.savedButton')}
          </span>
          {typeof savedCount === 'number' && savedCount > 0 && (
            <span
              className="rounded-full px-1.5 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-bg-base)',
              }}
            >
              {savedCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
};
