interface UnseenBadgeProps {
  count: number;
}

export const UnseenBadge = ({ count }: UnseenBadgeProps) => {
  if (count === 0) return null;

  return (
    <span
      className=""
      style={{
        position: 'absolute',
        top: '2px',
        insetInlineEnd: '-6px',
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        backgroundColor: 'var(--color-loss)',
        pointerEvents: 'none',
      }}
    />
  );
};
