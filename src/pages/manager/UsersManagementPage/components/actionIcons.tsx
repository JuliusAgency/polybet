/* Inline icons for the manager Users row actions + Create User CTA. Stroke uses
 * currentColor so each icon inherits its ActionButton tone (including the
 * destructive red-ghost colour flip on hover). Sized by ActionButton CSS. */

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const PlusIcon = () => (
  <svg {...base}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const PencilIcon = () => (
  <svg {...base}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export const KeyIcon = () => (
  <svg {...base}>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="m10.5 12.5 8-8" />
    <path d="m16 6 2 2" />
    <path d="m19 3 2 2" />
  </svg>
);

// Deposit — money in (arrow down into the account).
export const ArrowDownIcon = () => (
  <svg {...base}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <polyline points="19 12 12 19 5 12" />
  </svg>
);

// Withdraw — money out (arrow up out of the account).
export const ArrowUpIcon = () => (
  <svg {...base}>
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);

// Block — ban / no-entry.
export const BanIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
  </svg>
);

// Unblock — restore access.
export const CheckIcon = () => (
  <svg {...base}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
