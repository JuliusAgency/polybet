import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/shared/ui/Modal';
import { Input } from '@/shared/ui/Input';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { usePlaceBet } from '@/features/bet';
import type { Market, MarketOutcome } from '@/entities/market';
import type { EventWithMarkets } from '@/features/bet';

export interface BetSlipProps {
  market: Market;
  outcome: MarketOutcome;
  availableBalance: number;
  onClose: () => void;
  onSuccess: () => void;
}

const parseStake = (value: string): number | null => {
  // Reject anything that isn't a plain decimal number (no commas, no trailing chars)
  if (!/^\d+(\.\d+)?$/.test(value.trim())) return null;
  const n = Number(value);
  return isFinite(n) && n > 0 ? n : null;
};

const getLiveOdds = (
  queryClient: ReturnType<typeof useQueryClient>,
  market: Market,
  outcomeId: string
): number | null => {
  const eventData = queryClient.getQueryData<EventWithMarkets>(['event', market.event_id]);
  if (!eventData) return null;
  const liveMarket = eventData.markets.find((m) => m.id === market.id);
  if (!liveMarket) return null;
  const liveOutcome = liveMarket.market_outcomes?.find((o) => o.id === outcomeId);
  return liveOutcome?.effective_odds ?? null;
};

export const BetSlip = ({
  market,
  outcome,
  availableBalance,
  onClose,
  onSuccess,
}: BetSlipProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [oddsAtConfirm, setOddsAtConfirm] = useState<number | null>(null);

  const { mutate: placeBet, isPending } = usePlaceBet();

  // Lock displayed odds at the moment the slip opened
  const lockedOddsRef = useRef(outcome.effective_odds);
  const displayOdds = oddsAtConfirm ?? lockedOddsRef.current;

  const stake = parseStake(amount);
  const isValidStake = stake !== null;
  const isInsufficient = isValidStake && stake! > availableBalance;
  const potentialPayout = isValidStake && !isInsufficient ? stake! * (displayOdds - 1) : null;
  const balanceIfWin =
    isValidStake && !isInsufficient ? availableBalance - stake! + stake! * displayOdds : null;
  const balanceIfLose = isValidStake && !isInsufficient ? availableBalance - stake! : null;

  const handleAllIn = () => {
    setAmount(availableBalance.toFixed(2));
  };

  const handleConfirm = () => {
    if (isPending) return;
    if (!isValidStake || isInsufficient) return;

    // Detect stale odds: check if live cache has updated prices
    const liveOdds = getLiveOdds(queryClient, market, outcome.id);
    if (liveOdds !== null && Math.abs(liveOdds - displayOdds) > 0.001) {
      // Show updated odds and require a second confirmation
      setOddsAtConfirm(liveOdds);
      setSubmitError(t('markets.oddsChanged', { odds: liveOdds.toFixed(2) }));
      return;
    }

    setSubmitError(null);
    placeBet(
      { marketId: market.id, outcomeId: outcome.id, stake: stake! },
      {
        onSuccess: () => {
          toast.success(
            t('bet.notification.placed', { outcome: outcome.name, stake: stake!.toFixed(2) }),
            {
              duration: 5000,
            }
          );
          onSuccess();
          onClose();
        },
        onError: (err) => {
          setSubmitError(err instanceof Error ? err.message : t('common.unknownError'));
        },
      }
    );
  };

  const isConfirmDisabled = !isValidStake || isInsufficient || isPending;

  return (
    <Modal isOpen onClose={onClose} title={t('markets.betSlipTitle')}>
      <div className="flex flex-col gap-4">
        {/* Market question */}
        <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--color-bg-base)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {market.question}
          </p>
        </div>

        {/* Selected outcome */}
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {outcome.name}
          </span>
          <Badge variant="open">{displayOdds.toFixed(2)}</Badge>
        </div>

        {/* Stake input */}
        <div className="flex flex-col gap-2">
          <Input
            label={t('markets.stakeLabel')}
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            hint={
              !isInsufficient
                ? t('markets.balance', { amount: availableBalance.toFixed(2) })
                : undefined
            }
            error={isInsufficient ? t('markets.insufficientBalance') : undefined}
            placeholder="0.00"
          />

          {/* All In button */}
          <Button
            variant="secondary"
            onClick={handleAllIn}
            type="button"
            className="self-start text-sm"
          >
            {t('markets.allIn')}
          </Button>
        </div>

        {/* Balance preview after bet */}
        {balanceIfWin !== null && balanceIfLose !== null && (
          <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--color-bg-base)' }}>
            <p
              className="mb-2 text-xs font-medium"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {t('markets.afterBet')}
            </p>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  {t('markets.afterBetIfWin')}
                </span>
                <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  <span style={{ color: 'var(--color-win)' }}>{balanceIfWin.toFixed(2)}</span>
                  <span className="mx-1 font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    ←
                  </span>
                  <span style={{ color: 'var(--color-text-primary)' }}>
                    {availableBalance.toFixed(2)}
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  {t('markets.afterBetIfLose')}
                </span>
                <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  <span style={{ color: 'var(--color-error)' }}>{balanceIfLose.toFixed(2)}</span>
                  <span className="mx-1 font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    ←
                  </span>
                  <span style={{ color: 'var(--color-text-primary)' }}>
                    {availableBalance.toFixed(2)}
                  </span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Potential payout */}
        {potentialPayout !== null && (
          <div
            className="flex items-center justify-between rounded-lg p-3"
            style={{ backgroundColor: 'var(--color-bg-base)' }}
          >
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {t('markets.potentialPayout')}
            </span>
            <span className="text-sm font-semibold" style={{ color: 'var(--color-win)' }}>
              {potentialPayout.toFixed(2)}
            </span>
          </div>
        )}

        {/* Submit error */}
        {submitError && (
          <p className="text-sm" style={{ color: 'var(--color-error)' }}>
            {submitError}
          </p>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className="flex-1"
          >
            {isPending ? t('common.saving') : t('markets.confirmBet')}
          </Button>
          <Button variant="secondary" onClick={onClose} type="button">
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
