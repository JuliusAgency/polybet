import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useSystemSetting,
  useUpdateSystemSetting,
} from '@/features/admin/settings/useSystemSettings';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';

const ARCHIVE_AFTER_HOURS_KEY = 'archive_after_hours';
const DEFAULT_ARCHIVE_AFTER_HOURS = 168;

export const SettingsPage = () => {
  const { t } = useTranslation();
  const { data: archiveAfterHoursValue, isLoading } =
    useSystemSetting<number>(ARCHIVE_AFTER_HOURS_KEY);
  const updateSetting = useUpdateSystemSetting<number>(ARCHIVE_AFTER_HOURS_KEY);

  const [inputValue, setInputValue] = useState<string>(String(DEFAULT_ARCHIVE_AFTER_HOURS));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (archiveAfterHoursValue != null) {
      setInputValue(String(archiveAfterHoursValue));
    }
  }, [archiveAfterHoursValue]);

  const handleSave = () => {
    const parsed = parseInt(inputValue, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    updateSetting.mutate(parsed, {
      onSuccess: () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      },
    });
  };

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      <h1 className="mb-6 text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
        {t('settings.title')}
      </h1>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="md" />
        </div>
      )}

      {!isLoading && (
        <div
          className="max-w-lg rounded-lg p-6"
          style={{
            backgroundColor: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div className="mb-4">
            <label
              className="block mb-1 text-sm font-medium"
              style={{ color: 'var(--color-text-primary)' }}
              htmlFor="archive-after-hours"
            >
              {t('settings.archiveAfterHours')}
            </label>
            <p className="mb-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {t('settings.archiveAfterHoursDesc')}
            </p>
            <input
              id="archive-after-hours"
              type="number"
              min={1}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="w-full rounded px-3 py-2 text-sm"
              style={{
                backgroundColor: 'var(--color-bg-base)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
              }}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={updateSetting.isPending}>
              {updateSetting.isPending ? t('common.saving') : t('settings.save')}
            </Button>

            {saved && (
              <span className="text-sm" style={{ color: 'var(--color-success, #22c55e)' }}>
                {t('settings.saved')}
              </span>
            )}

            {updateSetting.isError && (
              <span className="text-sm" style={{ color: 'var(--color-error)' }}>
                {t('common.error')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
