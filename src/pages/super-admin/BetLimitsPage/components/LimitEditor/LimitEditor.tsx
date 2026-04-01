import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface LimitEditorProps {
  value: number | null;
  onSave: (v: number | null) => Promise<void>;
  isSaving: boolean;
}

export const LimitEditor = ({ value, onSave, isSaving }: LimitEditorProps) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const enterEdit = () => {
    setDraft(value != null ? String(value) : '');
    setEditing(true);
  };

  const cancel = () => setEditing(false);

  const save = async () => {
    const trimmed = draft.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    const next = parsed != null && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    await onSave(next);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void save();
    if (e.key === 'Escape') cancel();
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          ref={inputRef}
          type="number"
          min="0"
          step="any"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          className="w-24 rounded border px-2 py-0.5 text-sm font-mono outline-none focus:ring-1"
          style={{
            backgroundColor: 'var(--color-bg-elevated)',
            color: 'var(--color-text-primary)',
            borderColor: 'var(--color-border)',
          }}
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={isSaving}
          className="rounded px-1.5 py-0.5 text-xs font-medium transition-opacity disabled:opacity-50"
          style={{ color: 'var(--color-win)', backgroundColor: 'var(--color-win-muted)' }}
          aria-label={t('betLimits.save')}
        >
          ✓
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={isSaving}
          className="rounded px-1.5 py-0.5 text-xs font-medium transition-opacity disabled:opacity-50"
          style={{ color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-hover)' }}
          aria-label={t('common.cancel')}
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    <span className="group inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={enterEdit}
        className="font-mono text-sm underline-offset-2 hover:underline"
        style={{
          color: value != null ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {value != null ? value.toFixed(2) : t('betLimits.noLimit')}
      </button>
      {value != null && (
        <button
          type="button"
          onClick={() => void onSave(null)}
          disabled={isSaving}
          className="text-xs opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-30"
          style={{ color: 'var(--color-loss)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          aria-label={t('betLimits.reset')}
          title={t('betLimits.reset')}
        >
          ×
        </button>
      )}
    </span>
  );
};
