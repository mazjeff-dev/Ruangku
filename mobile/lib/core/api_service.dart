import 'api_client.dart';
import '../models/models.dart';

/// Seluruh pemanggilan endpoint backend RuangKu (semua data berasal dari server).
class ApiService {
  ApiService(this.client);

  final ApiClient client;

  Map<String, dynamic> _data(Map<String, dynamic> json) => (json['data'] as Map).cast<String, dynamic>();
  List<Map<String, dynamic>> _list(Map<String, dynamic> json) =>
      ((json['data'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();

  // ---------------------------------------------------------------- Auth
  Future<({AppUser user, String token})> login(String email, String password) async {
    final json = await client.post('/auth/login', body: {'email': email, 'password': password});
    final data = _data(json);
    return (user: AppUser.fromJson((data['user'] as Map).cast<String, dynamic>()), token: data['token'] as String);
  }

  Future<void> register({
    required String name,
    required String email,
    required String password,
    String? nim,
  }) async {
    await client.post('/auth/register', body: {
      'name': name,
      'email': email,
      'password': password,
      if (nim != null && nim.isNotEmpty) 'nim': nim,
    });
  }

  Future<String> forgotPassword(String email) async {
    final json = await client.post('/auth/forgot-password', body: {'email': email});
    return json['message'] as String? ?? 'Jika email terdaftar, tautan reset telah dikirim';
  }

  Future<AppUser> me() async => AppUser.fromJson(_data(await client.get('/auth/me')));

  Future<void> logout() async {
    await client.post('/auth/logout');
  }

  // ------------------------------------------------------------- Profil
  Future<AppUser> updateProfile({String? name, String? email, bool? emailNotifications}) async {
    final json = await client.put('/students/profile', body: {
      if (name != null) 'name': name,
      if (email != null) 'email': email,
      if (emailNotifications != null) 'emailNotifications': emailNotifications,
    });
    return AppUser.fromJson(_data(json));
  }

  Future<void> changePassword(String current, String next) async {
    await client.patch('/users/password', body: {'currentPassword': current, 'newPassword': next});
  }

  // ------------------------------------------------------------- Ruangan
  Future<RoomPage> rooms({
    String? q,
    String? category,
    int? minCapacity,
    List<String> facilities = const [],
    String sort = 'name',
    int page = 1,
    int pageSize = 20,
    DateTime? start,
    DateTime? end,
  }) async {
    final json = await client.get('/rooms', query: {
      'q': q,
      'category': category,
      'minCapacity': minCapacity,
      'facility': facilities.join(','),
      'sort': sort,
      'page': page,
      'pageSize': pageSize,
      'start': start?.toUtc().toIso8601String(),
      'end': end?.toUtc().toIso8601String(),
    });
    return RoomPage(
      items: _list(json).map(Room.fromJson).toList(),
      total: (json['total'] as num?)?.toInt() ?? 0,
      page: (json['page'] as num?)?.toInt() ?? 1,
      totalPages: (json['totalPages'] as num?)?.toInt() ?? 1,
    );
  }

  Future<List<Room>> availableRooms({
    required DateTime start,
    required DateTime end,
    String? q,
    String? category,
    int? minCapacity,
    List<String> facilities = const [],
  }) async {
    final json = await client.get('/rooms/available', query: {
      'start': start.toUtc().toIso8601String(),
      'end': end.toUtc().toIso8601String(),
      'q': q,
      'category': category,
      'minCapacity': minCapacity,
      'facility': facilities.join(','),
    });
    return _list(json).map(Room.fromJson).toList();
  }

  Future<List<RoomCategory>> categories() async {
    final json = await client.get('/rooms/categories');
    return _list(json).map((e) => RoomCategory(e['name'] as String, (e['total'] as num).toInt())).toList();
  }

  Future<Room> room(int id, {DateTime? start, DateTime? end}) async => Room.fromJson(_data(await client.get(
        '/rooms/$id',
        query: {
          if (start != null) 'start': start.toUtc().toIso8601String(),
          if (end != null) 'end': end.toUtc().toIso8601String(),
        },
      )));

  /// Jadwal terpakai (PENDING/APPROVED) satu ruangan pada rentang tanggal WIB "YYYY-MM-DD".
  Future<RoomScheduleData> roomSchedule(int roomId, String from, String to) async {
    final json = await client.get('/rooms/$roomId/schedule', query: {'from': from, 'to': to});
    final data = _data(json);
    final hours = (data['operatingHours'] as Map?)?.cast<String, dynamic>() ?? {};
    return RoomScheduleData(
      bookings: ((data['bookings'] as List?) ?? [])
          .map((e) => ScheduleSlot.fromJson((e as Map).cast<String, dynamic>()))
          .toList(),
      overrides: ((hours['overrides'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList(),
      defaultHours: (hours['default'] as Map?)?.cast<String, dynamic>(),
      closures: ((data['closures'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList(),
    );
  }

  // ---------------------------------------------------------- Peminjaman
  Future<BookingRules> bookingRules() async {
    return BookingRules.fromJson(_data(await client.get('/bookings/rules')));
  }

  Future<BookingQuota> bookingQuota() async =>
      BookingQuota.fromJson(_data(await client.get('/bookings/quota')));

  Future<Map<String, dynamic>> myViolations() async => _data(await client.get('/bookings/violations'));

  /// Bukti booking (PDF) atau jadwal kalender (.ics) untuk booking yang disetujui/selesai.
  Future<({List<int> bytes, String filename})> downloadBookingFile(int id, {required bool calendar}) =>
      client.getBytes(
        calendar ? '/bookings/$id/calendar.ics' : '/bookings/$id/receipt',
        fallbackName: calendar ? 'booking-$id.ics' : 'bukti-booking-$id.pdf',
      );

  Future<void> checkInBooking(int id) async {
    await client.post('/bookings/$id/check-in', body: {});
  }

  Future<void> checkOutBooking(int id) async {
    await client.post('/bookings/$id/check-out', body: {});
  }

  Future<Booking> createBooking({
    required int roomId,
    required String title,
    required String purpose,
    required int attendees,
    required DateTime start,
    required DateTime end,
  }) async {
    final json = await client.post('/bookings', body: {
      'roomId': roomId,
      'title': title,
      'purpose': purpose,
      'attendees': attendees,
      'startTime': start.toUtc().toIso8601String(),
      'endTime': end.toUtc().toIso8601String(),
    });
    final data = _data(json);
    // respons pembuatan tidak memuat createdAt/purpose lengkap; lengkapi seperlunya
    return Booking.fromJson({'createdAt': DateTime.now().toUtc().toIso8601String(), ...data});
  }

  Future<BookingPage> myBookings({String? status, int page = 1, int pageSize = 50}) async {
    final json = await client.get('/students/bookings', query: {'status': status, 'page': page, 'pageSize': pageSize});
    return BookingPage(
      items: _list(json).map(Booking.fromJson).toList(),
      summary: BookingSummary.fromJson((json['summary'] as Map?)?.cast<String, dynamic>()),
      total: (json['total'] as num?)?.toInt() ?? 0,
    );
  }

  Future<Booking> bookingDetail(int id) async => Booking.fromJson(_data(await client.get('/bookings/$id')));

  Future<void> cancelBooking(int id) async {
    await client.patch('/bookings/$id/cancel');
  }

  Future<BookingExtensionRequest> requestBookingExtension(int id, DateTime requestedEnd) async {
    final json = await client.post('/bookings/$id/extensions', body: {
      'requestedEndTime': requestedEnd.toUtc().toIso8601String(),
    });
    return BookingExtensionRequest.fromJson(_data(json));
  }

  Future<BookingQueueEntry> joinBookingQueue({
    required int roomId,
    required String title,
    required String purpose,
    required int attendees,
    required DateTime start,
    required DateTime end,
  }) async {
    final json = await client.post('/bookings/waitlist', body: {
      'roomId': roomId,
      'title': title,
      'purpose': purpose,
      'attendees': attendees,
      'startTime': start.toUtc().toIso8601String(),
      'endTime': end.toUtc().toIso8601String(),
    });
    return BookingQueueEntry.fromJson(_data(json));
  }

  Future<List<BookingQueueEntry>> myBookingQueue() async =>
      _list(await client.get('/bookings/waitlist')).map(BookingQueueEntry.fromJson).toList();

  Future<void> cancelBookingQueueEntry(int id) async {
    await client.delete('/bookings/waitlist/$id');
  }

  // ---------------------------------------------------------- Notifikasi
  Future<NotificationPage> notifications({int page = 1, bool unreadOnly = false}) async {
    final json = await client.get('/students/notifications', query: {
      'page': page,
      'pageSize': 20,
      if (unreadOnly) 'unread': 'true',
    });
    return NotificationPage(
      items: _list(json).map(AppNotification.fromJson).toList(),
      unread: (json['unread'] as num?)?.toInt() ?? 0,
      page: (json['page'] as num?)?.toInt() ?? 1,
      totalPages: (json['totalPages'] as num?)?.toInt() ?? 1,
    );
  }

  Future<int> unreadCount() async {
    final json = await client.get('/notifications/unread-count');
    return (_data(json)['count'] as num).toInt();
  }

  Future<void> markRead(int id) async {
    await client.patch('/notifications/$id/read');
  }

  Future<void> markAllRead() async {
    await client.patch('/notifications/read-all');
  }
}
