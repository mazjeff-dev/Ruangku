import '../core/config.dart';

DateTime _dt(dynamic v) => DateTime.parse(v as String).toUtc();
int _int(dynamic v) => (v as num?)?.toInt() ?? 0;

class AppUser {
  AppUser({required this.id, required this.name, required this.email, required this.role, this.nim, this.emailNotifications = true});

  final int id;
  final String name;
  final String email;
  final String role;
  final String? nim;
  final bool emailNotifications;

  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
        id: _int(j['id']),
        name: j['name'] as String,
        email: j['email'] as String,
        role: (j['role'] as String?) ?? 'STUDENT',
        nim: j['nim'] as String?,
        emailNotifications: (j['emailNotifications'] as bool?) ?? true,
      );
}

class Room {
  Room({
    required this.id,
    required this.name,
    required this.code,
    required this.location,
    required this.capacity,
    this.category,
    this.description,
    this.facilities,
    this.imageUrl,
    this.isAvailable = true,
    this.inUseNow = false,
    this.waitlistCount = 0,
    this.myWaitlistPosition,
    this.availabilityStatus,
    this.availabilityMessage,
    this.occupiedUntil,
    this.nextAvailableStart,
  });

  final int id;
  final String name;
  final String code;
  final String location;
  final int capacity;
  final String? category;
  final String? description;
  final String? facilities;
  final String? imageUrl;
  final bool isAvailable;
  final bool inUseNow;
  final int waitlistCount;
  final int? myWaitlistPosition;
  final String? availabilityStatus;
  final String? availabilityMessage;
  final DateTime? occupiedUntil;
  final DateTime? nextAvailableStart;

  List<String> get facilityList =>
      (facilities ?? '').split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();

  /// URL foto lengkap (server menyimpan path relatif "/uploads/rooms/..").
  String? get imageFullUrl {
    final url = imageUrl;
    if (url == null || url.isEmpty) return null;
    return url.startsWith('http') ? url : '${AppConfig.serverOrigin}$url';
  }

  factory Room.fromJson(Map<String, dynamic> j) => Room(
        id: _int(j['id']),
        name: j['name'] as String,
        code: (j['code'] as String?) ?? '',
        location: (j['location'] as String?) ?? '',
        capacity: _int(j['capacity']),
        category: j['category'] as String?,
        description: j['description'] as String?,
        facilities: j['facilities'] as String?,
        imageUrl: j['imageUrl'] as String?,
        isAvailable: (j['isAvailable'] as bool?) ?? true,
        inUseNow: (j['inUseNow'] as bool?) ?? false,
        waitlistCount: _int(j['waitlistCount']),
        myWaitlistPosition: (j['myWaitlistPosition'] as num?)?.toInt(),
        availabilityStatus: (j['availability'] as Map?)?['status'] as String?,
        availabilityMessage: (j['availability'] as Map?)?['message'] as String?,
        occupiedUntil: ((j['availability'] as Map?)?['occupiedUntil'] as String?) == null
            ? null
            : _dt((j['availability'] as Map)['occupiedUntil']),
        nextAvailableStart: ((j['availability'] as Map?)?['nextAvailableStart'] as String?) == null
            ? null
            : _dt((j['availability'] as Map)['nextAvailableStart']),
      );
}

class BookingLogEntry {
  BookingLogEntry({required this.action, required this.createdAt, this.note});

  final String action;
  final String? note;
  final DateTime createdAt;

  factory BookingLogEntry.fromJson(Map<String, dynamic> j) => BookingLogEntry(
        action: j['action'] as String,
        note: j['note'] as String?,
        createdAt: _dt(j['createdAt']),
      );
}

class Booking {
  Booking({
    required this.id,
    required this.title,
    required this.purpose,
    required this.startTime,
    required this.endTime,
    required this.status,
    required this.room,
    required this.createdAt,
    this.adminNote,
    this.attendees,
    this.checkedInAt,
    this.checkedOutAt,
    this.overstayMinutes,
    this.attendanceRequired = false,
    this.logs = const [],
    this.extensions = const [],
  });

  final int id;
  final String title;
  final String purpose;
  final DateTime startTime;
  final DateTime endTime;
  final String status; // PENDING | APPROVED | REJECTED | CANCELLED | COMPLETED
  final String? adminNote;
  final int? attendees;
  final DateTime? checkedInAt;
  final DateTime? checkedOutAt;
  final int? overstayMinutes;
  final bool attendanceRequired;
  final DateTime createdAt;
  final Room room;
  final List<BookingLogEntry> logs;
  final List<BookingExtensionRequest> extensions;

  bool get canCancel =>
      (status == 'PENDING' || status == 'APPROVED') && startTime.isAfter(DateTime.now().toUtc());

  factory Booking.fromJson(Map<String, dynamic> j) => Booking(
        id: _int(j['id']),
        title: j['title'] as String,
        purpose: (j['purpose'] as String?) ?? '',
        startTime: _dt(j['startTime']),
        endTime: _dt(j['endTime']),
        status: j['status'] as String,
        adminNote: j['adminNote'] as String?,
        attendees: (j['attendees'] as num?)?.toInt(),
        checkedInAt: j['checkedInAt'] == null ? null : _dt(j['checkedInAt']),
        checkedOutAt: j['checkedOutAt'] == null ? null : _dt(j['checkedOutAt']),
        overstayMinutes: (j['overstayMinutes'] as num?)?.toInt(),
        attendanceRequired: (j['attendanceRequired'] as bool?) ?? false,
        createdAt: _dt(j['createdAt']),
        room: Room.fromJson(j['room'] as Map<String, dynamic>),
        logs: ((j['logs'] as List?) ?? [])
            .map((e) => BookingLogEntry.fromJson(e as Map<String, dynamic>))
            .toList(),
        extensions: ((j['extensions'] as List?) ?? [])
            .map((e) => BookingExtensionRequest.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class BookingExtensionRequest {
  BookingExtensionRequest({
    required this.id,
    required this.requestedEndTime,
    required this.status,
    required this.createdAt,
    this.note,
    this.reviewedAt,
  });

  final int id;
  final DateTime requestedEndTime;
  final String status;
  final String? note;
  final DateTime createdAt;
  final DateTime? reviewedAt;

  factory BookingExtensionRequest.fromJson(Map<String, dynamic> j) => BookingExtensionRequest(
        id: _int(j['id']),
        requestedEndTime: _dt(j['requestedEndTime']),
        status: j['status'] as String,
        note: j['note'] as String?,
        createdAt: _dt(j['createdAt']),
        reviewedAt: j['reviewedAt'] == null ? null : _dt(j['reviewedAt']),
      );
}

class BookingQueueEntry {
  BookingQueueEntry({
    required this.id,
    required this.title,
    required this.startTime,
    required this.endTime,
    required this.status,
    required this.room,
    this.position,
    this.attendees,
  });

  final int id;
  final String title;
  final DateTime startTime;
  final DateTime endTime;
  final String status;
  final int? position;
  final Room room;
  final int? attendees;

  factory BookingQueueEntry.fromJson(Map<String, dynamic> j) => BookingQueueEntry(
        id: _int(j['id']),
        title: j['title'] as String,
        startTime: _dt(j['startTime']),
        endTime: _dt(j['endTime']),
        status: j['status'] as String,
        position: (j['position'] as num?)?.toInt(),
        attendees: (j['attendees'] as num?)?.toInt(),
        room: Room.fromJson(j['room'] as Map<String, dynamic>),
      );
}

class BookingSummary {
  BookingSummary(this.counts);

  final Map<String, int> counts;

  int get total => counts['total'] ?? 0;
  int count(String status) => counts[status] ?? 0;

  factory BookingSummary.fromJson(Map<String, dynamic>? j) => BookingSummary({
        for (final e in (j ?? {}).entries) e.key: _int(e.value),
      });
}

class BookingPage {
  BookingPage({required this.items, required this.summary, required this.total});

  final List<Booking> items;
  final BookingSummary summary;
  final int total;
}

class RoomPage {
  RoomPage({required this.items, required this.total, required this.page, required this.totalPages});

  final List<Room> items;
  final int total;
  final int page;
  final int totalPages;
  bool get hasMore => page < totalPages;
}

class RoomCategory {
  RoomCategory(this.name, this.total);

  final String name;
  final int total;
}

class ScheduleSlot {
  ScheduleSlot({required this.id, required this.startTime, required this.endTime, required this.status});

  final int id;
  final DateTime startTime;
  final DateTime endTime;
  final String status;

  factory ScheduleSlot.fromJson(Map<String, dynamic> j) => ScheduleSlot(
        id: _int(j['id']),
        startTime: _dt(j['startTime']),
        endTime: _dt(j['endTime']),
        status: j['status'] as String,
      );
}

class RoomScheduleData {
  RoomScheduleData({required this.bookings, required this.overrides, this.defaultHours, this.closures = const []});

  final List<ScheduleSlot> bookings;
  final List<Map<String, dynamic>> overrides;
  final Map<String, dynamic>? defaultHours;
  final List<Map<String, dynamic>> closures;

  Map<String, dynamic>? hoursFor(DateTime date) {
    final day = date.weekday % 7;
    for (final hour in overrides) {
      if ((hour['dayOfWeek'] as num?)?.toInt() == day) return hour;
    }
    return defaultHours;
  }

  bool isClosed(DateTime date) {
    final day = date.weekday % 7;
    final override = overrides.where((hour) => (hour['dayOfWeek'] as num?)?.toInt() == day);
    if (override.isNotEmpty) return override.first['isClosed'] == true;
    final days = defaultHours?['operatingDays'] as List?;
    return days != null && !days.any((value) => (value as num).toInt() == day);
  }

  List<Map<String, dynamic>> closuresFor(DateTime date) {
    final key = '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
    return closures.where((closure) {
      final start = (closure['startDate'] as String).substring(0, 10);
      final end = (closure['endDate'] as String).substring(0, 10);
      return key.compareTo(start) >= 0 && key.compareTo(end) <= 0;
    }).toList();
  }
}

class AppNotification {
  AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.message,
    required this.isRead,
    required this.createdAt,
    this.bookingId,
  });

  final int id;
  final int? bookingId;
  final String type;
  final String title;
  final String message;
  bool isRead;
  final DateTime createdAt;

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: _int(j['id']),
        bookingId: (j['bookingId'] as num?)?.toInt(),
        type: j['type'] as String,
        title: j['title'] as String,
        message: j['message'] as String,
        isRead: (j['isRead'] as bool?) ?? false,
        createdAt: _dt(j['createdAt']),
      );
}

class NotificationPage {
  NotificationPage({required this.items, required this.unread, required this.page, required this.totalPages});

  final List<AppNotification> items;
  final int unread;
  final int page;
  final int totalPages;
  bool get hasMore => page < totalPages;
}

class BookingRules {
  BookingRules({
    this.minMinutes = 30,
    this.maxHours = 8,
    this.maxDaysAhead = 90,
    this.maxActiveBookings = 3,
    this.maxQueueEntries = 3,
    this.gracePeriodMinutes = 15,
  });

  final int minMinutes;
  final int maxHours;
  final int maxDaysAhead;
  final int maxActiveBookings;
  final int maxQueueEntries;
  final int gracePeriodMinutes;

  factory BookingRules.fromJson(Map<String, dynamic> j) => BookingRules(
        minMinutes: _int(j['minMinutes']),
        maxHours: _int(j['maxHours']),
        maxDaysAhead: _int(j['maxDaysAhead']),
        maxActiveBookings: _int(j['maxActiveBookings'] ?? 3),
        maxQueueEntries: _int(j['maxQueueEntries'] ?? 3),
        gracePeriodMinutes: _int(j['gracePeriodMinutes'] ?? 15),
      );
}

class BookingQuota {
  const BookingQuota({
    required this.activeBookings,
    required this.maxActiveBookings,
    required this.activeQueueEntries,
    required this.maxQueueEntries,
  });

  final int activeBookings;
  final int maxActiveBookings;
  final int activeQueueEntries;
  final int maxQueueEntries;

  factory BookingQuota.fromJson(Map<String, dynamic> json) => BookingQuota(
        activeBookings: _int(json['activeBookings']),
        maxActiveBookings: _int(json['maxActiveBookings']),
        activeQueueEntries: _int(json['activeQueueEntries']),
        maxQueueEntries: _int(json['maxQueueEntries']),
      );
}
