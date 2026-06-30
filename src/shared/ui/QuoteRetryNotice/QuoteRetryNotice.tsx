import { Spinner } from '@/shared/ui/Spinner';
import { Button } from '@/shared/ui/Button';

export interface QuoteRetryNoticeProps {
  /** Clear, user-facing explanation of why the live quote is momentarily missing. */
  message: string;
  /** Label for the manual retry button (e.g. t('common.tryAgain')). */
  retryLabel: string;
  /** True while a quote refetch is in flight — shows the spinner and disables retry. */
  isRetrying: boolean;
  /** Forces an immediate quote refetch. */
  onRetry: () => void;
}

/**
 * Non-terminal "live quote is updating" notice shared by the Buy (BetSlip) and
 * Sell (SellForm) flows. When the order-book quote is momentarily unavailable
 * (the CLOB warm soft-failed or the book has aged out), this presents it as a
 * transient, recoverable state — an auto-retry spinner plus a manual "Try again"
 * — instead of a terminal red error, so the trade flow is never broken and the
 * user can retry once the quote refreshes. Colours come from theme tokens; the
 * layout uses logical utilities so it mirrors correctly in RTL.
 */
export const QuoteRetryNotice = ({
  message,
  retryLabel,
  isRetrying,
  onRetry,
}: QuoteRetryNoticeProps) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-2 rounded-lg border p-3 text-sm"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-base)',
        color: 'var(--color-text-secondary)',
      }}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-0.5 inline-flex w-4 shrink-0 justify-center">
          {isRetrying ? <Spinner size="sm" /> : null}
        </span>
        <span>{message}</span>
      </div>
      <Button
        variant="secondary"
        type="button"
        onClick={onRetry}
        disabled={isRetrying}
        className="self-end text-xs"
      >
        {retryLabel}
      </Button>
    </div>
  );
};
