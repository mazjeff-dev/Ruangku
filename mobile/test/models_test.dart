import 'package:flutter_test/flutter_test.dart';
import 'package:ruangku/core/format.dart';
import 'package:ruangku/models/models.dart';

void main() {
  group('Waktu WIB', () {
    test('fromWib lalu toWib mengembalikan jam dinding yang sama', () {
      final instant = fromWib(2026, 11, 3, 9, 30);
      expect(instant.isUtc, isTrue);
      expect(instant.hour, 2); // 09:30 WIB = 02:30 UTC
      final wib = toWib(instant);
      expect(wib.hour, 9);
      expect(wib.minute, 30);
    });

    test('dateKey berformat YYYY-MM-DD', () {
      expect(dateKey(DateTime(2026, 1, 5)), '2026-01-05');
    });

    test('initials mengambil dua huruf awal', () {
      expect(initials('Romeo Djefzy Romadhoni'), 'RD');
      expect(initials(''), '?');
    });
  });

  group('Model', () {
    test('Room.facilityList memecah fasilitas', () {
      final room = Room(id: 1, name: 'R', code: 'R1', location: 'L', capacity: 10, facilities: 'Proyektor, AC , Wi-Fi');
      expect(room.facilityList, ['Proyektor', 'AC', 'Wi-Fi']);
    });

    test('Booking.fromJson membaca status dan ruangan', () {
      final b = Booking.fromJson({
        'id': 7,
        'title': 'Rapat',
        'purpose': 'Koordinasi',
        'startTime': '2027-11-03T02:00:00.000Z',
        'endTime': '2027-11-03T04:00:00.000Z',
        'status': 'PENDING',
        'createdAt': '2026-11-01T01:00:00.000Z',
        'room': {'id': 2, 'name': 'Ruang Rapat', 'code': 'RPT-01', 'location': 'Lt. 1', 'capacity': 20},
      });
      expect(b.canCancel, isTrue);
      expect(b.room.code, 'RPT-01');
    });

    test('Booking.fromJson membaca permintaan perpanjangan', () {
      final booking = Booking.fromJson({
        'id': 8,
        'title': 'Seminar',
        'purpose': 'Seminar mahasiswa',
        'startTime': '2026-11-06T02:00:00.000Z',
        'endTime': '2026-11-06T04:00:00.000Z',
        'status': 'APPROVED',
        'createdAt': '2026-11-05T05:00:00.000Z',
        'room': {'id': 2, 'name': 'Ruang Seminar', 'code': 'SEM-01', 'location': 'Gedung A', 'capacity': 80},
        'extensions': [
          {
            'id': 31,
            'requestedEndTime': '2026-11-06T05:00:00.000Z',
            'status': 'PENDING',
            'createdAt': '2026-11-05T06:00:00.000Z',
          },
        ],
      });

      expect(booking.extensions.single.requestedEndTime.toIso8601String(), '2026-11-06T05:00:00.000Z');
      expect(booking.extensions.single.status, 'PENDING');
    });

    test('BookingQueueEntry.fromJson membaca status, posisi, dan ruangan', () {
      final entry = BookingQueueEntry.fromJson({
        'id': 41,
        'title': 'Diskusi',
        'startTime': '2026-11-07T02:00:00.000Z',
        'endTime': '2026-11-07T03:00:00.000Z',
        'status': 'WAITING',
        'position': 2,
        'room': {'id': 2, 'name': 'Ruang Seminar', 'code': 'SEM-01', 'location': 'Gedung A', 'capacity': 80},
      });

      expect(entry.status, 'WAITING');
      expect(entry.position, 2);
      expect(entry.room.id, 2);
    });
  });
}
