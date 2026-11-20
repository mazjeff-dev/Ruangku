import { HttpError } from "./http";

export function assertAttendeeCapacity(attendees: number, capacity: number) {
  if (!Number.isInteger(attendees) || attendees < 1) {
    throw new HttpError(400, "Jumlah peserta minimal 1");
  }
  if (attendees > capacity) {
    throw new HttpError(400, `Jumlah peserta melebihi kapasitas ruangan (maks. ${capacity})`);
  }
}
