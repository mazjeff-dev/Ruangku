import 'package:intl/intl.dart';

/// Semua waktu ditampilkan dalam WIB (Asia/Jakarta, UTC+7) tanpa bergantung zona waktu perangkat.
const Duration wibOffset = Duration(hours: 7);

/// Instant (dari API, UTC) -> DateTime yang field-nya berisi jam dinding WIB.
DateTime toWib(DateTime instant) => instant.toUtc().add(wibOffset);

/// Jam dinding WIB -> instant UTC untuk dikirim ke API.
DateTime fromWib(int y, int m, int d, int h, int min) =>
    DateTime.utc(y, m, d, h, min).subtract(wibOffset);

DateTime nowWib() => toWib(DateTime.now());

final DateFormat _date = DateFormat('d MMM yyyy', 'id_ID');
final DateFormat _dateLong = DateFormat('EEEE, d MMMM yyyy', 'id_ID');
final DateFormat _time = DateFormat('HH:mm');
final DateFormat _dayShort = DateFormat('EEE', 'id_ID');

String fmtDate(DateTime instant) => _date.format(toWib(instant));
String fmtDateLong(DateTime instant) => _dateLong.format(toWib(instant));
String fmtTime(DateTime instant) => _time.format(toWib(instant));
String fmtDateTime(DateTime instant) => '${fmtDate(instant)}, ${fmtTime(instant)}';
String fmtRange(DateTime s, DateTime e) => '${fmtDate(s)} · ${fmtTime(s)}–${fmtTime(e)} WIB';
String fmtDayShort(DateTime wibDate) => _dayShort.format(wibDate);
String fmtWibDateLong(DateTime wibDate) => _dateLong.format(wibDate);
String fmtWibDate(DateTime wibDate) => _date.format(wibDate);

String fmtRelative(DateTime instant) {
  final diff = DateTime.now().toUtc().difference(instant.toUtc());
  if (diff.inMinutes < 1) return 'baru saja';
  if (diff.inMinutes < 60) return '${diff.inMinutes} menit lalu';
  if (diff.inHours < 24) return '${diff.inHours} jam lalu';
  if (diff.inDays < 7) return '${diff.inDays} hari lalu';
  return fmtDate(instant);
}

String twoDigits(int n) => n.toString().padLeft(2, '0');

/// "YYYY-MM-DD" dari tanggal dinding WIB.
String dateKey(DateTime wibDate) =>
    '${wibDate.year.toString().padLeft(4, '0')}-${twoDigits(wibDate.month)}-${twoDigits(wibDate.day)}';

String initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  return parts.take(2).map((p) => p[0].toUpperCase()).join();
}

String greeting() {
  final h = nowWib().hour;
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 19) return 'Selamat sore';
  return 'Selamat malam';
}
