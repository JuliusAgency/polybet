type EventStatus = 'open' | 'closed' | 'resolved' | 'archived';

interface EventStatusAndCloseAt {
  status: EventStatus;
  close_at: string | null;
}

/**
 * Returns true iff the event's status is 'open' AND close_at has not passed.
 */
export function isEventEffectivelyOpen(event: EventStatusAndCloseAt): boolean {
  if (event.status !== 'open') return false;
  if (event.close_at != null && new Date(event.close_at).getTime() <= Date.now()) return false;
  return true;
}

/**
 * Returns 'closed' when an event's status is 'open' but close_at has passed,
 * otherwise returns the row's own status. Used by EventCard for status pill rendering.
 */
export function getEventEffectiveStatus(event: EventStatusAndCloseAt): EventStatus {
  if (
    event.status === 'open' &&
    event.close_at != null &&
    new Date(event.close_at).getTime() <= Date.now()
  ) {
    return 'closed';
  }
  return event.status;
}
