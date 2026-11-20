import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/api_service.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../state/auth_state.dart';
import '../widgets/common.dart';
import 'home_screen.dart' show BookingTile;

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  static const _tabs = <(String?, String)>[
    (null, 'Semua'),
    ('PENDING', 'Menunggu'),
    ('APPROVED', 'Disetujui'),
    ('REJECTED', 'Ditolak'),
    ('CANCELLED', 'Dibatalkan'),
    ('COMPLETED', 'Selesai'),
    ('NO_SHOW', 'Tidak hadir'),
  ];

  String? _status;
  bool _showQueue = false;
  late Future<BookingPage> _future;
  late Future<List<BookingQueueEntry>> _queueFuture;
  BookingSummary? _summary;
  int _seen = -1;

  Future<BookingPage> _load() async {
    final page = await context.read<ApiService>().myBookings(status: _status);
    _summary = page.summary;
    return page;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final v = context.watch<RefreshState>().version;
    if (v != _seen) {
      _seen = v;
      _future = _load();
      _queueFuture = context.read<ApiService>().myBookingQueue();
    }
  }

  void _reload() => setState(() {
        _future = _load();
        _queueFuture = context.read<ApiService>().myBookingQueue();
      });

  Future<void> _cancelQueueEntry(BookingQueueEntry entry) async {
    final ok = await confirmDialog(
      context,
      title: 'Keluar dari antrean?',
      message: 'Antrean ${entry.room.name} untuk "${entry.title}" akan dibatalkan.',
      confirmLabel: 'Batalkan antrean',
      danger: true,
    );
    if (!ok || !mounted) return;
    try {
      await context.read<ApiService>().cancelBookingQueueEntry(entry.id);
      if (mounted) {
        showSnack(context, 'Antrean berhasil dibatalkan');
        setState(() => _queueFuture = context.read<ApiService>().myBookingQueue());
      }
    } on ApiException catch (error) {
      if (mounted) showSnack(context, error.message, error: true);
    }
  }

  int? _countFor(String? status) => status == null ? _summary?.total : _summary?.count(status);

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Column(children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(20, 16, 20, 0),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text('Riwayat', style: TextStyle(fontFamily: AppTheme.serif, fontSize: 30, fontWeight: FontWeight.w600)),
          ),
        ),
        SizedBox(
          height: 58,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 6),
            children: [
              for (final t in _tabs)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(_countFor(t.$1) == null ? t.$2 : '${t.$2} (${_countFor(t.$1)})'),
                    selected: _status == t.$1,
                    onSelected: (_) {
                      _status = t.$1;
                      _showQueue = false;
                      _reload();
                    },
                    selectedColor: AppColors.primaryDark,
                    labelStyle: TextStyle(fontWeight: FontWeight.w600, color: _status == t.$1 ? Colors.white : AppColors.textPrimary),
                    showCheckmark: false,
                    side: const BorderSide(color: AppColors.line),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: const Text('Antrean'),
                  selected: _showQueue,
                  onSelected: (_) => setState(() => _showQueue = true),
                  selectedColor: AppColors.primaryDark,
                  labelStyle: TextStyle(fontWeight: FontWeight.w600, color: _showQueue ? Colors.white : AppColors.textPrimary),
                  showCheckmark: false,
                  side: const BorderSide(color: AppColors.line),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: _showQueue
              ? FutureBuilder<List<BookingQueueEntry>>(
                  future: _queueFuture,
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) return const ListSkeleton(count: 4, height: 100);
                    if (snapshot.hasError) {
                      return EmptyView(
                        icon: Icons.error_outline,
                        title: 'Antrean gagal dimuat',
                        message: '${snapshot.error}',
                        action: FilledButton(onPressed: _reload, child: const Text('Coba lagi')),
                      );
                    }
                    final entries = snapshot.data ?? [];
                    if (entries.isEmpty) {
                      return const EmptyView(
                        icon: Icons.queue_outlined,
                        title: 'Belum ada antrean',
                        message: 'Jika ruangan penuh, Anda dapat bergabung ke antrean dari formulir peminjaman.',
                      );
                    }
                    return RefreshIndicator(
                      color: AppColors.goldDeep,
                      onRefresh: () async {
                        final next = context.read<ApiService>().myBookingQueue();
                        setState(() => _queueFuture = next);
                        try {
                          await next;
                        } on ApiException catch (error) {
                          if (mounted) showSnack(context, error.message, error: true);
                        }
                      },
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(20, 6, 20, 24),
                        itemCount: entries.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 12),
                        itemBuilder: (_, i) {
                          final entry = entries[i];
                          final waiting = entry.status == 'WAITING';
                          return AppCard(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Row(children: [
                                Expanded(child: Text(entry.title, style: const TextStyle(fontWeight: FontWeight.w700))),
                                Text(
                                  waiting ? 'Antrean #${entry.position ?? '—'}' : entry.status == 'PROMOTED' ? 'Diajukan' : 'Dibatalkan',
                                  style: TextStyle(color: waiting ? AppColors.goldDeep : AppColors.textSecondary, fontWeight: FontWeight.w700),
                                ),
                              ]),
                              const SizedBox(height: 8),
                              Text('${entry.room.name} · ${fmtDateLong(entry.startTime)} · ${fmtTime(entry.startTime)}–${fmtTime(entry.endTime)} WIB',
                                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 12.5)),
                              if (waiting) ...[
                                const SizedBox(height: 12),
                                OutlinedButton(
                                  onPressed: () => _cancelQueueEntry(entry),
                                  child: const Text('Batalkan antrean'),
                                ),
                              ],
                            ]),
                          );
                        },
                      ),
                    );
                  },
                )
              : AsyncBody<BookingPage>(
            future: _future,
            onRetry: _reload,
            skeleton: const ListSkeleton(count: 5, height: 110),
            builder: (context, page) {
              if (page.items.isEmpty) {
                return EmptyView(
                  icon: Icons.event_note_outlined,
                  title: _status == null ? 'Belum ada peminjaman' : 'Tidak ada data',
                  message: _status == null
                      ? 'Peminjaman yang Anda ajukan akan muncul di sini.'
                      : 'Belum ada peminjaman dengan status ini.',
                  action: _status == null
                      ? FilledButton(
                          style: FilledButton.styleFrom(minimumSize: const Size(180, 48)),
                          onPressed: () => context.read<NavState>().go(2),
                          child: const Text('Ajukan peminjaman'),
                        )
                      : null,
                );
              }
              return RefreshIndicator(
                color: AppColors.goldDeep,
                onRefresh: () async {
                  _reload();
                  await _future.catchError((_) => BookingPage(items: [], summary: BookingSummary({}), total: 0));
                },
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(20, 6, 20, 24),
                  itemCount: page.items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (_, i) => BookingTile(booking: page.items[i], onChanged: () {
                    context.read<RefreshState>().bump();
                  }),
                ),
              );
            },
          ),
        ),
      ]),
    );
  }
}
