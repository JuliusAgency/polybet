import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MarketEvent } from '@/features/bet';
import { MarketThumbnail } from '@/shared/ui/MarketThumbnail';
import { formatVolume } from '@/shared/utils';

interface SimilarEventsListProps {
  events: MarketEvent[];
  isLoading?: boolean;
}

export const SimilarEventsList = ({ events, isLoading = false }: SimilarEventsListProps) => {
  const { t, i18n } = useTranslation();
  const isHebrew = i18n.language === 'he';

  if (!isLoading && events.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2
        className="text-lg font-semibold"
        style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}
      >
        {t('eventDetail.similar', { defaultValue: 'Similar events' })}
      </h2>

      {isLoading ? (
        <div
          className="rounded-md p-4 text-sm"
          style={{
            backgroundColor: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          {t('common.loading', { defaultValue: 'Loading…' })}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => {
            const vol = formatVolume(e.volume ?? null);
            return (
              <li key={e.id}>
                <Link
                  to={`/events/${e.id}`}
                  className="flex items-start gap-3 p-3 transition-colors hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-lg)',
                    transitionDuration: 'var(--duration-fast)',
                  }}
                >
                  <MarketThumbnail src={e.image_url} title={e.title} id={e.id} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p
                      className="line-clamp-2 text-sm font-medium"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {e.title}
                    </p>
                    <div
                      className="mt-1 flex flex-wrap items-center gap-2 text-[11px]"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {e.tag_label && (
                        <span
                          className={`rounded px-1.5 py-0.5 ${isHebrew ? '' : 'uppercase'}`}
                          style={{
                            backgroundColor: 'var(--color-bg-elevated)',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          {e.tag_label}
                        </span>
                      )}
                      {e.category && <span className={isHebrew ? '' : 'uppercase'}>{e.category}</span>}
                      {vol && (
                        <span className="font-mono">
                          {t('markets.volumeShort', { value: vol })}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
