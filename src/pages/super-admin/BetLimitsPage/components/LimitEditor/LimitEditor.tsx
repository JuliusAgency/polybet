import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface LimitEditorProps {
  value: number | null;
  onSave: (v: number | null) => Promise<void>;
  isSaving: boolean;
}

const PencilIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M8.5 1.5a1.414 1.414 0 0 1 2 2L4 10H2v-2L8.5 1.5Z"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

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
        className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm transition-colors hover:bg-[var(--color-hover)]"
        style={{
          color: value != null ? 'var(--color-text-primary)' : 'var(--color-accent)',
          background: 'none',
          border: '1px dashed',
          borderColor: 'var(--color-border)',
          cursor: 'pointer',
        }}
      >
        <span className="font-mono">
          {value != null ? value.toFixed(2) : t('betLimits.noLimit')}
        </span>
        <span style={{ color: 'var(--color-text-muted)' }}>
          <PencilIcon />
        </span>
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
