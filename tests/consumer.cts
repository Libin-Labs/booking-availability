import { AvailabilityError, createBookingAvailability } from '@lp-labs/booking-availability';
const availability = createBookingAvailability(1);
try {
  availability.book({ id: 'x', start: 1, end: 2 });
} catch (error) {
  if (error instanceof AvailabilityError) console.log(error.code);
}
