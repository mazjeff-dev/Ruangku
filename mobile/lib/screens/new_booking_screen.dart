import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/api_service.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../widgets/common.dart';
import '../widgets/room_card.dart';
import 'booking_form_screen.dart';

/// Tab "Peminjaman": cari ruangan yang kosong pada tanggal & jam pilihan, lalu ajukan.
class NewBookingScreen extends StatefulWidget {
  const NewBookingScreen({super.key});

  @override
  State<NewBookingScreen> createState() => _NewBookingScreenState();
}

class _NewBookingScreenState extends State<NewBookingScreen> {
  late DateTime _date;
  TimeOfDay _start = const TimeOfDay(hour: 9, minute: 0);
  TimeOfDay _end = const TimeOfDay(hour: 11, minute: 0);
  int? _minCapacity;
  List<Room>? _results;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final n = nowWib().add(const Duration(days: 1));
    _date = DateTime(n.year, n.month, n.day);
  }

  Future<void> _pickDate() async {
    final n = nowWib();
    final today = DateTime(n.year, n.month, n.day);
    final picked = await showDatePicker(
      context: context,
      initialDate: _date.isBefore(today) ? today : _date,
      firstDate: today,
      lastDate: today.add(const Duration(days: 90)),
    );
    if (picked != null) setState(() => _date = DateTime(picked.year, picked.month, picked.day));
  }

  Future<void> _pickTime(bool isStart) async {
    final picked = await showTimePicker(context: context, initialTime: isStart ? _start : _end);
    if (picked != null) setState(() => isStart ? _start = picked : _end = picked);
  }

  Future<void> _search() async {
    final s = fromWib(_date.year, _date.month, _date.day, _start.hour, _start.minute);
    final e = fromWib(_date.year, _date.month, _date.day, _end.hour, _end.minute);
    if (!e.isAfter(s)) {
      setState(() => _error = 'Waktu selesai harus setelah waktu mulai.');
      return;
    }
    if (!s.isAfter(DateTime.now().toUtc())) {
      setState(() => _error = 'Waktu mulai harus di masa depan.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rooms = await context.read<ApiService>().availableRooms(start: s, end: e, minCapacity: _minCapacity);
      if (mounted) setState(() => _results = rooms);
    } on ApiException catch (ex) {
      if (mounted) setState(() => _error = ex.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
        children: [
          const Text('Ajukan Peminjaman', style: TextStyle(fontFamily: AppTheme.serif, fontSize: 30, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          const Text('Tentukan waktu, lalu pilih dari ruangan yang masih kosong.', style: TextStyle(color: AppColors.textSecondary, height: 1.5)),
          const SizedBox(height: 20),
          AppCard(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              _Tile(icon: Icons.calendar_month_outlined, label: 'Tanggal', value: fmtWibDateLong(_date), onTap: _pickDate),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(child: _Tile(icon: Icons.schedule, label: 'Mulai', value: _start.format(context), onTap: () => _pickTime(true))),
                const SizedBox(width: 10),
                Expanded(child: _Tile(icon: Icons.schedule, label: 'Selesai', value: _end.format(context), onTap: () => _pickTime(false))),
              ]),
              const SizedBox(height: 16),
              const Text('Kapasitas minimum', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              const SizedBox(height: 8),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final c in const [null, 10, 20, 50, 100])
                  ChoiceChip(
                    label: Text(c == null ? 'Semua' : '$c+'),
                    selected: _minCapacity == c,
                    onSelected: (_) => setState(() => _minCapacity = c),
                    selectedColor: AppColors.primaryDark,
                    labelStyle: TextStyle(color: _minCapacity == c ? Colors.white : AppColors.textPrimary, fontWeight: FontWeight.w600),
                    showCheckmark: false,
                  ),
              ]),
              const SizedBox(height: 18),
              LoadingButton(label: 'Cari ruangan tersedia', icon: Icons.search_rounded, loading: _loading, onPressed: _search),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
                ),
            ]),
          ),
          const SizedBox(height: 22),
          if (_results != null) ...[
            Text('${_results!.length} ruangan tersedia', style: const TextStyle(fontFamily: AppTheme.serif, fontSize: 19, fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            if (_results!.isEmpty)
              const AppCard(
                child: Row(children: [
                  Icon(Icons.event_busy_outlined, color: AppColors.goldDeep),
                  SizedBox(width: 12),
                  Expanded(child: Text('Tidak ada ruangan kosong pada waktu tersebut. Coba ubah jam atau tanggal.', style: TextStyle(height: 1.4))),
                ]),
              )
            else
              for (final room in _results!)
                Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: RoomCard(
                    room: room,
                    onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
                      builder: (_) => BookingFormScreen(room: room, initialDate: _date, initialStart: _start, initialEnd: _end),
                    )),
                  ),
                ),
          ],
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.icon, required this.label, required this.value, required this.onTap});

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
          color: AppColors.background,
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
