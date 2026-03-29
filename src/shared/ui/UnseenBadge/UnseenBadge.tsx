interface UnseenBadgeProps {
  count: number;
}

export const UnseenBadge = ({ count }: UnseenBadgeProps) => {
  if (count === 0) return null;

  return (
    <span
      className="animate-pulse"
      style={{
        position: 'absolute',
        top: '-6px',
        insetInlineEnd: '-8px',
        minWidth: '18px',
        height: '18px',
        padding: '0 4px',
        borderRadius: '9px',
        backgroundColor: 'var(--color-loss)',
        color: '#fff',
        fontSize: '11px',
        fontWeight: 700,
        lineHeight: '18px',
        textAlign: 'center',
        pointerEvents: 'none',
      }}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
};
