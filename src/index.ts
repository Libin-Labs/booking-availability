export interface BookingWindow {
  id: string;
  start: number;
  end: number;
  units?: number;
  bufferBeforeMs?: number;
  bufferAfterMs?: number;
}

export interface AvailabilityResult {
  readonly available: boolean;
  readonly capacity: number;
  readonly reservedAtPeak: number;
  readonly availableUnits: number;
  readonly requestedUnits: number;
  readonly effectiveStart: number;
  readonly effectiveEnd: number;
}

export interface BookingAvailability {
  check(window: BookingWindow): AvailabilityResult;
  book(window: BookingWindow): BookingWindow;
  cancel(id: string): boolean;
  bookings(): BookingWindow[];
}

export class AvailabilityError extends Error {
  constructor(
    readonly code: 'invalid' | 'capacity' | 'duplicate',
    message: string,
  ) {
    super(message);
    this.name = 'AvailabilityError';
  }
}

const MAX_ACTIVE_BOOKINGS = 10_000;

function record(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw new AvailabilityError('invalid', 'Booking must be a plain object.');
  }
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    const descriptor =
      typeof key === 'string' ? Object.getOwnPropertyDescriptor(value, key) : undefined;
    if (
      typeof key !== 'string' ||
      !allowed.includes(key) ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    ) {
      throw new AvailabilityError('invalid', 'Booking has an unsupported or non-data property.');
    }
    result[key] = descriptor.value;
  }
  return result;
}

function positiveInteger(value: unknown, name: string, allowZero = false): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < (allowZero ? 0 : 1) ||
    (value as number) > 1_000_000_000
  ) {
    throw new AvailabilityError(
      'invalid',
      `${name} must be a safe integer from ${allowZero ? 0 : 1} to 1000000000.`,
    );
  }
  return value as number;
}

function checkedWindow(value: unknown): BookingWindow {
  const input = record(value, ['id', 'start', 'end', 'units', 'bufferBeforeMs', 'bufferAfterMs']);
  if (typeof input.id !== 'string' || input.id.length < 1 || input.id.length > 128) {
    throw new AvailabilityError('invalid', 'Booking ID must contain 1..128 characters.');
  }
  if (
    !Number.isSafeInteger(input.start) ||
    !Number.isSafeInteger(input.end) ||
    (input.start as number) >= (input.end as number)
  ) {
    throw new AvailabilityError(
      'invalid',
      'start and end must be increasing safe-integer epoch milliseconds.',
    );
  }
  const units = input.units === undefined ? 1 : positiveInteger(input.units, 'units');
  const bufferBeforeMs =
    input.bufferBeforeMs === undefined
      ? 0
      : positiveInteger(input.bufferBeforeMs, 'bufferBeforeMs', true);
  const bufferAfterMs =
    input.bufferAfterMs === undefined
      ? 0
      : positiveInteger(input.bufferAfterMs, 'bufferAfterMs', true);
  const effectiveStart = (input.start as number) - bufferBeforeMs;
  const effectiveEnd = (input.end as number) + bufferAfterMs;
  if (!Number.isSafeInteger(effectiveStart) || !Number.isSafeInteger(effectiveEnd)) {
    throw new AvailabilityError('invalid', 'Buffered endpoints exceed the safe integer range.');
  }
  return Object.freeze({
    id: input.id,
    start: input.start as number,
    end: input.end as number,
    units,
    bufferBeforeMs,
    bufferAfterMs,
  });
}

function effective(window: BookingWindow): { start: number; end: number } {
  return {
    start: window.start - (window.bufferBeforeMs ?? 0),
    end: window.end + (window.bufferAfterMs ?? 0),
  };
}

export function createBookingAvailability(capacity: number): BookingAvailability {
  const limit = positiveInteger(capacity, 'capacity');
  const active = new Map<string, BookingWindow>();
  const check = (window: BookingWindow): AvailabilityResult => {
    const candidate = checkedWindow(window);
    const span = effective(candidate);
    const points = new Map<number, number>();
    points.set(span.start, 0);
    points.set(span.end, 0);
    for (const current of active.values()) {
      const occupied = effective(current);
      const start = Math.max(span.start, occupied.start);
      const end = Math.min(span.end, occupied.end);
      if (start >= end) continue;
      points.set(start, (points.get(start) ?? 0) + (current.units ?? 1));
      points.set(end, (points.get(end) ?? 0) - (current.units ?? 1));
    }
    const times = [...points.keys()].sort((a, b) => a - b);
    let reserved = 0;
    let peak = 0;
    for (let index = 0; index < times.length - 1; index++) {
      const time = times[index]!;
      reserved += points.get(time)!;
      peak = Math.max(peak, reserved);
    }
    const requestedUnits = candidate.units ?? 1;
    return Object.freeze({
      available: peak + requestedUnits <= limit,
      capacity: limit,
      reservedAtPeak: peak,
      availableUnits: limit - peak,
      requestedUnits,
      effectiveStart: span.start,
      effectiveEnd: span.end,
    });
  };
  return {
    check,
    book(window) {
      const candidate = checkedWindow(window);
      const existing = active.get(candidate.id);
      if (existing) {
        if (
          existing.start === candidate.start &&
          existing.end === candidate.end &&
          existing.units === candidate.units &&
          existing.bufferBeforeMs === candidate.bufferBeforeMs &&
          existing.bufferAfterMs === candidate.bufferAfterMs
        ) {
          return existing;
        }
        throw new AvailabilityError('duplicate', 'An active booking ID cannot be reused.');
      }
      if (active.size >= MAX_ACTIVE_BOOKINGS) {
        throw new AvailabilityError('capacity', 'Active booking limit reached.');
      }
      if (!check(candidate).available) {
        throw new AvailabilityError('capacity', 'Requested booking exceeds available capacity.');
      }
      active.set(candidate.id, candidate);
      return candidate;
    },
    cancel(id) {
      if (typeof id !== 'string' || id.length < 1 || id.length > 128) {
        throw new AvailabilityError('invalid', 'Booking ID must contain 1..128 characters.');
      }
      return active.delete(id);
    },
    bookings() {
      return [...active.values()];
    },
  };
}
