import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_service.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../state/auth_state.dart';
import '../widgets/common.dart';
import '../widgets/room_card.dart';
import 'booking_detail_screen.dart';
import 'notifications_screen.dart';
import 'room_detail_screen.dart';
import 'violation_points_screen.dart';

class _HomeData {
  _HomeData(this.bookings, this.popular, this.availableNow, this.unread, this.quota);

  final BookingPage bookings;
  final List<Room> popular;
  final List<Room> availableNow;
  final int unread;
  final BookingQuota? quota;
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<_HomeData> _future;
  int _seen = -1;
  final _search = TextEditingController();

  Future<_HomeData> _load() async {
    final api = context.read<ApiService>();
    final now = DateTime.now().toUtc();
    final results = await Future.wait<dynamic>([
      api.myBookings(pageSize: 3),
      api.rooms(sort: 'popular', pageSize: 6),
      api.availableRooms(start: now, end: now.add(const Duration(hours: 1))),
      api.unreadCount(),
      api.bookingQuota().then<BookingQuota?>((quota) => quota, onError: (Object error) {
        debugPrint('Gagal memuat kuota booking: $error');
        return null;
      }),
    ]);
    return _HomeData(
      results[0] as BookingPage,
      (results[1] as RoomPage).items,
      results[2] as List<Room>,
      results[3] as int,
      results[4] as BookingQuota?,
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final v = context.watch<RefreshState>().version;
    if (v != _seen) {
      _seen = v;
      _future = _load();
    }
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _reload() => setState(() => _future = _load());

  void _openRoom(Room r) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => RoomDetailScreen(roomId: r.id)));

  Future<void> _openNotifications() async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const NotificationsScreen()));
    if (mounted) _reload();
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthState>().user;
    final nav = context.read<NavState>();

    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        color: AppColors.goldDeep,
        onRefresh: () async {
          _reload();
          await _future.catchError((_) => _HomeData(BookingPage(items: [], summary: BookingSummary({}), total: 0), [], [], 0, const BookingQuota(activeBookings: 0, maxActiveBookings: 3, activeQueueEntries: 0, maxQueueEntries: 3)));
        },
        child: ListView(
          padding: const EdgeInsets.only(bottom: 24),
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 12, 0),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(fmtWibDateLong(nowWib()),
                        style: const TextStyle(fontSize: 12.5, color: AppColors.textSecondary, letterSpacing: 0.2)),
                    const SizedBox(height: 4),
                    Text('${greeting()},',
                        style: const TextStyle(fontSize: 15, color: AppColors.textSecondary)),
                    Text(user?.name ?? 'Mahasiswa',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontFamily: AppTheme.serif, fontSize: 26, fontWeight: FontWeight.w600, height: 1.2)),
                  ]),
                ),
                FutureBuilder<_HomeData>(
                  future: _future,
                  builder: (context, snap) {
                    final unread = snap.data?.unread ?? 0;
                    return IconButton(
                      tooltip: 'Notifikasi',
                      onPressed: _openNotifications,
                      icon: Badge(
                        isLabelVisible: unread > 0,
                        label: Text(unread > 9 ? '9+' : '$unread'),
                        backgroundColor: AppColors.gold,
                        textColor: AppColors.primaryDark,
                        child: const Icon(Icons.notifications_none_rounded, size: 28),
                      ),
                    );
                  },
                ),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: TextField(
                controller: _search,
                textInputAction: TextInputAction.search,
                onSubmitted: (v) => nav.go(1, query: v.trim()),
                decoration: InputDecoration(
                  hintText: 'Cari ruangan, kode, atau lokasi…',
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: IconButton(
                    tooltip: 'Cari',
                    icon: const Icon(Icons.arrow_forward_rounded),
                    onPressed: () => nav.go(1, query: _search.text.trim()),
                  ),
                ),
              ),
            ),
            const _Banner(),
            AsyncBody<_HomeData>(
              future: _future,
              onRetry: _reload,
              skeleton: const _HomeSkeleton(),
              builder: (context, data) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                _Stats(summary: data.bookings.summary),
                _BookingQuotaCard(quota: data.quota),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
                  child: AppCard(
                    onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
                      builder: (_) => const ViolationPointsScreen(),
                    )),
                    child: const Row(children: [
                      Icon(Icons.fact_check_outlined, color: AppColors.goldDeep),
                      SizedBox(width: 12),
                      Expanded(child: Text('Lihat poin & sanksi saya', style: TextStyle(fontWeight: FontWeight.w700))),
                      Icon(Icons.chevron_right_rounded),
                    ]),
                  ),
                ),
                _QuickActions(onNotifications: _openNotifications),
                SectionTitle('Ruangan populer', actionLabel: 'Lihat semua', onAction: () => nav.go(1)),
                _RoomRail(rooms: data.popular, onTap: _openRoom, empty: 'Belum ada ruangan.'),
                SectionTitle('Tersedia sekarang', actionLabel: 'Cari waktu lain', onAction: () => nav.go(2)),
                _RoomRail(rooms: data.availableNow, onTap: _openRoom, empty: 'Semua ruangan sedang terpakai.'),
                SectionTitle('Booking terbaru', actionLabel: 'Riwayat', onAction: () => nav.go(3)),
                if (data.bookings.items.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 20),
                    child: AppCard(child: Text('Belum ada peminjaman. Ajukan peminjaman pertama Anda!',
                        style: TextStyle(color: AppColors.textSecondary))),
                  )
                else
                  for (final b in data.bookings.items)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                      child: BookingTile(booking: b, onChanged: _reload),
                    ),
              ]),
            ),
          ],
        ),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 18, 20, 0),
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(26),
        gradient: const LinearGradient(
          colors: [AppColors.primaryDark, Color(0xFF22324D)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: const [BoxShadow(color: Color(0x33101828), blurRadius: 30, offset: Offset(0, 14))],
      ),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: const Color(0x33C6A56B), borderRadius: BorderRadius.circular(99)),
              child: const Text('PREMIUM CAMPUS BOOKING',
                  style: TextStyle(color: AppColors.lightGold, fontSize: 10, letterSpacing: 1.3, fontWeight: FontWeight.w700)),
            ),
            const SizedBox(height: 14),
            const Text('Find Your Space.\nMake It Happen.',
                style: TextStyle(fontFamily: AppTheme.serif, color: Colors.white, fontSize: 24, height: 1.2, fontWeight: FontWeight.w600)),
            const SizedBox(height: 10),
            const Text('Pinjam ruangan kampus kapan saja, di mana saja.',
                style: TextStyle(color: Color(0xFFAAB4C6), fontSize: 13, height: 1.4)),
          ]),
        ),
        const SizedBox(width: 12),
        const Icon(Icons.apartment_rounded, size: 64, color: AppColors.gold),
      ]),
    );
  }
}

class _Stats extends StatelessWidget {
  const _Stats({required this.summary});

  final BookingSummary summary;

  @override
  Widget build(BuildContext context) {
    final items = [
      ('Total', summary.total, Icons.event_note_outlined, AppColors.primaryDark),
      ('Menunggu', summary.count('PENDING'), Icons.hourglass_bottom_rounded, AppColors.warning),
      ('Disetujui', summary.count('APPROVED'), Icons.check_circle_outline, AppColors.success),
      ('Selesai', summary.count('COMPLETED'), Icons.task_alt_outlined, const Color(0xFF3A5A8C)),
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
      child: Row(children: [
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) const SizedBox(width: 10),
          Expanded(
            child: AppCard(
              padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
              child: Column(children: [
                Icon(items[i].$3, size: 20, color: items[i].$4),
                const SizedBox(height: 8),
                Text('${items[i].$2}',
                    style: const TextStyle(fontFamily: AppTheme.serif, fontSize: 24, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(items[i].$1, style: const TextStyle(fontSize: 11.5, color: AppColors.textSecondary)),
              ]),
            ),
          ),
        ],
      ]),
    );
  }
}

class _BookingQuotaCard extends StatelessWidget {
  const _BookingQuotaCard({required this.quota});

  final BookingQuota? quota;

  @override
  Widget build(BuildContext context) {
    final bookingText = quota == null
        ? 'Kuota booking belum dapat dimuat. Tarik layar untuk mencoba lagi.'
        : '${quota!.activeBookings} dari ${quota!.maxActiveBookings} peminjaman aktif';
    final queueText = quota == null
        ? ''
        : '${quota!.activeQueueEntries} dari ${quota!.maxQueueEntries} antrean aktif';

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
      child: AppCard(
        child: Row(children: [
          const Icon(Icons.pie_chart_outline_rounded, color: AppColors.goldDeep),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Kuota Anda', style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text(bookingText, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
              if (queueText.isNotEmpty)
                Text(queueText, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.onNotifications});

  final VoidCallback onNotifications;

  @override
  Widget build(BuildContext context) {
    final nav = context.read<NavState>();
    final actions = [
      ('Ajukan', Icons.add_circle_outline, () => nav.go(2)),
      ('Ruangan', Icons.meeting_room_outlined, () => nav.go(1)),
      ('Riwayat', Icons.history, () => nav.go(3)),
      ('Notifikasi', Icons.notifications_none_rounded, onNotifications),
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
      child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        for (final a in actions)
          InkWell(
            onTap: a.$3,
            borderRadius: BorderRadius.circular(18),
            child: SizedBox(
              width: 76,
              child: Column(children: [
                Container(
                  width: 54,
                  height: 54,
                  decoration: BoxDecoration(color: AppColors.goldTint, borderRadius: BorderRadius.circular(18)),
                  child: Icon(a.$2, color: AppColors.goldDeep),
                ),
                const SizedBox(height: 7),
                Text(a.$1, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
              ]),
            ),
          ),
      ]),
    );
  }
}

class _RoomRail extends StatelessWidget {
  const _RoomRail({required this.rooms, required this.onTap, required this.empty});

  final List<Room> rooms;
  final void Function(Room) onTap;
  final String empty;

  @override
  Widget build(BuildContext context) {
    if (rooms.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: AppCard(child: Text(empty, style: const TextStyle(color: AppColors.textSecondary))),
      );
    }
    return SizedBox(
      height: 232,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        itemCount: rooms.length,
        separatorBuilder: (_, __) => const SizedBox(width: 14),
        itemBuilder: (_, i) => RoomCard(room: rooms[i], compact: true, onTap: () => onTap(rooms[i])),
      ),
    );
  }
}

class _HomeSkeleton extends StatelessWidget {
  const _HomeSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 0),
      child: Column(children: [
        Row(children: [
          Expanded(child: SkeletonBox(height: 86, radius: 20)),
          SizedBox(width: 10),
          Expanded(child: SkeletonBox(height: 86, radius: 20)),
          SizedBox(width: 10),
          Expanded(child: SkeletonBox(height: 86, radius: 20)),
          SizedBox(width: 10),
          Expanded(child: SkeletonBox(height: 86, radius: 20)),
        ]),
        SizedBox(height: 24),
        SkeletonBox(height: 200, radius: 20),
        SizedBox(height: 16),
        SkeletonBox(height: 90, radius: 20),
      ]),
    );
  }
}

/// Baris ringkas satu peminjaman — dipakai di beranda dan riwayat.
class BookingTile extends StatelessWidget {
  const BookingTile({super.key, required this.booking, this.onChanged});

  final Booking booking;
  final VoidCallback? onChanged;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: () async {
        final changed = await Navigator.of(context).push<bool>(
          MaterialPageRoute<bool>(builder: (_) => BookingDetailScreen(bookingId: booking.id)),
        );
        if (changed == true) onChanged?.call();
      },
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Text(booking.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5)),
          ),
          const SizedBox(width: 8),
          StatusBadge(booking.status),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          const Icon(Icons.meeting_room_outlined, size: 16, color: AppColors.textSecondary),
          const SizedBox(width: 6),
          Expanded(child: Text(booking.room.name, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13))),
        ]),
        const SizedBox(height: 4),
        Row(children: [
          const Icon(Icons.schedule_outlined, size: 16, color: AppColors.textSecondary),
          const SizedBox(width: 6),
          Expanded(
            child: Text(fmtRange(booking.startTime, booking.endTime),
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
          ),
        ]),
      ]),
    );
  }
}
