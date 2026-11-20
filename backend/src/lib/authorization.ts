export function canReviewBooking(
  role: "ADMIN" | "DOSEN" | "STUDENT",
  reviewerId: number,
  bookingOwnerId: number,
  roomId: number,
  assignedRoomIds: readonly number[],
) {
  if (role === "ADMIN") return true;
  return role === "DOSEN" && reviewerId !== bookingOwnerId && assignedRoomIds.includes(roomId);
}
