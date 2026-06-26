import { useTranslation } from 'react-i18next';

interface EventRulesProps {
  /** Free-text rules / description. May contain long unbroken strings (URLs). */
  description: string;
}

/**
 * Rules / "About" block for the event detail page. Polymarket places this at the
 * BOTTOM of the page (below the markets list), so both the multi-market and the
 * single-market layouts render it last.
 *
 * The body uses `overflow-wrap: anywhere` so long unbreakable strings — pasted
 * URLs like `https://x.com/.../status/2062652114430...` — wrap inside the card
 * instead of bleeding past its right edge and breaking the mobile layout.
 */
export const EventRules = ({ description }: EventRulesProps) => {
  const { t, i18n } = useTranslation();
  const isHebrew = i18n.language === 'he';

  // Guard blank / whitespace-only descriptions here so every call site behaves
  // the same (no empty "Rules" card).
  if (!description || description.trim().length === 0) return null;

  return (
    <section
      className="flex flex-col gap-2 p-4"
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        {t('eventDetail.rules', { defaultValue: 'Rules' })}
      </h3>
      <p
        className="min-w-0 whitespace-pre-line break-words text-sm leading-relaxed"
        style={{
          color: 'var(--color-text-secondary)',
          // Break long unbreakable tokens (URLs) so they never overflow the card.
          overflowWrap: 'anywhere',
          // Polymarket rules text is English; LTR flow + end-aligned keeps
          // punctuation correct inside the RTL layout.
          ...(isHebrew && { direction: 'ltr' as const, textAlign: 'right' as const }),
        }}
      >
        {description}
      </p>
    </section>
  );
};
