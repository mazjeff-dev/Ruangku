import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../core/api_client.dart';
import '../core/api_service.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../state/auth_state.dart';
import '../widgets/common.dart';

class BookingDetailScreen extends StatefulWidget {
  const BookingDetailScreen({super.key, required this.bookingId});

  final int bookingId;

  @override
  State<BookingDetailScreen> createState() => _BookingDetailScreenState();
}

class _BookingDetailScreenState extends State<BookingDetailScreen> {
  late Future<Booking> _future;
  bool _cancelling = false;
  bool _downloading = false;
  bool _extending = false;
  bool _attendanceWorking = false;
  int _gracePeriodMinutes = 15;
  bool _changed = false;

  static const _actionLabel = {
    'CREATED': 'Pengajuan dibuat',
    'APPROVED': 'Disetujui admin',
    'REJECTED': 'Ditolak admin',
    'CANCELLED': 'Dibatalkan',
    'COMPLETED': 'Peminjaman selesai',
  };

  @override
  void initState() {
    super.initState();
    _future = context.read<ApiService>().bookingDetail(widget.bookingId);
    context.read<ApiService>().bookingRules().then((rules) {
      if (mounted) setState(() => _gracePeriodMinutes = rules.gracePeriodMinutes);
    }).catchError((Object error) {
      if (mounted && error is ApiException) showSnack(context, error.message, error: true);
    });
  }

  void _reload() => setState(() => _future = context.read<ApiService>().bookingDetail(widget.bookingId));

  Future<void> _attendanceAction({required bool checkIn}) async {
    setState(() => _attendanceWorking = true);
    try {
      final api = context.read<ApiService>();
      if (checkIn) {
        await api.checkInBooking(widget.bookingId);
      } else {
        await api.checkOutBooking(widget.bookingId);
      }
      _changed = true;
      context.read<RefreshState>().bump();
      if (mounted) {
        showSnack(context, checkIn ? 'Check-in berhasil dicatat' : 'Check-out berhasil dicatat');
        _reload();
      }
    } on ApiException catch (error) {
      if (mounted) showSnack(context, error.message, error: true);
    } finally {
      if (mounted) setState(() => _attendanceWorking = false);
    }
  }

  /// Simpan berkas ke folder sementara lalu buka lembar bagikan (simpan ke Berkas, kirim, atau tambah ke kalender).
  Future<void> _downloadFile({required bool calendar}) async {
    setState(() => _downloading = true);
    try {
      final file = await context.read<ApiService>().downloadBookingFile(widget.bookingId, calendar: calendar);
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}/${file.filename}';
      await File(path).writeAsBytes(file.bytes, flush: true);
      await Share.shareXFiles(
        [XFile(path, mimeType: calendar ? 'text/calendar' : 'application/pdf')],
        text: calendar ? 'Jadwal peminjaman ruangan' : 'Bukti peminjaman ruangan',
      );
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Gagal menyimpan berkas', error: true);
    } finally {
      if (mounted) setState(() => _downloading = false);
    }
  }

  Future<void> _cancel(Booking b) async {
    final ok = await confirmDialog(
      context,
      title: b.status == 'APPROVED' ? 'Batalkan peminjaman?' : 'Batalkan pengajuan?',
      message: 'Peminjaman "${b.title}" akan dibatalkan dan jadwal dilepas. Tindakan ini tidak dapat diurungkan.',
      confirmLabel: 'Ya, batalkan',
      danger: true,
    );
    if (!ok || !mounted) return;
    setState(() => _cancelling = true);
    final refresh = context.read<RefreshState>();
    try {
      await context.read<ApiService>().cancelBooking(b.id);
      _changed = true;
      refresh.bump();
      if (mounted) {
        showSnack(context, 'Peminjaman berhasil dibatalkan');
        _reload();
      }
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  Future<void> _requestExtension(Booking booking) async {
    final endWib = booking.endTime.add(const Duration(hours: 7));
    final startWib = booking.startTime.add(const Duration(hours: 7));
    final selectedDate = await showDatePicker(
      context: context,
      initialDate: DateTime(endWib.year, endWib.month, endWib.day),
      firstDate: DateTime(endWib.year, endWib.month, endWib.day),
      lastDate: DateTime(endWib.year, endWib.month, endWib.day).add(const Duration(days: 1)),
      helpText: 'Pilih tanggal selesai baru',
    );
    if (selectedDate == null || !mounted) return;
    final selectedTime = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: endWib.hour, minute: endWib.minute),
      helpText: 'Pilih waktu selesai baru',
    );
    if (selectedTime == null || !mounted) return;

    final requestedEnd = fromWib(
      selectedDate.year,
      selectedDate.month,
      selectedDate.day,
      selectedTime.hour,
      selectedTime.minute,
    );
    final ok = await confirmDialog(
      context,
      title: 'Ajukan perpanjangan?',
      message: 'Waktu selesai baru: ${fmtDateLong(requestedEnd)} pukul ${fmtTime(requestedEnd)} WIB. Permintaan akan ditinjau dosen yang ditugaskan atau admin.',
      confirmLabel: 'Ajukan',
    );
    if (!ok || !mounted) return;

    setState(() => _extending = true);
    try {
      await context.read<ApiService>().requestBookingExtension(booking.id, requestedEnd);
      _changed = true;
      context.read<RefreshState>().bump();
      if (mounted) {
        showSnack(context, 'Permintaan perpanjangan berhasil diajukan');
        _reload();
      }
    } on ApiException catch (error) {
      if (mounted) showSnack(context, error.message, error: true);
    } finally {
      if (mounted) setState(() => _extending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_changed);
      },
      child: Scaffold(
        appBar: AppBar(title: const Text('Detail Peminjaman')),
        body: AsyncBody<Booking>(
          future: _future,
          onRetry: _reload,
          skeleton: const ListSkeleton(count: 3, height: 140),
          builder: (context, b) => SafeArea(
            child: ListView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 28), children: [
              AppCard(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(b.title, style: const TextStyle(fontFamily: AppTheme.serif, fontSize: 22, fontWeight: FontWeight.w600, height: 1.2))),
                    const SizedBox(width: 10),
                    StatusBadge(b.status),
                  ]),
                  const SizedBox(height: 16),
                  _Row(Icons.meeting_room_outlined, 'Ruangan', '${b.room.name} (${b.room.code})'),
                  _Row(Icons.place_outlined, 'Lokasi', b.room.location),
                  _Row(Icons.calendar_month_outlined, 'Tanggal', fmtDateLong(b.startTime)),
                  _Row(Icons.schedule_outlined, 'Waktu', '${fmtTime(b.startTime)} – ${fmtTime(b.endTime)} WIB'),
                  _Row(Icons.groups_outlined, 'Jumlah peserta', b.attendees?.toString() ?? '—'),
                  _Row(Icons.history_toggle_off, 'Diajukan', fmtDateTime(b.createdAt)),
                  if (b.attendanceRequired && b.checkedInAt != null)
                    _Row(Icons.login, 'Check-in', fmtDateTime(b.checkedInAt!)),
                  if (b.checkedOutAt != null)
                    _Row(Icons.logout, 'Check-out', fmtDateTime(b.checkedOutAt!)),
                  if ((b.overstayMinutes ?? 0) > 0)
                    _Row(Icons.warning_amber_outlined, 'Terlambat', '${b.overstayMinutes} menit'),
                ]),
              ),
              const SizedBox(height: 14),
              AppCard(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Deskripsi kegiatan', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Text(b.purpose, style: const TextStyle(color: AppColors.textSecondary, height: 1.55)),
                ]),
              ),
              if (b.attendanceRequired && b.status == 'APPROVED' && b.checkedInAt == null) ...[
                const SizedBox(height: 14),
                AppCard(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Check-in kehadiran', style: TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 6),
                    Text(
                      'Tersedia 10 menit sebelum mulai hingga $_gracePeriodMinutes menit setelah waktu mulai.',
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: _attendanceWorking ? null : () => _attendanceAction(checkIn: true),
                        icon: _attendanceWorking
                            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.login),
                        label: const Text('Check-in'),
                      ),
                    ),
                  ]),
                ),
              ],
              if (b.attendanceRequired && b.status == 'APPROVED' && b.checkedInAt != null && b.checkedOutAt == null) ...[
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: _attendanceWorking ? null : () => _attendanceAction(checkIn: false),
                    icon: _attendanceWorking
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.logout),
                    label: const Text('Check-out dan selesaikan peminjaman'),
                  ),
                ),
              ],
              if (b.adminNote != null && b.adminNote!.isNotEmpty) ...[
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: b.status == 'REJECTED' ? const Color(0xFFFEF3F2) : AppColors.goldTint,
                    borderRadius: BorderRadius.circular(AppRadius.card),
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(b.status == 'REJECTED' ? 'Alasan penolakan' : 'Catatan admin',
                        style: TextStyle(fontWeight: FontWeight.w700, color: b.status == 'REJECTED' ? const Color(0xFFB42318) : AppColors.goldDeep)),
                    const SizedBox(height: 6),
                    Text(b.adminNote!, style: const TextStyle(height: 1.5)),
                  ]),
                ),
              ],
              if (b.extensions.isNotEmpty) ...[
                const SizedBox(height: 14),
                AppCard(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Permintaan perpanjangan', style: TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 8),
                    for (final extension in b.extensions)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Expanded(
                            child: Text(
                              '${fmtDateLong(extension.requestedEndTime)} · ${fmtTime(extension.requestedEndTime)} WIB',
                              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                            ),
                          ),
                          Text(
                            extension.status == 'PENDING' ? 'Menunggu' : extension.status == 'APPROVED' ? 'Disetujui' : 'Ditolak',
                            style: TextStyle(
                              color: extension.status == 'REJECTED' ? AppColors.danger : AppColors.goldDeep,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ]),
                      ),
                  ]),
                ),
              ],
              const SizedBox(height: 14),
              AppCard(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Riwayat status', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 14),
                  for (var i = 0; i < b.logs.length; i++)
                    IntrinsicHeight(
                      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        Column(children: [
                          Container(
                            width: 12,
                            height: 12,
                            margin: const EdgeInsets.only(top: 4),
                            decoration: BoxDecoration(color: StatusStyle.of(b.logs[i].action == 'CREATED' ? 'PENDING' : b.logs[i].action).color, shape: BoxShape.circle),
                          ),
                          if (i < b.logs.length - 1) Expanded(child: Container(width: 2, color: AppColors.line)),
                        ]),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.only(bottom: 16),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(_actionLabel[b.logs[i].action] ?? b.logs[i].action, style: const TextStyle(fontWeight: FontWeight.w700)),
                              Text(fmtDateTime(b.logs[i].createdAt), style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                              if (b.logs[i].note != null && b.logs[i].note!.isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(top: 4),
                                  child: Text(b.logs[i].note!, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary, height: 1.4)),
                                ),
                            ]),
                          ),
                        ),
                      ]),
                    ),
                ]),
              ),
              if (b.status == 'APPROVED' || b.status == 'COMPLETED') ...[
                const SizedBox(height: 18),
                Row(children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _downloading ? null : () => _downloadFile(calendar: false),
                      icon: _downloading
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.picture_as_pdf_outlined),
                      label: const Text('Bukti (PDF)'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _downloading ? null : () => _downloadFile(calendar: true),
                      icon: const Icon(Icons.event_outlined),
                      label: const Text('Kalender'),
                    ),
                  ),
                ]),
              ],
              if (b.canCancel) ...[
                const SizedBox(height: 18),
                OutlinedButton.icon(
                  onPressed: _cancelling ? null : () => _cancel(b),
                  style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger, side: const BorderSide(color: Color(0xFFFECDCA))),
                  icon: _cancelling
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.cancel_outlined),
                  label: Text(b.status == 'APPROVED' ? 'Batalkan peminjaman' : 'Batalkan pengajuan'),
                ),
              ],
              if (b.status == 'APPROVED' && b.endTime.isAfter(DateTime.now().toUtc())) ...[
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: _extending ? null : () => _requestExtension(b),
                  icon: _extending
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.more_time_outlined),
                  label: const Text('Ajukan perpanjangan waktu'),
                ),
              ],
            ]),
          ),
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.icon, this.label, this.value);

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 19, color: AppColors.goldDeep),
          const SizedBox(width: 12),
          SizedBox(width: 78, child: Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13))),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5))),
        ]),
      );
}
