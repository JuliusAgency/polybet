import { useTranslation } from 'react-i18next';
import { Modal } from '@/shared/ui/Modal';
import type { Position } from '@/entities/position';
import { SellForm } from '@/features/bet';

export interface SellSlipProps {
  position: Position;
  onClose: () => void;
  onSuccess?: () => void;
}

/** Standalone sell modal (opened from the Portfolio). The form body lives in
 *  SellForm so it can be reused inline inside the BetSlip Sell tab. */
export const SellSlip = ({ position, onClose, onSuccess }: SellSlipProps) => {
  const { t } = useTranslation();
  return (
    <Modal isOpen onClose={onClose} title={t('portfolio.sellTitle')}>
      <SellForm position={position} onClose={onClose} onSuccess={onSuccess} />
    </Modal>
  );
};
