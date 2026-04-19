import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supabase } from '@/shared/api/supabase';
import { Spinner } from '@/shared/ui/Spinner';

interface ChildMarketDraft {
  question: string;
  groupLabel: string;
  yesPrice: string; // 0..1 as string for input
}

interface CreateDemoEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const DEFAULT_MARKETS: ChildMarketDraft[] = [
  { question: 'Resolved by Apr 30', groupLabel: 'by Apr 30', yesPrice: '0.35' },
  { question: 'Resolved by May 31', groupLabel: 'by May 31', yesPrice: '0.55' },
];

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-bg-base)',
  color: 'var(--color-text-primary)',
  fontSize: '14px',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '4px',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--color-text-secondary)',
};

export const CreateDemoEventModal = ({ isOpen, onClose, onCreated }: CreateDemoEventModalProps) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState('Demo event: will X happen?');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Demo');
  const [children, setChildren] = useState<ChildMarketDraft[]>(DEFAULT_MARKETS);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const updateChild = (index: number, patch: Partial<ChildMarketDraft>) => {
    setChildren((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const addChild = () => {
    setChildren((prev) => [
      ...prev,
      { question: 'New nested market', groupLabel: 'label', yesPrice: '0.5' },
    ]);
  };

  const removeChild = (index: number) => {
    setChildren((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error(t('testLab.event.errTitleRequired', { defaultValue: 'Title is required' }));
      return;
    }
    if (children.length === 0) {
      toast.error(t('testLab.event.errAtLeastOne', { defaultValue: 'Add at least one market' }));
      return;
    }

    const markets = children.map((c) => {
      const yes = Math.min(0.99, Math.max(0.01, parseFloat(c.yesPrice) || 0.5));
      const no = 1 - yes;
      return {
        question: c.question.trim(),
        group_label: c.groupLabel.trim() || null,
        outcomes: [
          { name: 'Yes', price: yes },
          { name: 'No', price: no },
        ],
      };
    });

    setLoading(true);
    const { error } = await supabase.rpc('admin_create_demo_event', {
      p_title: title.trim(),
      p_description: description.trim() || null,
      p_category: category.trim() || null,
      p_markets: markets,
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(t('testLab.event.created', { defaultValue: 'Demo event created' }));
    onCreated();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl"
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-3"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {t('testLab.event.modalTitle', { defaultValue: 'Create demo event' })}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-lg"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            ×
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          <div className="mb-4">
            <label style={labelStyle}>
              {t('testLab.event.title', { defaultValue: 'Event title' })}
            </label>
            <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label style={labelStyle}>
                {t('testLab.event.category', { defaultValue: 'Category' })}
              </label>
              <input
                style={inputStyle}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>
                {t('testLab.event.description', { defaultValue: 'Description' })}
              </label>
              <input
                style={inputStyle}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {t('testLab.event.childMarkets', { defaultValue: 'Nested markets' })}
            </h3>
            <button
              onClick={addChild}
              className="rounded-lg px-2 py-1 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--color-bg-base)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-accent)',
              }}
            >
              + {t('testLab.event.addMarket', { defaultValue: 'Add market' })}
            </button>
          </div>

          <div className="space-y-3">
            {children.map((child, i) => (
              <div
                key={i}
                className="rounded-lg p-3"
                style={{
                  backgroundColor: 'var(--color-bg-base)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    #{i + 1}
                  </span>
                  {children.length > 1 && (
                    <button
                      onClick={() => removeChild(i)}
                      className="text-xs"
                      style={{ color: 'var(--color-loss, #ef4444)' }}
                    >
                      {t('common.remove', { defaultValue: 'Remove' })}
                    </button>
                  )}
                </div>
                <div className="mb-2">
                  <label style={labelStyle}>
                    {t('testLab.event.childQuestion', { defaultValue: 'Question' })}
                  </label>
                  <input
                    style={inputStyle}
                    value={child.question}
                    onChange={(e) => updateChild(i, { question: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label style={labelStyle}>
                      {t('testLab.event.childLabel', { defaultValue: 'Label (shown in group)' })}
                    </label>
                    <input
                      style={inputStyle}
                      value={child.groupLabel}
                      onChange={(e) => updateChild(i, { groupLabel: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>
                      {t('testLab.event.yesPrice', { defaultValue: 'Yes probability (0..1)' })}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="0.99"
                      style={inputStyle}
                      value={child.yesPrice}
                      onChange={(e) => updateChild(i, { yesPrice: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          className="flex justify-end gap-2 border-t px-5 py-3"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
            style={{
              backgroundColor: 'var(--color-bg-base)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            disabled={loading}
            onClick={() => void handleSubmit()}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: '#fff',
              border: 'none',
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? (
              <Spinner size="sm" />
            ) : (
              t('testLab.event.create', { defaultValue: 'Create event' })
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
