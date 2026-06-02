type EventStatus = 'open' | 'closed' | 'resolved' | 'archived';

interface EventStatusAndCloseAt {
  status: EventStatus;
  close_at: string | null;
}

/**
 * Returns true iff the event's status is 'open'. Authority is `status` (synced
 * from Polymarket), not `close_at` — see entities/market/effectiveStatus.ts for
 * the rationale (Polymarket trades some markets past their stated endDate).
 */
export function isEventEffectivelyOpen(event: EventStatusAndCloseAt): boolean {
  return event.status === 'open';
}

/**
 * Returns the event's own status. close_at no longer overrides status.
 */
export function getEventEffectiveStatus(event: EventStatusAndCloseAt): EventStatus {
  return event.status;
}
