import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_service.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../widgets/common.dart';
import 'booking_form_screen.dart';

class RoomDetailScreen extends StatefulWidget {
  const RoomDetailScreen({super.key, required this.roomId});

  final int roomId;

  @override
  State<RoomDetailScreen> createState() => _RoomDetailScreenState();
}

class _RoomDetailScreenState extends State<RoomDetailScreen> {
  late Future<Room> _room;
  late Future<RoomScheduleData> _schedule;
  late DateTime _day; // tanggal dinding WIB (hanya y/m/d)
  TimeOfDay _selectedStart = const TimeOfDay(hour: 10, minute: 0);
  TimeOfDay _selectedEnd = const TimeOfDay(hour: 11, minute: 0);

  DateTime _windowDateTime(TimeOfDay time) =>
      fromWib(_day.year, _day.month, _day.day, time.hour, time.minute);

  void _reloadRoom() {
    _room = context.read<ApiService>().room(
          widget.roomId,
          start: _windowDateTime(_selectedStart),
          end: _windowDateTime(_selectedEnd),
        );
  }

  @override
  void initState() {
    super.initState();
    final n = nowWib();
    _day = DateTime(n.year, n.month, n.day);
    _room = context.read<ApiService>().room(
          widget.roomId,
          start: _windowDateTime(_selectedStart),
          end: _windowDateTime(_selectedEnd),
        );
    _loadSchedule();
  }

  void _loadSchedule() {
    final key = dateKey(_day);
    _schedule = context.read<ApiService>().roomSchedule(widget.roomId, key, key);
  }

  void _reloadAll() {
    setState(() {
      _reloadRoom();
      _loadSchedule();
    });
  }

  Future<void> _pickTime({required bool start}) async {
    final selected = await showTimePicker(
      context: context,
      initialTime: start ? _selectedStart : _selectedEnd,
      helpText: start ? 'Pilih waktu mulai' : 'Pilih waktu selesai',
    );
    if (selected == null || !mounted) return;
    setState(() {
      if (start) {
        _selectedStart = selected;
      } else {
        _selectedEnd = selected;
      }
      _reloadRoom();
    });
  }

  Future<void> _openBooking(Room room, {required bool queueOnly}) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => BookingFormScreen(
        room: room,
        initialDate: _day,
        initialStart: _selectedStart,
        initialEnd: _selectedEnd,
        queueOnly: queueOnly,
      ),
    ));
    if (mounted) _reloadAll();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: AsyncBody<Room>(
        future: _room,
        onRetry: _reloadAll,
        skeleton: const SafeArea(child: ListSkeleton(count: 3, height: 160)),
        builder: (context, room) => _content(room),
      ),
    );
  }

  Widget _content(Room room) {
    final days = List.generate(14, (i) {
      final n = nowWib();
      return DateTime(n.year, n.month, n.day).add(Duration(days: i));
    });

    return Stack(children: [
      CustomScrollView(slivers: [
        SliverAppBar(
          pinned: true,
          expandedHeight: 260,
          backgroundColor: AppColors.primaryDark,
          foregroundColor: Colors.white,
          flexibleSpace: FlexibleSpaceBar(
            background: Stack(fit: StackFit.expand, children: [
              RoomImage(url: room.imageFullUrl, height: 260, radius: 0, label: room.code),
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0x66000000), Color(0x00000000), Color(0x99101828)],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                ),
              ),
            ]),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 120),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                if (room.category != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: AppColors.goldTint, borderRadius: BorderRadius.circular(99)),
                    child: Text(room.category!, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.goldDeep)),
                  ),
                const Spacer(),
                RoomStatusChip(available: room.isAvailable, inUse: room.inUseNow),
              ]),
              const SizedBox(height: 12),
              Text(room.name, style: const TextStyle(fontFamily: AppTheme.serif, fontSize: 30, fontWeight: FontWeight.w600, height: 1.15)),
              const SizedBox(height: 4),
              Text('Kode ${room.code}', style: const TextStyle(color: AppColors.textSecondary)),
              const SizedBox(height: 18),
              Row(children: [
                Expanded(child: _InfoBox(icon: Icons.place_outlined, label: 'Lokasi', value: room.location)),
                const SizedBox(width: 12),
                Expanded(child: _InfoBox(icon: Icons.people_outline, label: 'Kapasitas', value: '${room.capacity} orang')),
              ]),
              const SizedBox(height: 12),
              AppCard(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(room.availabilityMessage ?? 'Pilih waktu untuk melihat ketersediaan',
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 5),
                  Text(
                    'Antrean ${room.waitlistCount} orang'
                    '${room.myWaitlistPosition == null ? '' : ' · Posisi Anda #${room.myWaitlistPosition}'}',
                    style: const TextStyle(color: AppColors.textSecondary),
                  ),
                ]),
              ),
              if (room.description != null && room.description!.isNotEmpty) ...[
                const SizedBox(height: 22),
                const Text('Deskripsi', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                const SizedBox(height: 8),
                Text(room.description!, style: const TextStyle(color: AppColors.textSecondary, height: 1.6)),
              ],
              if (room.facilityList.isNotEmpty) ...[
                const SizedBox(height: 22),
                const Text('Fasilitas', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                const SizedBox(height: 10),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final f in room.facilityList)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.line),
                      ),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Icons.check_circle_outline, size: 15, color: AppColors.success),
                        const SizedBox(width: 6),
                        Text(f, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                      ]),
                    ),
                ]),
              ],
              const SizedBox(height: 26),
              const Text('Jadwal ruangan', style: TextStyle(fontFamily: AppTheme.serif, fontWeight: FontWeight.w600, fontSize: 21)),
              const SizedBox(height: 4),
              Text(fmtWibDateLong(_day), style: const TextStyle(color: AppColors.textSecondary)),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(child: OutlinedButton.icon(
                  onPressed: () => _pickTime(start: true),
                  icon: const Icon(Icons.access_time),
                  label: Text('Mulai ${_selectedStart.format(context)}'),
                )),
                const SizedBox(width: 8),
                Expanded(child: OutlinedButton.icon(
                  onPressed: () => _pickTime(start: false),
                  icon: const Icon(Icons.access_time_filled),
                  label: Text('Selesai ${_selectedEnd.format(context)}'),
                )),
              ]),
              const SizedBox(height: 12),
              SizedBox(
                height: 68,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: days.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (context, i) {
                    final d = days[i];
                    final selected = dateKey(d) == dateKey(_day);
                    return InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: () => setState(() {
                        _day = d;
                        _loadSchedule();
                        _reloadRoom();
                      }),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        width: 56,
                        decoration: BoxDecoration(
                          color: selected ? AppColors.primaryDark : AppColors.surface,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: selected ? AppColors.primaryDark : AppColors.line),
                        ),
                        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                          Text(fmtDayShort(d), style: TextStyle(fontSize: 11.5, color: selected ? AppColors.lightGold : AppColors.textSecondary)),
                          const SizedBox(height: 3),
                          Text('${d.day}', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: selected ? Colors.white : AppColors.textPrimary)),
                        ]),
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: 16),
              FutureBuilder<RoomScheduleData>(
                future: _schedule,
                builder: (context, snap) {
                  if (snap.connectionState != ConnectionState.done) {
                    return const SkeletonBox(height: 120, radius: 18);
                  }
                  if (snap.hasError) {
                    return AppCard(
                      child: Row(children: [
                        const Icon(Icons.error_outline, color: AppColors.danger),
                        const SizedBox(width: 10),
                        Expanded(child: Text(snap.error.toString(), style: const TextStyle(color: AppColors.textSecondary))),
                        TextButton(onPressed: () => setState(_loadSchedule), child: const Text('Ulangi')),
                      ]),
                    );
                  }
                  return _Timeline(day: _day, schedule: snap.data!);
                },
              ),
            ]),
          ),
        ),
      ]),
      Positioned(
        left: 0,
        right: 0,
        bottom: 0,
        child: Container(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 22),
          decoration: const BoxDecoration(
            color: AppColors.surface,
            border: Border(top: BorderSide(color: AppColors.line)),
          ),
          child: SafeArea(
            top: false,
            child: FilledButton.icon(
              onPressed: !room.isAvailable
                  ? null
                  : room.availabilityStatus == 'OCCUPIED'
                      ? () => _openBooking(room, queueOnly: true)
                      : () => _openBooking(room, queueOnly: false),
              icon: Icon(room.availabilityStatus == 'OCCUPIED' ? Icons.queue_outlined : Icons.event_available_outlined),
              label: Text(!room.isAvailable
                  ? 'Ruangan tidak tersedia'
                  : room.availabilityStatus == 'OCCUPIED'
                      ? 'Gabung antrean'
                      : 'Ajukan Peminjaman'),
            ),
          ),
        ),
      ),
    ]);
  }
}

class _InfoBox extends StatelessWidget {
  const _InfoBox({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, color: AppColors.goldDeep, size: 22),
        const SizedBox(height: 8),
        Text(label, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
        const SizedBox(height: 2),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
      ]),
    );
  }
}

/// Bilah jam operasional dengan blok terpakai + daftar slot.
class _Timeline extends StatelessWidget {
  const _Timeline({required this.day, required this.schedule});

  final DateTime day;
  final RoomScheduleData schedule;

  @override
  Widget build(BuildContext context) {
    final closures = schedule.closuresFor(day);
    if (closures.isNotEmpty || schedule.isClosed(day)) {
      return AppCard(
        child: Text(
          closures.isNotEmpty ? 'Ruangan ditutup: ${closures.first['reason']}' : 'Ruangan tutup pada hari ini.',
          style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600),
        ),
      );
    }
    final hours = schedule.hoursFor(day);
    final open = hours?['openTime'] as String? ?? '07:00';
    final close = hours?['closeTime'] as String? ?? '21:00';
    final opening = open.split(':').map(int.parse).toList();
    final closing = close.split(':').map(int.parse).toList();
    final openMinutes = opening[0] * 60 + opening[1];
    final closeMinutes = closing[0] * 60 + closing[1];
    final totalMinutes = closeMinutes - openMinutes;
    final dayStart = fromWib(day.year, day.month, day.day, opening[0], opening[1]);

    double offset(DateTime t) {
      final m = t.difference(dayStart).inMinutes.clamp(0, totalMinutes);
      return m / totalMinutes;
    }

    return AppCard(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        LayoutBuilder(builder: (context, c) {
          final w = c.maxWidth;
          return Column(children: [
            Container(
              height: 34,
              decoration: BoxDecoration(
                color: const Color(0xFFD1FADF),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Stack(children: [
                for (final s in schedule.bookings)
                  Positioned(
                    left: w * offset(s.startTime),
                    width: (w * (offset(s.endTime) - offset(s.startTime))).clamp(2.0, w),
                    top: 0,
                    bottom: 0,
                    child: Container(
                      decoration: BoxDecoration(
                        color: s.status == 'APPROVED' ? AppColors.secondaryDark : AppColors.gold,
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ),
              ]),
            ),
            const SizedBox(height: 6),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              for (final h in [open, close])
                Text(h, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
            ]),
          ]);
        }),
        const SizedBox(height: 14),
        const Wrap(spacing: 14, runSpacing: 6, children: [
          _Legend(color: Color(0xFFD1FADF), label: 'Tersedia'),
          _Legend(color: AppColors.secondaryDark, label: 'Terpakai'),
          _Legend(color: AppColors.gold, label: 'Menunggu persetujuan'),
        ]),
        const SizedBox(height: 14),
        if (schedule.bookings.isEmpty)
          const Row(children: [
            Icon(Icons.check_circle_outline, color: AppColors.success, size: 20),
            SizedBox(width: 8),
            Expanded(child: Text('Tidak ada peminjaman — ruangan tersedia sepanjang hari.', style: TextStyle(fontWeight: FontWeight.w600))),
          ])
        else
          for (final s in schedule.bookings)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(children: [
                Icon(Icons.circle, size: 10, color: s.status == 'APPROVED' ? AppColors.secondaryDark : AppColors.gold),
                const SizedBox(width: 10),
                Text('${fmtTime(s.startTime)} – ${fmtTime(s.endTime)} WIB', style: const TextStyle(fontWeight: FontWeight.w600)),
                const Spacer(),
                Text(s.status == 'APPROVED' ? 'Terpakai' : 'Menunggu', style: const TextStyle(fontSize: 12.5, color: AppColors.textSecondary)),
              ]),
            ),
      ]),
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 12, height: 12, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(4))),
        const SizedBox(width: 6),
        Text(label, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
      ]);
}
