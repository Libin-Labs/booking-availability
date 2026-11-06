import { createBookingAvailability, type BookingWindow } from '@lp-labs/booking-availability';
const availability = createBookingAvailability(3);
const booking: BookingWindow = {
  id: 'room-1',
  start: 1_800_000_000_000,
  end: 1_800_003_600_000,
};
const result = availability.check(booking);
const open: boolean = result.available;
void open;
