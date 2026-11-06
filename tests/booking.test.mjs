import test from 'node:test';
import assert from 'node:assert/strict';
import { AvailabilityError, createBookingAvailability } from '../dist/esm/index.js';

test('treats finite epoch-millisecond windows as half-open at touching endpoints', () => {
  const availability = createBookingAvailability(1);
  availability.book({ id: 'first', start: 10, end: 20 });
  assert.equal(availability.check({ id: 'touching', start: 20, end: 30 }).available, true);
});

test('detects overlapping windows and reports exact reserved capacity', () => {
  const availability = createBookingAvailability(4);
  availability.book({ id: 'existing', start: 10, end: 20, units: 2 });
  const result = availability.check({
    id: 'next',
    start: 15,
    end: 25,
    units: 3,
  });
  assert.deepEqual(
    [result.available, result.reservedAtPeak, result.availableUnits, result.requestedUnits],
    [false, 2, 2, 3],
  );
});

test('uses the maximum overlapping occupancy only within the candidate window', () => {
  const availability = createBookingAvailability(5);
  availability.book({ id: 'early', start: 0, end: 5, units: 4 });
  availability.book({ id: 'inside', start: 12, end: 18, units: 2 });
  availability.book({ id: 'late', start: 20, end: 25, units: 5 });
  assert.equal(
    availability.check({ id: 'candidate', start: 10, end: 20, units: 3 }).available,
    true,
  );
  assert.equal(
    availability.check({ id: 'candidate2', start: 10, end: 20, units: 3 }).reservedAtPeak,
    2,
  );
});

test('buffers expand occupancy and enforce exact touching boundaries', () => {
  const availability = createBookingAvailability(1);
  availability.book({
    id: 'clean',
    start: 20,
    end: 30,
    bufferBeforeMs: 5,
    bufferAfterMs: 5,
  });
  assert.equal(availability.check({ id: 'touch', start: 10, end: 15 }).available, true);
  assert.equal(availability.check({ id: 'blocked', start: 14, end: 16 }).available, false);
  assert.equal(availability.check({ id: 'after', start: 35, end: 40 }).available, true);
});

test('books capacity atomically, is idempotent for identical IDs, and cancels', () => {
  const availability = createBookingAvailability(2);
  const request = { id: 'a', start: 1, end: 2, units: 2 };
  const first = availability.book(request);
  assert.equal(availability.book(request), first);
  assert.throws(() => availability.book({ id: 'b', start: 1, end: 2 }), AvailabilityError);
  assert.equal(availability.cancel('a'), true);
  assert.equal(availability.cancel('a'), false);
  assert.equal(availability.bookings().length, 0);
});

test('rejects reused IDs whose booking details differ', () => {
  const availability = createBookingAvailability(2);
  availability.book({ id: 'same', start: 1, end: 3 });
  assert.throws(
    () => availability.book({ id: 'same', start: 1, end: 4 }),
    (error) => error.code === 'duplicate',
  );
});

test('rejects local date strings and accepts only explicit integer instants', () => {
  const availability = createBookingAvailability(1);
  assert.throws(
    () => availability.check({ id: 'bad', start: '2026-01-01', end: 100 }),
    /safe-integer epoch/,
  );
  assert.throws(() => availability.check({ id: 'bad', start: 0.5, end: 1 }), /safe-integer epoch/);
});

test('rejects invalid endpoints, units, buffers, and options', () => {
  const availability = createBookingAvailability(1);
  assert.throws(() => availability.check({ id: 'bad', start: 2, end: 2 }), AvailabilityError);
  assert.throws(
    () => availability.check({ id: 'bad', start: 1, end: 2, units: 0 }),
    AvailabilityError,
  );
  assert.throws(
    () => availability.check({ id: 'bad', start: 1, end: 2, bufferBeforeMs: -1 }),
    AvailabilityError,
  );
  assert.throws(
    () => availability.check({ id: 'bad', start: 1, end: 2, unknown: true }),
    AvailabilityError,
  );
});

test('rejects invalid capacity and accessor booking properties', () => {
  assert.throws(() => createBookingAvailability(0), AvailabilityError);
  const request = { id: 'bad', start: 1, end: 2 };
  Object.defineProperty(request, 'units', { enumerable: true, get: () => 1 });
  assert.throws(() => createBookingAvailability(2).check(request), /non-data/);
});

test('validates cancellation identifiers and keeps bookings isolated', () => {
  const availability = createBookingAvailability(2);
  availability.book({ id: 'a', start: 1, end: 4 });
  assert.throws(() => availability.cancel(''), /Booking ID/);
  assert.deepEqual(
    availability.bookings().map((booking) => booking.id),
    ['a'],
  );
});

test('bounds active booking state', () => {
  const availability = createBookingAvailability(1);
  for (let index = 0; index < 10_000; index++) {
    availability.book({
      id: `booking-${index}`,
      start: index * 2,
      end: index * 2 + 1,
    });
  }
  assert.throws(
    () => availability.book({ id: 'one-too-many', start: 20_000, end: 20_001 }),
    (error) => error.code === 'capacity',
  );
});
