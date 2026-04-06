import { Skeleton } from '@/shared/ui/Skeleton';

interface TableSkeletonProps {
  rows?: number;
  cols?: number;
}

export const TableSkeleton = ({ rows = 5, cols = 4 }: TableSkeletonProps) => (
  <div
    className="overflow-hidden rounded-xl border"
    style={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)' }}
  >
    <table className="w-full text-sm">
      <tbody>
        {Array.from({ length: rows }).map((_, ri) => (
          <tr
            key={ri}
            className="border-b last:border-0"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {Array.from({ length: cols }).map((_, ci) => (
              <td key={ci} className="px-4 py-3">
                <Skeleton height={16} width={ci === 0 ? '60%' : '80%'} rounded="sm" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
