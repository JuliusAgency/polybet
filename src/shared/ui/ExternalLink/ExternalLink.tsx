import type { ReactNode } from 'react';

interface ExternalLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}

/**
 * Accessible external link that opens in a new tab. Renders the children
 * followed by a small external-link icon. Uses the accent theme token for
 * colour (works in both light and dark themes). Always sets
 * rel="noopener noreferrer" to prevent tab-napping / referrer leakage.
 */
export const ExternalLink = ({
  href,
  children,
  className,
  'aria-label': ariaLabel,
}: ExternalLinkProps) => {
  // Defensive: only allow https targets so an untrusted href can never inject a
  // javascript:/data: protocol. Callers should pass a fully-qualified https URL.
  const safeHref = href.startsWith('https://') ? href : '#';

  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 hover:underline ${className ?? ''}`}
      style={{ color: 'var(--color-accent)' }}
      aria-label={ariaLabel}
    >
      {children}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0"
      >
        <path d="M7 17 17 7" />
        <path d="M7 7h10v10" />
      </svg>
    </a>
  );
};
