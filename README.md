# @lp-labs/booking-availability

Checks finite booking intervals against a unit-capacity limit, including explicit cleanup buffers,
with exact half-open endpoint semantics.

```js
import { createBookingAvailability } from '@lp-labs/booking-availability';

const rooms = createBookingAvailability(2);
rooms.book({
  id: 'stay-1',
  start: 1_800_000_000_000,
  end: 1_800_003_600_000,
  units: 1,
});
console.log(
  rooms.check({
    id: 'stay-2',
    start: 1_800_003_600_000,
    end: 1_800_007_200_000,
    bufferBeforeMs: 15 * 60_000,
  }),
);
```

## Install

```sh
npm install @lp-labs/booking-availability
```

## API

- `createBookingAvailability(capacity): BookingAvailability` creates a process-local ledger with a
  positive integer capacity (up to 1,000,000,000).
- `BookingWindow` requires an `id`, integer `start` and `end` epoch milliseconds (`start < end`),
  and optionally positive `units` (default 1), `bufferBeforeMs`, and `bufferAfterMs` (both default
  0). All intervals are `[start, end)`: a booking ending at the exact instant another begins does
  not overlap.
- `check(window): AvailabilityResult` returns whether the requested units fit, the configured
  `capacity`, peak existing `reservedAtPeak` units during the effective interval, remaining
  `availableUnits`, requested units, and buffer-expanded effective endpoints.
- `book(window)` adds a booking only if it fits. Repeating an active ID with the same interval,
  units, and buffers returns the existing booking; changing its details throws a duplicate error.
- `cancel(id)` removes a booking; `bookings()` returns a copy of the active record list.
- `AvailabilityResult` and `BookingAvailability` describe the query/store surface.
- `AvailabilityError` extends `Error`; its `code` is `invalid`, `capacity`, or `duplicate`.

Inputs must be plain own-data-property records with no unknown fields. Interval timestamps are
numeric epoch milliseconds only: the package does not parse dates, infer a time zone, or interpret
local wall times. At most 10,000 active bookings are retained. Bounds and buffer arithmetic must
remain safe integers. Invalid inputs throw
`AvailabilityError` with code `invalid`; capacity conflicts use `capacity`; active ID reuse uses
`duplicate`.

## Customization and limits

Set buffers per booking to model preparation, cleanup, or turnaround time. A buffer expands occupancy
before the start and after the end; it does not change the stored appointment endpoints. Capacity is
an integer number of interchangeable units, not a calendar, resource type, or recurrence rule.
This ledger is in-memory and single-process; persist and coordinate bookings in an external
transactional system when multiple workers or durable reservations are required.

Package scripts: `npm run build`, `npm run typecheck`, `npm test`, `npm run format`, and
`npm run format:check`. Requires Node.js 18 or newer. There are no runtime or peer dependencies.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
