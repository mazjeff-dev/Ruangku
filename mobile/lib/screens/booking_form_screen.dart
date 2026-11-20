import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/api_service.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../state/auth_state.dart';
import '../widgets/common.dart';

class BookingFormScreen extends StatefulWidget {
  const BookingFormScreen({
    super.key,
    required this.room,
    this.initialDate,
    this.initialStart,
    this.initialEnd,
    this.queueOnly = false,
  });

  final Room room;
  final DateTime? initialDate; // tanggal dinding WIB
  final TimeOfDay? initialStart;
  final TimeOfDay? initialEnd;
  final bool queueOnly;

  @override
  State<BookingFormScreen> createState() => _BookingFormScreenState();
}

class _BookingFormScreenState extends State<BookingFormScreen> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _purpose = TextEditingController();
  final _attendees = TextEditingController();

  late DateTime _date;
  TimeOfDay? _start;
  TimeOfDay? _end;
  String? _timeError;
  String? _serverError;
  bool _submitting = false;
  BookingRules _rules = BookingRules();
  List<ScheduleSlot> _slots = [];
  RoomScheduleData? _scheduleData;
  bool _slotsLoading = false;

  @override
  void initState() {
    super.initState();
    final n = nowWib();
    final today = DateTime(n.year, n.month, n.day);
    final initial = widget.initialDate ?? today;
    _date = initial.isBefore(today) ? today : DateTime(initial.year, initial.month, initial.day);
    _start = widget.initialStart;
    _end = widget.initialEnd;
    context.read<ApiService>().bookingRules().then((r) {
      if (mounted) setState(() => _rules = r);
    });
    _loadSlots();
  }

  @override
  void dispose() {
    _title.dispose();
    _purpose.dispose();
    _attendees.dispose();
    super.dispose();
  }

  Future<void> _loadSlots() async {
    setState(() => _slotsLoading = true);
    try {
      final key = dateKey(_date);
      final schedule = await context.read<ApiService>().roomSchedule(widget.room.id, key, key);
      if (mounted) setState(() {
        _scheduleData = schedule;
        _slots = schedule.bookings;
      });
    } catch (_) {
      if (mounted) setState(() {
        _slots = [];
        _scheduleData = null;
      });
    } finally {
      if (mounted) setState(() => _slotsLoading = false);
    }
  }

  Future<void> _pickDate() async {
    final n = nowWib();
    final today = DateTime(n.year, n.month, n.day);
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: today,
      lastDate: today.add(Duration(days: _rules.maxDaysAhead)),
      helpText: 'Pilih tanggal peminjaman',
    );
    if (picked != null) {
      setState(() {
        _date = DateTime(picked.year, picked.month, picked.day);
        _timeError = null;
      });
      _loadSlots();
    }
  }

  Future<void> _pickTime(bool isStart) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: (isStart ? _start : _end) ?? const TimeOfDay(hour: 9, minute: 0),
      helpText: isStart ? 'Waktu mulai' : 'Waktu selesai',
    );
    if (picked != null) {
      setState(() {
        if (isStart) {
          _start = picked;
        } else {
          _end = picked;
        }
        _timeError = null;
      });
    }
  }

  DateTime _instant(TimeOfDay t) => fromWib(_date.year, _date.month, _date.day, t.hour, t.minute);

  /// Validasi waktu di sisi klien (backend tetap memvalidasi ulang).
  String? _validateTime({bool allowOccupied = false}) {
    if (_start == null || _end == null) return 'Pilih waktu mulai dan waktu selesai';
    final s = _instant(_start!);
    final e = _instant(_end!);
    if (!e.isAfter(s)) return 'Waktu selesai harus setelah waktu mulai';
    if (!s.isAfter(DateTime.now().toUtc())) return 'Waktu mulai harus di masa depan';
    final minutes = e.difference(s).inMinutes;
    if (minutes < _rules.minMinutes) return 'Durasi minimal ${_rules.minMinutes} menit';
    if (minutes > _rules.maxHours * 60) return 'Durasi maksimal ${_rules.maxHours} jam';
    final schedule = _scheduleData;
    if (schedule != null) {
      final closures = schedule.closuresFor(_date);
      if (closures.isNotEmpty) return 'Ruangan ditutup: ${closures.first['reason']}';
      if (schedule.isClosed(_date)) return 'Ruangan tutup pada hari yang dipilih';
      final hours = schedule.hoursFor(_date);
      if (hours != null && hours['openTime'] is String && hours['closeTime'] is String) {
        final open = _minutesOf(hours['openTime'] as String);
        final close = _minutesOf(hours['closeTime'] as String);
        if (_start!.hour * 60 + _start!.minute < open || _end!.hour * 60 + _end!.minute > close) {
          return 'Jam operasional ruangan ${hours['openTime']}–${hours['closeTime']} WIB';
        }
      }
    }
    final attendees = int.tryParse(_attendees.text.trim());
    if (attendees == null || attendees < 1) return 'Jumlah peserta minimal 1 orang';
    if (attendees > widget.room.capacity) return 'Jumlah peserta melebihi kapasitas ruangan (maks. ${widget.room.capacity})';
    if (!allowOccupied) {
      for (final slot in _slots) {
        if (slot.startTime.isBefore(e) && slot.endTime.isAfter(s)) {
          return 'Bentrok dengan jadwal ${fmtTime(slot.startTime)}–${fmtTime(slot.endTime)} WIB';
        }
      }
    }
    return null;
  }

  Future<void> _joinQueue(DateTime start, DateTime end) async {
    final api = context.read<ApiService>();
    final entry = await api.joinBookingQueue(
      roomId: widget.room.id,
      title: _title.text.trim(),
      purpose: _purpose.text.trim(),
      attendees: int.parse(_attendees.text.trim()),
      start: start,
      end: end,
    );
    context.read<RefreshState>().bump();
    context.read<NavState>().go(3);
    Navigator.of(context).popUntil((route) => route.isFirst);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text('Anda masuk antrean #${entry.position ?? 1}.')));
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    setState(() => _serverError = null);
    final formOk = _form.currentState!.validate();
    final timeError = _validateTime(allowOccupied: widget.queueOnly);
    setState(() => _timeError = timeError);
    if (!formOk || timeError != null) return;

    final s = _instant(_start!);
    final e = _instant(_end!);
    final ok = await confirmDialog(
      context,
      title: widget.queueOnly ? 'Gabung antrean?' : 'Ajukan peminjaman?',
      message: '${widget.room.name}\n${fmtDateLong(s)}\n${fmtTime(s)} – ${fmtTime(e)} WIB${widget.queueOnly ? '\n\nAnda akan masuk antrean untuk jadwal ini.' : '\n\nPengajuan akan menunggu persetujuan dosen yang ditugaskan atau admin.'}',
      confirmLabel: widget.queueOnly ? 'Gabung antrean' : 'Ya, ajukan',
    );
    if (!ok || !mounted) return;

    setState(() => _submitting = true);
    final api = context.read<ApiService>();
    final refresh = context.read<RefreshState>();
    final nav = context.read<NavState>();
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      if (widget.queueOnly) {
        await _joinQueue(s, e);
        return;
      }
      await api.createBooking(
        roomId: widget.room.id,
        title: _title.text.trim(),
        purpose: _purpose.text.trim(),
        attendees: int.parse(_attendees.text.trim()),
        start: s,
        end: e,
      );
      refresh.bump();
      nav.go(3);
      navigator.popUntil((route) => route.isFirst);
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Pengajuan terkirim. Menunggu persetujuan admin.')));
    } on ApiException catch (ex) {
      if (mounted) {
        setState(() => _serverError = ex.message);
        if (ex.statusCode == 409) _loadSlots();
        if (!widget.queueOnly && ex.statusCode == 409 && ex.message.toLowerCase().contains('bentrok')) {
          final join = await confirmDialog(
            context,
            title: 'Jadwal ruangan penuh',
            message: 'Ingin masuk antrean untuk jadwal ini? Antrean diproses berurutan saat slot tersedia.',
            confirmLabel: 'Masuk antrean',
          );
          if (join && mounted) {
            try {
              await _joinQueue(s, e);
            } on ApiException catch (queueError) {
              if (mounted) setState(() => _serverError = queueError.message);
            }
          }
        }
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.queueOnly ? 'Gabung Antrean' : 'Ajukan Peminjaman')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
          child: Form(
            key: _form,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              AppCard(
                padding: const EdgeInsets.all(12),
                child: Row(children: [
                  SizedBox(width: 72, child: RoomImage(url: widget.room.imageFullUrl, height: 72, radius: 12, label: widget.room.code)),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(widget.room.name, style: const TextStyle(fontFamily: AppTheme.serif, fontSize: 18, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 3),
                      Text('${widget.room.location} · ${widget.room.capacity} orang',
                          style: const TextStyle(color: AppColors.textSecondary, fontSize: 12.5)),
                    ]),
                  ),
                ]),
              ),
              const SizedBox(height: 22),
              if (_serverError != null) ...[
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF3F2),
                    borderRadius: BorderRadius.circular(AppRadius.control),
                    border: Border.all(color: const Color(0xFFFECDCA)),
                  ),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Icon(Icons.error_outline, color: AppColors.danger, size: 20),
                    const SizedBox(width: 10),
                    Expanded(child: Text(_serverError!, style: const TextStyle(color: Color(0xFFB42318), height: 1.4))),
                  ]),
                ),
                const SizedBox(height: 16),
              ],
              TextFormField(
                controller: _title,
                textCapitalization: TextCapitalization.sentences,
                textInputAction: TextInputAction.next,
                maxLength: 150,
                decoration: const InputDecoration(labelText: 'Tujuan peminjaman', hintText: 'Contoh: Rapat himpunan mahasiswa', prefixIcon: Icon(Icons.flag_outlined)),
                validator: (v) {
                  final t = (v ?? '').trim();
                  if (t.isEmpty) return 'Tujuan peminjaman wajib diisi';
                  if (t.length < 3) return 'Minimal 3 karakter';
                  return null;
                },
              ),
              const SizedBox(height: 8),
              const Text('Tanggal & waktu', style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              _PickerTile(icon: Icons.calendar_month_outlined, label: 'Tanggal', value: fmtWibDateLong(_date), onTap: _pickDate),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(child: _PickerTile(icon: Icons.schedule, label: 'Mulai', value: _start?.format(context) ?? 'Pilih', onTap: () => _pickTime(true))),
                const SizedBox(width: 10),
                Expanded(child: _PickerTile(icon: Icons.schedule, label: 'Selesai', value: _end?.format(context) ?? 'Pilih', onTap: () => _pickTime(false))),
              ]),
              if (_timeError != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8, left: 4),
                  child: Text(_timeError!, style: const TextStyle(color: AppColors.danger, fontSize: 12.5)),
                ),
              Padding(
                padding: const EdgeInsets.only(top: 8, left: 4),
                child: Text('Durasi ${_rules.minMinutes} menit – ${_rules.maxHours} jam · maks. ${_rules.maxDaysAhead} hari ke depan',
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
              ),
              const SizedBox(height: 16),
              _SlotsHint(loading: _slotsLoading, slots: _slots),
              if (_scheduleData != null) ...[
                const SizedBox(height: 8),
                _OperatingHoursHint(schedule: _scheduleData!, date: _date),
              ],
              const SizedBox(height: 16),
              TextFormField(
                controller: _attendees,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Jumlah peserta',
                  helperText: 'Kapasitas maksimal ${widget.room.capacity} orang',
                  prefixIcon: const Icon(Icons.groups_outlined),
                ),
                validator: (value) {
                  final attendees = int.tryParse((value ?? '').trim());
                  if (attendees == null || attendees < 1) return 'Jumlah peserta minimal 1 orang';
                  if (attendees > widget.room.capacity) return 'Maksimal ${widget.room.capacity} orang';
                  return null;
                },
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _purpose,
                maxLines: 4,
                maxLength: 2000,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(labelText: 'Deskripsi kegiatan', alignLabelWithHint: true, hintText: 'Jelaskan kegiatan, jumlah peserta, dan kebutuhan lain'),
                validator: (v) {
                  final t = (v ?? '').trim();
                  if (t.isEmpty) return 'Deskripsi kegiatan wajib diisi';
                  if (t.length < 3) return 'Minimal 3 karakter';
                  return null;
                },
              ),
              const SizedBox(height: 14),
              LoadingButton(label: widget.queueOnly ? 'Gabung antrean' : 'Ajukan Peminjaman', icon: widget.queueOnly ? Icons.queue_outlined : Icons.send_rounded, loading: _submitting, onPressed: _submit),
            ]),
          ),
        ),
      ),
    );
  }
}

int _minutesOf(String time) {
  final parts = time.split(':');
  return int.parse(parts[0]) * 60 + int.parse(parts[1]);
}

class _OperatingHoursHint extends StatelessWidget {
  const _OperatingHoursHint({required this.schedule, required this.date});

  final RoomScheduleData schedule;
  final DateTime date;

  @override
  Widget build(BuildContext context) {
    final closures = schedule.closuresFor(date);
    final hours = schedule.hoursFor(date);
    final message = closures.isNotEmpty
        ? 'Ditutup: ${closures.first['reason']}'
        : schedule.isClosed(date)
            ? 'Ruangan tutup pada hari ini.'
            : hours == null
                ? 'Jam operasional belum dibatasi.'
                : 'Jam operasional: ${hours['openTime']}–${hours['closeTime']} WIB.';
    return Text(message, style: TextStyle(
      color: closures.isNotEmpty || schedule.isClosed(date) ? AppColors.danger : AppColors.textSecondary,
      fontSize: 12,
    ));
  }
}

class _PickerTile extends StatelessWidget {
  const _PickerTile({required this.icon, required this.label, required this.value, required this.onTap});

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.control),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(AppRadius.control),
          border: Border.all(color: AppColors.line),
        ),
        child: Row(children: [
          Icon(icon, color: AppColors.goldDeep, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: const TextStyle(fontSize: 11.5, color: AppColors.textSecondary)),
              const SizedBox(height: 2),
              Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _SlotsHint extends StatelessWidget {
  const _SlotsHint({required this.loading, required this.slots});

  final bool loading;
  final List<ScheduleSlot> slots;

  @override
  Widget build(BuildContext context) {
    if (loading) return const SkeletonBox(height: 56, radius: 14);
    final text = slots.isEmpty
        ? 'Belum ada jadwal pada tanggal ini — semua jam tersedia.'
        : 'Jam terisi: ${slots.map((s) => '${fmtTime(s.startTime)}–${fmtTime(s.endTime)}').join(', ')}';
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.goldTint, borderRadius: BorderRadius.circular(AppRadius.control)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(slots.isEmpty ? Icons.check_circle_outline : Icons.info_outline, size: 19, color: AppColors.goldDeep),
        const SizedBox(width: 10),
        Expanded(child: Text(text, style: const TextStyle(fontSize: 13, color: AppColors.goldDeep, fontWeight: FontWeight.w600, height: 1.4))),
      ]),
    );
  }
}
