import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/shared/ui/Modal';
import { Input } from '@/shared/ui/Input';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { usePlaceBet } from '@/features/bet';
import type { Market, MarketOutcome } from '@/features/bet';

interface BetSlipProps {
  market: Market;
  outcome: MarketOutcome;
  availableBalance: number;
  inPlay: number;
  onClose: () => void;
  onSuccess: () => void;
}

export const BetSlip = ({
  market,
  outcome,
  availableBalance,
  inPlay,
  onClose,
  onSuccess,
}: BetSlipProps) => {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { mutate: placeBet, isPending } = usePlaceBet();

  const stake = parseFloat(amount);
  const isValidStake = !isNaN(stake) && stake > 0;
  const isInsufficient = isValidStake && stake > availableBalance;
  const potentialPayout = isValidStake && !isInsufficient ? stake * outcome.effective_odds : null;
  const projectedAvailable = isValidStake && !isInsufficient ? availableBalance - stake : null;
  const projectedInPlay = isValidStake && !isInsufficient ? inPlay + stake : null;

  const handleAllIn = () => {
    setAmount(availableBalance.toFixed(2));
  };

  const handleConfirm = () => {
    if (!isValidStake || isInsufficient) return;
    setSubmitError(null);

    placeBet(
      { marketId: market.id, outcomeId: outcome.id, stake },
      {
        onSuccess: () => {
          onSuccess();
          onClose();
        },
        onError: (err) => {
          setSubmitError(err instanceof Error ? err.message : t('common.unknownError'));
        },
      },
    );
  };

  const isConfirmDisabled = !isValidStake || isInsufficient || isPending;

  return (
    <Modal isOpen onClose={onClose} title={t('markets.betSlipTitle')}>
      <div className="flex flex-col gap-4">
        {/* Market question */}
        <div
          className="rounded-lg p-3"
          style={{ backgroundColor: 'var(--color-bg-base)' }}
        >
          <p
            className="text-sm font-medium"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {market.question}
          </p>
        </div>

        {/* Selected outcome */}
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {outcome.name}
          </span>
          <Badge variant="open">{outcome.odds.toFixed(2)}</Badge>
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
        {projectedAvailable !== null && projectedInPlay !== null && (
          <div
            className="rounded-lg p-3"
            style={{ backgroundColor: 'var(--color-bg-base)' }}
          >
            <p className="mb-2 text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t('markets.afterBet')}
            </p>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--color-text-secondary)' }}>{t('markets.afterBetAvailable')}</span>
                <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  {availableBalance.toFixed(2)}
                  {' → '}
                  <span style={{ color: 'var(--color-text-primary)' }}>{projectedAvailable.toFixed(2)}</span>
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--color-text-secondary)' }}>{t('markets.afterBetInPlay')}</span>
                <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  {inPlay.toFixed(2)}
                  {' → '}
                  <span style={{ color: 'var(--color-accent)' }}>{projectedInPlay.toFixed(2)}</span>
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
            <span
              className="text-sm font-semibold"
              style={{ color: 'var(--color-win)' }}
            >
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
