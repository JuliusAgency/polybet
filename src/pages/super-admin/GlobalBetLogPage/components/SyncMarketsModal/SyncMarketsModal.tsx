import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DbSyncRun } from '@/shared/types/database';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { ProgressBar } from '@/shared/ui/ProgressBar';
import { useSyncMarkets, useSyncRun } from '@/features/admin/settlement';
import { SYNC_SCOPE_OPTIONS, getSyncRunProgressPercent, isSyncRunTerminal } from '@/features/admin/settlement/syncRunUi';

interface SyncMarketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleted?: (run: DbSyncRun) => void;
}

export const SyncMarketsModal = ({ isOpen, onClose, onCompleted }: SyncMarketsModalProps) => {
  const { t } = useTranslation();
  const [selectedMaxPages, setSelectedMaxPages] = useState<number>(1);
  const [runId, setRunId] = useState<string | null>(null);
  const syncMutation = useSyncMarkets();
  const runQuery = useSyncRun(runId);
  const reportedRunIdRef = useRef<string | null>(null);

  const run = runQuery.data;
  const isRunTerminal = run ? isSyncRunTerminal(run.status) : false;
  const isRunning = syncMutation.isPending || (!!run && !isRunTerminal);
  const progressPercent = getSyncRunProgressPercent({
    status: run?.status ?? 'running',
    progress_current: run?.progress_current ?? 0,
    progress_total: run?.progress_total ?? 0,
  });

  useEffect(() => {
    if (!isRunning) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isRunning]);

  useEffect(() => {
    if (!run || !isSyncRunTerminal(run.status)) return;
    if (reportedRunIdRef.current === run.id) return;

    reportedRunIdRef.current = run.id;
    onCompleted?.(run);
  }, [onCompleted, run]);

  useEffect(() => {
    if (isOpen) return;

    setRunId(null);
    setSelectedMaxPages(1);
    syncMutation.reset();
    reportedRunIdRef.current = null;
  }, [isOpen, syncMutation]);

  const handleStart = () => {
    const nextRunId = crypto.randomUUID();
    setRunId(nextRunId);
    syncMutation.mutate({
      maxPages: selectedMaxPages,
      runId: nextRunId,
    });
  };

  const handleClose = () => {
    if (isRunning) return;
    onClose();
  };

  const phaseLabel = useMemo(() => {
    if (!run) return t('settlement.phase.starting');
    return t(`settlement.phase.${run.phase}`, { defaultValue: run.phase });
  }, [run, t]);

  const statusTone = run?.status === 'failed' ? 'var(--color-loss)' : 'var(--color-text-secondary)';
  const canStart = !syncMutation.isPending && !runId;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('settlement.syncModalTitle')}
      closeDisabled={isRunning}
    >
      {!runId && (
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t('settlement.syncModalDescription')}
          </p>

          <div className="grid grid-cols-1 gap-3">
            {SYNC_SCOPE_OPTIONS.map((option) => {
              const isActive = selectedMaxPages === option.maxPages;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedMaxPages(option.maxPages)}
                  className="rounded-xl border px-4 py-3 text-start transition-colors"
                  style={{
                    borderColor: isActive ? 'var(--color-accent)' : 'var(--color-border)',
                    backgroundColor: isActive ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'var(--color-bg-surface)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  <div className="text-sm font-semibold">{t(option.labelKey)}</div>
                  <div className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {t(
                      option.maxPages === 0
                        ? 'settlement.scopeHintAll'
                        : 'settlement.scopeHintPages',
                      { count: option.maxPages },
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div
            className="rounded-xl border px-4 py-3 text-sm"
            style={{
              borderColor: 'color-mix(in srgb, var(--color-loss) 30%, var(--color-border))',
              backgroundColor: 'color-mix(in srgb, var(--color-loss) 10%, transparent)',
              color: 'var(--color-text-primary)',
            }}
          >
            <p className="font-medium">{t('settlement.keepOpenTitle')}</p>
            <p className="mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              {t('settlement.keepOpenDescription')}
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" type="button" onClick={handleStart} disabled={!canStart}>
              {t('settlement.startSync')}
            </Button>
          </div>
        </div>
      )}

      {runId && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {t('settlement.currentPhase')}
                </p>
                <p className="text-sm" style={{ color: statusTone }}>
                  {phaseLabel}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {progressPercent}%
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('settlement.progressCount', {
                    current: run?.progress_current ?? 0,
                    total: run?.progress_total ?? 0,
                  })}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <ProgressBar value={progressPercent} />
            </div>
          </div>

          <div
            className="grid grid-cols-3 gap-3 rounded-xl border px-4 py-3"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {[
              { label: t('settlement.syncedCount'), value: run?.markets_synced ?? 0 },
              { label: t('settlement.outcomesCount'), value: run?.outcomes_updated ?? 0 },
              { label: t('settlement.settledCount'), value: run?.markets_settled ?? 0 },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {item.label}
                </p>
                <p className="mt-1 text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          <div
            className="rounded-xl border px-4 py-3 text-sm"
            style={{
              borderColor: 'color-mix(in srgb, var(--color-loss) 30%, var(--color-border))',
              backgroundColor: 'color-mix(in srgb, var(--color-loss) 10%, transparent)',
              color: 'var(--color-text-primary)',
            }}
          >
            <p className="font-medium">{t('settlement.keepOpenTitle')}</p>
            <p className="mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              {t(isRunning ? 'settlement.keepOpenRunning' : 'settlement.keepOpenDone')}
            </p>
          </div>

          {!!run?.errors.length && (
            <div className="rounded-xl border px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {t('settlement.errorListTitle')}
              </p>
              <ul className="mt-2 flex flex-col gap-2 text-sm" style={{ color: 'var(--color-loss)' }}>
                {run.errors.slice(0, 5).map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {syncMutation.error && (
            <p role="alert" className="text-sm" style={{ color: 'var(--color-loss)' }}>
              {syncMutation.error.message}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            {isRunTerminal && (
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setRunId(null);
                  syncMutation.reset();
                  reportedRunIdRef.current = null;
                }}
              >
                {t('settlement.runAgain')}
              </Button>
            )}
            <Button
              variant="primary"
              type="button"
              onClick={handleClose}
              disabled={isRunning}
            >
              {isRunTerminal ? t('common.done') : t('common.processing')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
