import { Skeleton } from '@/shared/ui/Skeleton';

interface CardGridSkeletonProps {
  count?: number;
}

export const CardGridSkeleton = ({ count = 8 }: CardGridSkeletonProps) => (
  // Column breakpoints MUST mirror the real feed grid in MarketsFeedPage /
  // SavedMarketsPage / admin MarketsPage (md:2 / lg:3 / xl:4). If they diverge,
  // the grid re-columns the instant the skeleton is replaced by data, so cards
  // visibly jump/reflow ("ragged" load). Keep these two grids in lockstep.
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className="flex min-h-[256px] flex-col gap-3 rounded-xl border p-4"
        style={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)' }}
      >
        <Skeleton height={14} width="30%" rounded="sm" />
        <Skeleton height={18} width="80%" rounded="sm" />
        <Skeleton height={36} rounded="md" />
        <div className="flex gap-2">
          <Skeleton height={32} width={70} rounded="md" />
          <Skeleton height={32} width={70} rounded="md" />
        </div>
      </div>
    ))}
  </div>
);
